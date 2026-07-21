import type { ElementFingerprint } from "@reframe/shared";
import { fingerprintHash } from "@reframe/shared";
import { createHash, randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, open, readFile, realpath, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { CheckpointInput, CheckpointMetadata, HistoryPreflight } from "./history.js";
import type { ProjectStyling } from "./project.js";

export type MappingConfidence = "exact" | "probable" | "ambiguous" | "not-mapped";
export type StylingMode = "vanilla-css" | "react-css" | "css-module" | "tailwind";

export interface WidthEditRequest {
  readonly fingerprint: ElementFingerprint;
  readonly currentWidth: number;
  readonly width: number;
  readonly currentHeight?: number;
  readonly height?: number;
  readonly previewText?: string | null;
  readonly originalText?: string;
  readonly previewStyles?: Readonly<Record<string, string>> | null;
  readonly originalStyles?: Readonly<Record<string, string>>;
  readonly breakpoint?: string | null;
  readonly sharedImpactAccepted?: boolean;
  readonly overlapAccepted?: boolean;
}

export interface MappingCandidate {
  readonly path: string;
  readonly evidence: string;
  readonly line: number;
}

export interface EditPlan {
  readonly relativePath: string;
  readonly range: { readonly start: number; readonly end: number };
  readonly sourceIdentity: string;
  readonly route: string;
  readonly expectedHash: string;
  readonly before: string;
  readonly after: string;
  readonly stylingMode: StylingMode;
  readonly confidence: "exact";
  readonly evidence: string;
  readonly impact: { readonly shared: boolean; readonly locations: readonly string[] };
  readonly component?: { readonly name: string; readonly path: string; readonly line: number };
  readonly allowedChangedFiles: readonly string[];
}

export interface MappingResult {
  readonly confidence: MappingConfidence;
  readonly evidence: string;
  readonly candidates: readonly MappingCandidate[];
  readonly requiresImpactApproval: boolean;
  readonly plan?: EditPlan;
}

export interface EditResult {
  readonly status: "applied" | "rejected" | "rolled-back" | "critical";
  readonly code: string;
  readonly mapping: MappingResult;
  readonly plan?: EditPlan;
  readonly backupPath?: string;
  readonly backupHash?: string;
  readonly mappingMs: number;
  readonly writeMs?: number;
  readonly verificationMs?: number;
  readonly checkpointId?: string;
  readonly visualComplete?: boolean;
}

export interface TransactionOperations {
  readonly writeFile: typeof writeFile;
  readonly rename: typeof rename;
  readonly unlink: typeof unlink;
  readonly rollbackWriteFile: typeof writeFile;
  readonly rollbackRename: typeof rename;
}


export interface SourceEditorOptions {
  readonly projectRoot: string;
  readonly framework?: string;
  readonly styling?: ProjectStyling;
  readonly verificationTimeoutMs?: number;
  readonly verify?: (plan: EditPlan, state?: "apply" | "rollback") => boolean | Promise<boolean>;
  readonly operations?: Partial<TransactionOperations>;
  readonly history?: {
    prepareEdit(plan: EditPlan, request: WidthEditRequest): Promise<HistoryPreflight>;
    createCheckpoint(input: CheckpointInput): Promise<CheckpointMetadata>;
  };
}

const locks = new Map<string, Promise<void>>();
const ignoredDirectories = new Set([".git", "node_modules", "dist", "build", ".next", ".reframe"]);
const sourceExtensions = new Set([".css", ".scss", ".sass", ".jsx", ".tsx", ".js", ".ts", ".html", ".vue", ".svelte"]);

function isSourceFile(name: string): boolean {
  const lower = name.toLowerCase();
  if (lower.endsWith(".blade.php")) return true;
  return sourceExtensions.has(path.extname(lower));
}

const markupExtensions = new Set([".jsx", ".js", ".tsx", ".ts", ".html"]);

function isMarkupSourceFile(file: string): boolean {
  const lower = file.toLowerCase();
  return markupExtensions.has(path.extname(lower)) || lower.endsWith(".blade.php");
}

function hash(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function lineAt(source: string, offset: number): number {
  let line = 1;
  for (let index = 0; index < offset; index += 1) if (source.charCodeAt(index) === 10) line += 1;
  return line;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function within(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

export async function resolveProjectPath(projectRoot: string, relativePath: string): Promise<string> {
  if (!relativePath || relativePath.includes("\0") || relativePath.includes("%") || path.isAbsolute(relativePath) || /^[a-z]:/i.test(relativePath) || /^[/\\]{2}/.test(relativePath) || relativePath.split(/[\\/]/).includes("..")) throw new Error("PATH_OUTSIDE_ROOT");
  const device = path.basename(relativePath).split(".")[0]?.toUpperCase();
  if (["CON", "PRN", "AUX", "NUL", "COM1", "LPT1"].includes(device ?? "")) throw new Error("PATH_OUTSIDE_ROOT");
  const root = await realpath(projectRoot);
  const candidate = path.resolve(root, relativePath);
  if (!within(root, candidate)) throw new Error("PATH_OUTSIDE_ROOT");
  const actual = await realpath(candidate);
  if (!within(root, actual)) throw new Error("PATH_OUTSIDE_ROOT");
  return actual;
}

async function files(root: string): Promise<string[]> {
  const output: string[] = [];
  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (entry.isSymbolicLink()) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name)) await visit(absolute);
      } else if (isSourceFile(entry.name)) output.push(absolute);
      if (output.length > 5_000) throw new Error("SOURCE_LIMIT_EXCEEDED");
    }
  }
  await visit(root);
  return output;
}

interface CssRule {
  selector: string;
  atRule: string | null;
  bodyStart: number;
  bodyEnd: number;
  declarations: Array<{ property: string; value: string; start: number; end: number }>;
}

function matchingBrace(source: string, opening: number, end: number): number {
  let depth = 1;
  let quote = "";
  for (let index = opening + 1; index < end; index += 1) {
    const current = source[index]!;
    const next = source[index + 1];
    if (quote) {
      if (current === "\\") index += 1;
      else if (current === quote) quote = "";
    } else if (current === '"' || current === "'") quote = current;
    else if (current === "/" && next === "*") { index = source.indexOf("*/", index + 2); if (index < 0) return -1; index += 1; }
    else if (current === "{") depth += 1;
    else if (current === "}" && --depth === 0) return index;
  }
  return -1;
}

function nextBrace(source: string, start: number, end: number): number {
  let quote = "";
  for (let index = start; index < end; index += 1) {
    const current = source[index]!;
    const next = source[index + 1];
    if (quote) {
      if (current === "\\") index += 1;
      else if (current === quote) quote = "";
    } else if (current === '"' || current === "'") quote = current;
    else if (current === "/" && next === "*") { const close = source.indexOf("*/", index + 2); if (close < 0) return -1; index = close + 1; }
    else if (current === "{") return index;
  }
  return -1;
}

function declarations(source: string, start: number, end: number): CssRule["declarations"] {
  const output: CssRule["declarations"] = [];
  let segment = start;
  let quote = "";
  let parentheses = 0;
  const accept = (finish: number) => {
    const text = source.slice(segment, finish);
    let colon = -1;
    let localQuote = "";
    for (let index = 0; index < text.length; index += 1) {
      const current = text[index]!;
      const next = text[index + 1];
      if (localQuote) { if (current === "\\") index += 1; else if (current === localQuote) localQuote = ""; }
      else if (current === '"' || current === "'") localQuote = current;
      else if (current === "/" && next === "*") { const close = text.indexOf("*/", index + 2); if (close < 0) return; index = close + 1; }
      else if (current === ":") { colon = index; break; }
    }
    if (colon < 0) return;
    const property = text.slice(0, colon).replace(/\/\*[\s\S]*?\*\//g, "").trim().toLowerCase();
    const rawValue = text.slice(colon + 1);
    const leading = rawValue.search(/\S/);
    if (!property || leading < 0) return;
    const valueStart = segment + colon + 1 + leading;
    const value = rawValue.slice(leading).trimEnd();
    output.push({ property, value, start: valueStart, end: valueStart + value.length });
  };
  for (let index = start; index <= end; index += 1) {
    const current = source[index] ?? ";";
    const next = source[index + 1];
    if (quote) { if (current === "\\") index += 1; else if (current === quote) quote = ""; }
    else if (current === '"' || current === "'") quote = current;
    else if (current === "/" && next === "*") { const close = source.indexOf("*/", index + 2); if (close < 0) break; index = close + 1; }
    else if (current === "(") parentheses += 1;
    else if (current === ")") parentheses = Math.max(0, parentheses - 1);
    else if (current === ";" && parentheses === 0) { accept(index); segment = index + 1; }
  }
  return output;
}

function parseCss(source: string): CssRule[] {
  const output: CssRule[] = [];
  const parse = (start: number, end: number, atRule: string | null) => {
    let cursor = start;
    while (cursor < end) {
      const opening = nextBrace(source, cursor, end);
      if (opening < 0) return;
      const closing = matchingBrace(source, opening, end);
      if (closing < 0) return;
      const prelude = source.slice(cursor, opening).replace(/\/\*[\s\S]*?\*\//g, "").trim();
      if (prelude.startsWith("@media") || prelude.startsWith("@supports") || prelude.startsWith("@container")) parse(opening + 1, closing, prelude);
      else if (!prelude.startsWith("@")) output.push({ selector: prelude, atRule, bodyStart: opening + 1, bodyEnd: closing, declarations: declarations(source, opening + 1, closing) });
      cursor = closing + 1;
    }
  };
  parse(0, source.length, null);
  return output;
}

function styleRules(source: string, html: boolean): CssRule[] {
  if (!html) return parseCss(source);
  return [...source.matchAll(/<style(?:\s[^<>]*)?>([\s\S]*?)<\/style\s*>/gi)].flatMap((match) => {
    const block = match[1] ?? "";
    const offset = match.index + match[0].indexOf(block);
    return parseCss(block).map((rule) => ({ ...rule, bodyStart: rule.bodyStart + offset, bodyEnd: rule.bodyEnd + offset, declarations: rule.declarations.map((item) => ({ ...item, start: item.start + offset, end: item.end + offset })) }));
  });
}

function simpleSelectorSpecificity(selector: string, fingerprint: ElementFingerprint): { score: number; usesId: boolean } | null {
  const match = /^([a-z][\w-]*)?(#[\w-]+)?((?:\.[\w-]+)*)$/i.exec(selector.trim());
  if (!match || (!match[1] && !match[2] && !match[3])) return null;
  if (match[1] && match[1].toLowerCase() !== fingerprint.tag.toLowerCase()) return null;
  const id = match[2]?.slice(1);
  if (id && id !== fingerprint.id) return null;
  const classes = [...(match[3] ?? "").matchAll(/\.([\w-]+)/g)].map((item) => item[1]!);
  if (classes.some((name) => !fingerprint.classes.includes(name))) return null;
  return { score: (id ? 100 : 0) + classes.length * 10 + (match[1] ? 1 : 0), usesId: Boolean(id) };
}

function selectorMatches(selector: string, fingerprint: ElementFingerprint, moduleClass?: string): boolean {
  if (moduleClass) return new RegExp(`(^|[^\\w-])\\.${escapeRegExp(moduleClass)}(?![\\w-])`).test(selector);
  if (fingerprint.id && new RegExp(`(^|[^\\w-])#${escapeRegExp(fingerprint.id)}(?![\\w-])`).test(selector)) return true;
  return fingerprint.classes.some((name) => new RegExp(`(^|[^\\w-])\\.${escapeRegExp(name)}(?![\\w-])`).test(selector));
}

function ruleDimensionAffinity(rule: CssRule, request: WidthEditRequest): number {
  let affinity = 0;
  for (const declaration of rule.declarations) {
    if (declaration.property === "width") {
      const px = cssLengthPx(declaration.value);
      if (px !== null && Math.abs(px - request.currentWidth) <= 1) affinity += 100;
    }
    if (declaration.property === "height" && request.currentHeight !== undefined) {
      const px = cssLengthPx(declaration.value);
      if (px !== null && Math.abs(px - request.currentHeight) <= 1) affinity += 100;
    }
  }
  return affinity;
}

interface JsxNode {
  source: string;
  start: number;
  end: number;
  tag: string;
  component: string | null;
  componentProps: string[];
  instanceProp: string | null;
  id: string | null;
  classLiteral: { value: string; start: number; end: number } | null;
  classExpression: string | null;
}

function jsxNodes(source: string): JsxNode[] {
  const output: JsxNode[] = [];
  const components: Array<{ name: string; start: number; end: number; props: string[]; instanceProp: string | null }> = [];
  const declarations = /(?:export\s+(?:default\s+)?)?function\s+([A-Z][\w$]*)\s*\(([^)]*)\)\s*\{/g;
  for (const match of source.matchAll(declarations)) {
    const opening = match.index + match[0].lastIndexOf("{");
    const closing = matchingBrace(source, opening, source.length);
    const props = /^\s*\{([\s\S]*)\}\s*$/.exec(match[2] ?? "")?.[1]
      ?.split(",")
      .map((entry) => /^(?:\.\.\.)?([A-Za-z_$][\w$]*)(?:\s*:\s*([A-Za-z_$][\w$]*))?/.exec(entry.trim()))
      .filter((entry): entry is RegExpExecArray => Boolean(entry))
      .map((entry) => ({ name: entry[1]!, local: entry[2] ?? entry[1]! })) ?? [];
    const identity = props.find(({ name }) => name === "id") ?? null;
    if (closing >= 0) components.push({ name: match[1]!, start: opening, end: closing, props: props.map(({ name }) => name), instanceProp: identity?.local ?? null });
  }
  for (let start = 0; start < source.length; start += 1) {
    if (source[start] !== "<" || !/[A-Za-z]/.test(source[start + 1] ?? "")) continue;
    let quote = "";
    let braces = 0;
    let end = start + 1;
    for (; end < source.length; end += 1) {
      const current = source[end]!;
      if (quote) { if (current === "\\") end += 1; else if (current === quote) quote = ""; }
      else if (current === '"' || current === "'") quote = current;
      else if (current === "{") braces += 1;
      else if (current === "}") braces = Math.max(0, braces - 1);
      else if (current === ">" && braces === 0) break;
    }
    if (end >= source.length) break;
    const node = source.slice(start, end + 1);
    const tag = /^<([A-Za-z][\w.$-]*)/.exec(node)?.[1] ?? "";
    const component = components.find((owner) => start > owner.start && start < owner.end)?.name ?? null;
    const owner = components.find((candidate) => candidate.name === component);
    const id = /\bid\s*=\s*["']([^"']+)["']/.exec(node)?.[1] ?? null;
    const literal = /\bclassName\s*=\s*(["'])([\s\S]*?)\1/.exec(node) ?? /\bclass\s*=\s*(["'])([\s\S]*?)\1/.exec(node);
    const expression = /\bclassName\s*=\s*\{([\s\S]*?)\}/.exec(node)?.[1]?.trim() ?? null;
    const literalValue = literal?.[2] ?? "";
    const literalOffset = literal ? start + literal.index + literal[0].indexOf(literalValue) : -1;
    output.push({ source: node, start, end: end + 1, tag, component, componentProps: owner?.props ?? [], instanceProp: owner?.instanceProp ?? null, id, classLiteral: literal ? { value: literalValue, start: literalOffset, end: literalOffset + literalValue.length } : null, classExpression: expression });
    start = end;
  }
  return output;
}

function hasStaticClass(node: JsxNode, name: string): boolean {
  if (node.classLiteral?.value.split(/\s+/).includes(name)) return true;
  if (!node.classExpression) return false;
  const staticText = node.classExpression.replace(/\$\{[\s\S]*?\}/g, " ");
  return staticText.split(/[^\w-]+/).includes(name) || node.classExpression.endsWith(`.${name}`);
}

function tailwindToken(width: number): string {
  if (width === 320) return "w-80";
  if (width === 384) return "w-96";
  return `w-[${width}px]`;
}

function tailwindHeightToken(height: number): string {
  if (height === 320) return "h-80";
  if (height === 384) return "h-96";
  return `h-[${height}px]`;
}

const tailwindWidthPattern = /^(?:[\w-]+:)*w-(?:\d+|full|\[.+\])$/;
const tailwindHeightPattern = /^(?:[\w-]+:)*h-(?:\d+|full|\[.+\])$/;
const tailwindTextColorPattern = /^(?:[\w-]+:)*text-(?:\w+(?:-\d+)?|\[[^\]]+\])$/;

function upsertTailwindUtility(classes: string, pattern: RegExp, token: string): string {
  const tokens = classes.split(/\s+/).filter(Boolean);
  const index = tokens.findIndex((entry) => pattern.test(entry));
  if (index >= 0) tokens[index] = token;
  else tokens.push(token);
  return tokens.join(" ");
}

function tailwindTextColorToken(color: string): string {
  return `text-[${color.replace(/\s+/g, "")}]`;
}

function injectClassNameIntoOpeningTag(openingTag: string, className: string): string {
  const classMatch = /\bclassName\s*=\s*(["'])([^"']*)\1/i.exec(openingTag) ?? /\bclass\s*=\s*(["'])([^"']*)\1/i.exec(openingTag);
  if (classMatch) {
    const existing = classMatch[2] ?? "";
    if (existing.split(/\s+/).filter(Boolean).includes(className)) return openingTag;
    const quote = classMatch[1]!;
    const attr = classMatch[0].startsWith("className") ? "className" : "class";
    const replacement = `${attr}=${quote}${existing.trimEnd()} ${className}${quote}`;
    return `${openingTag.slice(0, classMatch.index)}${replacement}${openingTag.slice(classMatch.index! + classMatch[0].length)}`;
  }
  const insertAt = openingTag.lastIndexOf(">");
  return `${openingTag.slice(0, insertAt)} className="${className}"${openingTag.slice(insertAt)}`;
}

async function projectUsesTailwind(root: string, styling?: ProjectStyling): Promise<boolean> {
  if (styling === "tailwind") return true;
  if (styling && styling !== "unknown") return false;
  for (const name of ["tailwind.config.js", "tailwind.config.ts", "tailwind.config.cjs", "tailwind.config.mjs"]) {
    try { await stat(path.join(root, name)); return true; } catch { /* ponytail: try next config name */ }
  }
  return false;
}

function findUniqueJsxTarget(jsx: Map<string, { text: string; nodes: JsxNode[] }>, fingerprint: ElementFingerprint): { file: string; text: string; node: JsxNode } | null {
  const exactNodes = [...jsx.entries()].flatMap(([file, parsed]) => parsed.nodes.filter((node) => node.id === fingerprint.id).map((node) => ({ file, text: parsed.text, node })));
  const inferredNodes = [...jsx.entries()].flatMap(([file, parsed]) => parsed.nodes.filter((node) => node.tag.toLowerCase() === fingerprint.tag && fingerprint.classes.some((name) => hasStaticClass(node, name))).map((node) => ({ file, text: parsed.text, node })));
  const componentUse = exactNodes.some(({ node }) => /^[A-Z]/.test(node.tag));
  const mappedNodes = componentUse && inferredNodes.length === 1 ? inferredNodes : exactNodes.length ? exactNodes : inferredNodes.length === 1 ? inferredNodes : [];
  if (mappedNodes.length !== 1) return null;
  const target = mappedNodes[0]!;
  if (target.node.classExpression && !/^[A-Za-z_$][\w$]*\.[A-Za-z_$][\w$]*$/.test(target.node.classExpression)) return null;
  return target;
}

async function reactCssTarget(root: string, sourceFile: string, source: string): Promise<string | null> {
  const imported = [...source.matchAll(/\bimport\s+(?:[^"']+\s+from\s+)?["']([^"']+\.css)["']/gi)]
    .map((match) => match[1]!)
    .filter((value) => value.startsWith(".") && !/\.module\.css$/i.test(value))
    .map((value) => path.resolve(path.dirname(sourceFile), value));
  const candidates = imported.length === 1
    ? imported
    : (await files(root)).filter((file) => /\.css$/i.test(file) && !/\.module\.css$/i.test(file));
  if (candidates.length !== 1 || !within(root, candidates[0]!)) return null;
  try { await stat(candidates[0]!); return candidates[0]!; } catch { return null; }
}

function cssLengthPx(value: string): number | null {
  const trimmed = value.trim();
  const direct = /^(\d+(?:\.\d+)?)px(?:\s*!important)?$/i.exec(trimmed);
  if (direct) return Number.parseFloat(direct[1]!);
  const minPx = /^min\(\s*(\d+(?:\.\d+)?)px\b/i.exec(trimmed);
  if (minPx) return Number.parseFloat(minPx[1]!);
  return null;
}

function cssWidthDeclaration(declaration: { property: string; value: string }): boolean {
  return declaration.property === "width" && cssLengthPx(declaration.value) !== null;
}

function cssHeightDeclaration(declaration: { property: string; value: string }): boolean {
  return declaration.property === "height" && cssLengthPx(declaration.value) !== null;
}

function validDimension(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && Number.isInteger(value) && value >= 1 && value <= 10_000;
}

function dimensionChanged(current: number | undefined, next: number | undefined): boolean {
  if (typeof current !== "number" || !Number.isFinite(current) || !validDimension(next)) return false;
  return Math.round(next) !== Math.round(current);
}

function frozen<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) frozen(child);
  }
  return value;
}

function validWidth(width: number): boolean {
  return Number.isFinite(width) && Number.isInteger(width) && width >= 1 && width <= 10_000;
}

export function promotedClassName(fpHash: string): string {
  return `reframe-mapped-${fpHash}`;
}

function promotedSelector(fingerprint: ElementFingerprint, fpHash: string): { selector: string; className?: string } {
  if (fingerprint.id) return { selector: `#${fingerprint.id}` };
  const className = promotedClassName(fpHash);
  return { selector: `.${className}`, className };
}

function injectClassIntoOpeningTag(openingTag: string, className: string): string {
  const classMatch = /\bclass\s*=\s*(["'])([^"']*)\1/i.exec(openingTag);
  if (classMatch) {
    const existing = classMatch[2] ?? "";
    if (existing.split(/\s+/).filter(Boolean).includes(className)) return openingTag;
    const quote = classMatch[1]!;
    const replacement = `class=${quote}${existing.trimEnd()} ${className}${quote}`;
    return `${openingTag.slice(0, classMatch.index)}${replacement}${openingTag.slice(classMatch.index! + classMatch[0].length)}`;
  }
  const insertAt = openingTag.lastIndexOf(">");
  return `${openingTag.slice(0, insertAt)} class="${className}"${openingTag.slice(insertAt)}`;
}

function upsertPromotedCssRule(css: string, selector: string, styles: Record<string, string>): string {
  const rulePattern = new RegExp(`${escapeRegExp(selector)}\\s*\\{[^}]*\\}`, "g");
  const block = Object.entries(styles).map(([property, value]) => `  ${property}: ${value};`).join("\n");
  const rule = `${selector} {\n${block}\n}`;
  if (rulePattern.test(css)) return css.replace(rulePattern, rule);
  const trimmed = css.trimEnd();
  return `${trimmed}${trimmed ? "\n\n" : ""}${rule}\n`;
}

interface VanillaHtmlTarget {
  readonly relativePath: string;
  readonly matchIndex: number;
  readonly openingTag: string;
  readonly innerStart: number;
  readonly innerEnd: number;
}

function findVanillaHtmlTarget(html: string, relativePath: string, fingerprint: ElementFingerprint, originalText?: string): VanillaHtmlTarget | null {
  const locate = (pattern: RegExp): VanillaHtmlTarget | null => {
    const match = pattern.exec(html);
    if (!match) return null;
    const openingTag = match[0];
    const innerStart = match.index + openingTag.length;
    const closePattern = new RegExp(`</${escapeRegExp(fingerprint.tag)}>`, "i");
    const close = closePattern.exec(html.slice(innerStart));
    const innerEnd = close ? innerStart + close.index : innerStart;
    return { relativePath, matchIndex: match.index, openingTag, innerStart, innerEnd };
  };
  if (fingerprint.id) {
    return locate(new RegExp(`<${escapeRegExp(fingerprint.tag)}\\b[^>]*\\bid\\s*=\\s*["']${escapeRegExp(fingerprint.id)}["'][^>]*>`, "i"));
  }
  if (fingerprint.classes.length) {
    const classChecks = fingerprint.classes.map((name) => `(?=[^>]*\\bclass\\s*=\\s*["'][^"']*\\b${escapeRegExp(name)}\\b)`).join("");
    const matches = [...html.matchAll(new RegExp(`<${escapeRegExp(fingerprint.tag)}\\b${classChecks}[^>]*>`, "gi"))];
    if (matches.length === 1) {
      const match = matches[0]!;
      const openingTag = match[0];
      const innerStart = match.index! + openingTag.length;
      const closePattern = new RegExp(`</${escapeRegExp(fingerprint.tag)}>`, "i");
      const close = closePattern.exec(html.slice(innerStart));
      const innerEnd = close ? innerStart + close.index : innerStart;
      return { relativePath, matchIndex: match.index!, openingTag, innerStart, innerEnd };
    }
  }
  if (originalText) {
    const escaped = escapeRegExp(originalText.trim());
    const matches = [...html.matchAll(new RegExp(`<${escapeRegExp(fingerprint.tag)}\\b[^>]*>\\s*${escaped}\\s*</${escapeRegExp(fingerprint.tag)}>`, "gi"))];
    if (matches.length === 1) {
      const match = matches[0]!;
      const openingEnd = match[0].indexOf(">") + 1;
      return {
        relativePath,
        matchIndex: match.index!,
        openingTag: match[0].slice(0, openingEnd),
        innerStart: match.index! + openingEnd,
        innerEnd: match.index! + match[0].length - `</${fingerprint.tag}>`.length,
      };
    }
  }
  return null;
}

type VanillaStyleTarget =
  | { kind: "file"; relativePath: string }
  | { kind: "inline"; relativePath: string; styleStart: number; styleEnd: number; bodyStart: number; bodyEnd: number };

function resolveVanillaStyleTarget(htmlPath: string, html: string): VanillaStyleTarget {
  const linked = [...html.matchAll(/<link\b[^>]*\brel\s*=\s*["']stylesheet["'][^>]*\bhref\s*=\s*["']([^"']+\.css)["']/gi)]
    .map((match) => match[1]!.replace(/^\//, ""))
    .find((href) => !href.startsWith("http"));
  if (linked) return { kind: "file", relativePath: linked };
  const inline = /<style(?:\s[^>]*)?>([\s\S]*?)<\/style\s*>/i.exec(html);
  if (inline) {
    const body = inline[1] ?? "";
    const bodyStart = inline.index + inline[0].indexOf(body);
    return { kind: "inline", relativePath: htmlPath, styleStart: inline.index, styleEnd: inline.index + inline[0].length, bodyStart, bodyEnd: bodyStart + body.length };
  }
  const vite = /@vite\s*\(\s*(?:\[\s*)?["']([^"']+\.css)["']/i.exec(html)?.[1];
  if (vite) return { kind: "file", relativePath: vite.replace(/^\//, "") };
  return { kind: "file", relativePath: "style.css" };
}

function ensureStylesheetLink(html: string): string {
  if (/<link\b[^>]*\brel\s*=\s*["']stylesheet["']/i.test(html)) return html;
  const link = '<link rel="stylesheet" href="style.css" />\n';
  const headClose = /<\/head>/i.exec(html);
  if (headClose) return `${html.slice(0, headClose.index)}    ${link}${html.slice(headClose.index)}`;
  return `${link}${html}`;
}

export function injectVanillaSourceMetadata(html: string): string {
  return html.replace(/<([a-z][\w:-]*)(\s[^<>]*?\bid=(['"])([^'"<>]+)\3[^<>]*?)>/gi, (whole, tag: string, attributes: string, _quote: string, id: string) => attributes.includes("data-reframe-source-id") ? whole : `<${tag}${attributes} data-reframe-source-id="${id.replace(/[&"]/g, "")}">`);
}

export function injectReactViteSourceMetadata(transformed: string, source: string, relativePath: string): string {
  if (transformed.includes('"data-reframe-component"')) return transformed;
  const nodes = jsxNodes(source).filter((node) => node.component && /^[a-z][\w:-]*$/.test(node.tag));
  if (!nodes.length) return transformed;
  let nodeIndex = 0;
  return transformed.replace(/\bjsxDEV\(\s*(["'])([a-z][\w:-]*)\1\s*,\s*\{/g, (opening, _quote: string, tag: string) => {
    while (nodeIndex < nodes.length && nodes[nodeIndex]!.tag !== tag) nodeIndex += 1;
    const node = nodes[nodeIndex++];
    if (!node) return opening;
    const component = node.component!;
    const line = lineAt(source, node.start);
    const instance = node.instanceProp
      ? `${JSON.stringify(component)} + ":" + String(${node.instanceProp})`
      : JSON.stringify(`${component}:${line}`);
    const metadata = [
      `"data-reframe-component":${JSON.stringify(component)}`,
      `"data-reframe-source":${JSON.stringify(`${relativePath}:${line}`)}`,
      `"data-reframe-range":${JSON.stringify(`${node.start}:${node.end}`)}`,
      `"data-reframe-instance":${instance}`,
      `"data-reframe-props":${JSON.stringify(node.componentProps.join(","))}`,
    ].join(",");
    return `${opening}${metadata},`;
  });
}

export function createSourceEditor(options: SourceEditorOptions) {
  const projectRoot = path.resolve(options.projectRoot);
  const verificationTimeoutMs = options.verificationTimeoutMs ?? 10_000;
  const operations: TransactionOperations = { writeFile, rename, unlink, rollbackWriteFile: writeFile, rollbackRename: rename, ...options.operations };

  async function injectReactMetadata(relativePath: string, transformed: string): Promise<string> {
    if (!/\.(?:jsx|js|tsx|ts)$/i.test(relativePath)) return transformed;
    const absolute = await resolveProjectPath(projectRoot, relativePath);
    return injectReactViteSourceMetadata(transformed, await readFile(absolute, "utf8"), relativePath.split(path.sep).join("/"));
  }

  async function mapWidth(request: WidthEditRequest): Promise<MappingResult> {
    if (!validWidth(request.width) || !Number.isFinite(request.currentWidth) || request.currentWidth <= 0) return frozen({ confidence: "not-mapped", evidence: "WIDTH_INVALID", candidates: [], requiresImpactApproval: false });
    const root = await realpath(projectRoot);
    const allFiles = await files(root);
    const jsx = new Map<string, { text: string; nodes: JsxNode[] }>();
    for (const file of allFiles.filter((file) => isMarkupSourceFile(file))) {
      const text = await readFile(file, "utf8");
      jsx.set(file, { text, nodes: jsxNodes(text) });
    }

    const exactNodes = [...jsx.entries()].flatMap(([file, parsed]) => parsed.nodes.filter((node) => node.id === request.fingerprint.id).map((node) => ({ file, text: parsed.text, node })));
    const inferredNodes = [...jsx.entries()].flatMap(([file, parsed]) => parsed.nodes.filter((node) => node.tag.toLowerCase() === request.fingerprint.tag && request.fingerprint.classes.some((name) => hasStaticClass(node, name))).map((node) => ({ file, text: parsed.text, node })));
    const componentUse = exactNodes.some(({ node }) => /^[A-Z]/.test(node.tag));
    const mappedNodes = componentUse && inferredNodes.length === 1 ? inferredNodes : exactNodes.length ? exactNodes : inferredNodes.length === 1 ? inferredNodes : [];
    const componentNode = mappedNodes.length === 1 && mappedNodes[0]!.node.component ? mappedNodes[0] : undefined;
    const component = componentNode ? { name: componentNode.node.component!, path: path.relative(root, componentNode.file).split(path.sep).join("/"), line: lineAt(componentNode.text, componentNode.node.start) } : undefined;
    if (exactNodes.some(({ node }) => node.classExpression && !/^[A-Za-z_$][\w$]*\.[A-Za-z_$][\w$]*$/.test(node.classExpression))) return frozen({ confidence: "not-mapped", evidence: "Dynamic className is not safely editable", candidates: exactNodes.map(({ file, node }) => ({ path: path.relative(root, file).split(path.sep).join("/"), evidence: node.source.slice(0, 160), line: lineAt(jsx.get(file)!.text, node.start) })), requiresImpactApproval: false });

    for (const { file, text, node } of mappedNodes) {
      if (node.classLiteral) {
        const tokens = node.classLiteral.value.split(/\s+/).filter(Boolean);
        const widths = tokens.map((token, index) => ({ token, index })).filter(({ token }) => /^(?:[\w-]+:)*w-(?:\d+|full|\[.+\])$/.test(token));
        if (widths.length) {
          const requestedPrefix = request.breakpoint ? `${request.breakpoint}:` : "";
          const matching = request.breakpoint === undefined || request.breakpoint === null ? widths : widths.filter(({ token }) => token.startsWith(requestedPrefix));
          if (matching.length !== 1 || (widths.length > 1 && request.breakpoint === undefined)) return frozen({ confidence: "ambiguous", evidence: "Choose the responsive width variant", candidates: widths.map(({ token }) => ({ path: path.relative(root, file).split(path.sep).join("/"), evidence: token, line: lineAt(text, node.start) })), requiresImpactApproval: false });
          const selected = matching[0]!;
          const prefix = selected.token.includes(":") ? selected.token.slice(0, selected.token.lastIndexOf(":") + 1) : "";
          const replacement = prefix + tailwindToken(request.width);
          let tokenStart = node.classLiteral.start;
          for (const token of tokens.slice(0, selected.index)) tokenStart += token.length + 1;
          const bytes = await readFile(file);
          const relativePath = path.relative(root, file).split(path.sep).join("/");
          return frozen({ confidence: "exact", evidence: component ? `${component.name} at ${component.path}:${component.line}; static Tailwind token ${selected.token}` : `Static Tailwind token ${selected.token}`, candidates: component ? [{ path: component.path, evidence: `React component ${component.name}`, line: component.line }, { path: relativePath, evidence: selected.token, line: lineAt(text, tokenStart) }] : [{ path: relativePath, evidence: selected.token, line: lineAt(text, tokenStart) }], requiresImpactApproval: false, plan: { relativePath, range: { start: tokenStart, end: tokenStart + selected.token.length }, sourceIdentity: `${component ? `component:${component.name}:${component.line}|` : ""}jsx:${lineAt(text, node.start)}:${selected.token}`, route: request.fingerprint.route, expectedHash: hash(bytes), before: selected.token, after: replacement, stylingMode: "tailwind", confidence: "exact", evidence: node.source.slice(0, 160), impact: { shared: false, locations: [relativePath] }, component, allowedChangedFiles: [relativePath] } });
        }
      }
    }

    let moduleClass: { file: string; name: string; locations: string[] } | undefined;
    for (const { file, text, node } of mappedNodes) {
      if (!node.classExpression || !/^[A-Za-z_$][\w$]*\.[A-Za-z_$][\w$]*$/.test(node.classExpression)) continue;
      const [binding, name] = node.classExpression.split(".") as [string, string];
      const imported = new RegExp(`import\\s+${escapeRegExp(binding)}\\s+from\\s+["'](.+?\\.module\\.css)["']`).exec(text)?.[1];
      if (imported) moduleClass = { file: path.resolve(path.dirname(file), imported), name, locations: [path.relative(root, file).split(path.sep).join("/")] };
    }

    const cssCandidates: Array<{ file: string; text: string; rule: CssRule; declaration: CssRule["declarations"][number]; mode: StylingMode }> = [];
    const missingWidthCandidates: Array<{ file: string; text: string; rule: CssRule; score: number; usesId: boolean }> = [];
    const cssFiles = moduleClass ? [moduleClass.file] : allFiles.filter((file) => path.extname(file).toLowerCase() === ".css" || (options.framework === "vanilla" && path.extname(file).toLowerCase() === ".html"));
    for (const file of cssFiles) {
      const text = await readFile(file, "utf8");
      for (const rule of styleRules(text, path.extname(file).toLowerCase() === ".html")) {
        if (!selectorMatches(rule.selector, request.fingerprint, moduleClass?.name)) continue;
        for (const declaration of rule.declarations.filter(cssWidthDeclaration)) cssCandidates.push({ file, text, rule, declaration, mode: moduleClass ? "css-module" : options.framework === "vanilla" ? "vanilla-css" : "react-css" });
        const specificity = options.framework === "vanilla" ? simpleSelectorSpecificity(rule.selector, request.fingerprint) : null;
        if (specificity && !rule.declarations.some(({ property }) => property === "width")) missingWidthCandidates.push({ file, text, rule, ...specificity });
      }
    }
    const currentMatches = cssCandidates.filter(({ declaration }) => { const px = cssLengthPx(declaration.value); return px !== null && Math.abs(px - request.currentWidth) <= 1; });
    const styleCandidates = (currentMatches.length ? currentMatches : cssCandidates).map(({ file, text, rule, declaration }) => ({ path: path.relative(root, file).split(path.sep).join("/"), evidence: `${rule.selector} { width: ${declaration.value} }${rule.atRule ? ` in ${rule.atRule}` : ""}`, line: lineAt(text, declaration.start) }));
    const candidates = component ? [{ path: component.path, evidence: `React component ${component.name}`, line: component.line }, ...styleCandidates] : styleCandidates;
    const oneFile = new Set(cssCandidates.map(({ file }) => file)).size === 1;
    let chosen = cssCandidates.length === 1 && cssCandidates[0]!.rule.atRule === null ? cssCandidates[0] : oneFile && currentMatches.length === 1 && cssCandidates.every(({ rule }) => rule.atRule === null) ? currentMatches[0] : undefined;
    if (!chosen && !cssCandidates.length && missingWidthCandidates.length) {
      const score = Math.max(...missingWidthCandidates.map((candidate) => candidate.score));
      const best = missingWidthCandidates.filter((candidate) => candidate.score === score);
      const insertion = best.length === 1 && best[0]!.rule.atRule === null ? best[0] : undefined;
      const insertionCandidates = best.map(({ file, text, rule }) => ({ path: path.relative(root, file).split(path.sep).join("/"), evidence: `${rule.selector} { no width declaration }${rule.atRule ? ` in ${rule.atRule}` : ""}`, line: lineAt(text, rule.bodyStart) }));
      if (!insertion) return frozen({ confidence: "ambiguous", evidence: "Multiple or responsive style owners remain", candidates: insertionCandidates, requiresImpactApproval: false });
      const shared = !insertion.usesId;
      if (shared && !request.sharedImpactAccepted) return frozen({ confidence: "probable", evidence: `Style owner ${insertion.rule.selector} may affect every matching element`, candidates: insertionCandidates, requiresImpactApproval: true });
      let start = insertion.rule.bodyEnd;
      while (start > insertion.rule.bodyStart && /\s/.test(insertion.text[start - 1]!)) start -= 1;
      const before = insertion.text.slice(start, insertion.rule.bodyEnd);
      const body = insertion.text.slice(insertion.rule.bodyStart, start).trimEnd();
      const indent = /\n([ \t]+)\S/.exec(insertion.text.slice(insertion.rule.bodyStart, insertion.rule.bodyEnd))?.[1] ?? "  ";
      const after = `${body && !body.endsWith(";") ? ";" : ""}\n${indent}width: ${request.width}px;${before}`;
      const bytes = await readFile(insertion.file);
      const relativePath = path.relative(root, insertion.file).split(path.sep).join("/");
      const evidence = `Added width to existing style owner ${insertion.rule.selector}`;
      return frozen({ confidence: "exact", evidence, candidates: insertionCandidates, requiresImpactApproval: false, plan: { relativePath, range: { start, end: insertion.rule.bodyEnd }, sourceIdentity: `css:${lineAt(insertion.text, insertion.rule.bodyStart)}:${insertion.rule.selector}:new-width`, route: request.fingerprint.route, expectedHash: hash(bytes), before, after, stylingMode: "vanilla-css", confidence: "exact", evidence, impact: { shared, locations: insertionCandidates.map(({ path: candidatePath, line }) => `${candidatePath}:${line}`) }, allowedChangedFiles: [relativePath] } });
    }
    if (!chosen) return frozen({ confidence: cssCandidates.length ? "ambiguous" : "not-mapped", evidence: cssCandidates.length ? "Multiple or responsive width owners remain" : "No unique static style owner found", candidates, requiresImpactApproval: false });

    const selectorClass = /^\s*\.([\w-]+)\s*$/.exec(chosen.rule.selector)?.[1];
    const classLocations = selectorClass ? [...jsx.entries()].flatMap(([file, parsed]) => parsed.nodes.filter((node) => hasStaticClass(node, selectorClass)).map((node) => `${path.relative(root, file).split(path.sep).join("/")}:${lineAt(parsed.text, node.start)}`)) : [];
    const componentLocations = component && selectorClass && componentNode && hasStaticClass(componentNode.node, selectorClass) ? [...jsx.entries()].flatMap(([file, parsed]) => parsed.nodes.filter((node) => node.tag === component.name).map((node) => `${path.relative(root, file).split(path.sep).join("/")}:${lineAt(parsed.text, node.start)}${/\.map\s*\([\s\S]{0,400}$/.test(parsed.text.slice(Math.max(0, node.start - 400), node.start)) ? " (collection)" : ""}`)) : [];
    const collection = componentLocations.some((location) => location.endsWith("(collection)"));
    const reuseLocations = componentLocations.length ? componentLocations : classLocations;
    const shared = classLocations.length > 1 || componentLocations.length > 1 || collection;
    if (shared && !request.sharedImpactAccepted) return frozen({ confidence: "probable", evidence: `${component ? `${component.name} component/style owner` : "Width owner"} is reused at ${collection && componentLocations.length === 1 ? "multiple rendered instances" : `${reuseLocations.length} source locations`}`, candidates, requiresImpactApproval: true });
    const needsCompoundSelector = options.framework === "vanilla" && dimensionChanged(request.currentWidth, request.width) && request.fingerprint.id && request.fingerprint.parent?.id && chosen.rule.selector.trim() === `#${request.fingerprint.id}` && styleRules(chosen.text, false).some((rule) => {
      if (rule.selector.trim() === `#${request.fingerprint.id}`) return false;
      if (!rule.selector.includes(`#${request.fingerprint.parent!.id}`)) return false;
      const declaration = rule.declarations.find(cssWidthDeclaration);
      if (!declaration) return false;
      const px = cssLengthPx(declaration.value);
      return px !== null && Math.abs(px - request.currentWidth) <= 1;
    });
    if (needsCompoundSelector) {
      const compoundSelector = `#${request.fingerprint.parent!.id} #${request.fingerprint.id}`;
      const compoundRule = styleRules(chosen.text, false).find((rule) => rule.selector.trim() === compoundSelector);
      if (compoundRule) {
        const declaration = compoundRule.declarations.find(cssWidthDeclaration);
        if (declaration) chosen = { ...chosen, rule: compoundRule, declaration };
      } else {
        const relativePath = path.relative(root, chosen.file).split(path.sep).join("/");
        const bytes = await readFile(chosen.file);
        const insertAt = chosen.text.length;
        const after = `${chosen.text.endsWith("\n") ? "" : "\n"}${compoundSelector} { width: ${request.width}px; }\n`;
        const evidence = `${compoundSelector} { width: ${request.width}px }`;
        return frozen({ confidence: "exact", evidence, candidates: [{ path: relativePath, evidence, line: lineAt(chosen.text, insertAt) }, ...styleCandidates], requiresImpactApproval: false, plan: { relativePath, range: { start: insertAt, end: insertAt }, sourceIdentity: `css:${lineAt(chosen.text, insertAt)}:${compoundSelector}`, route: request.fingerprint.route, expectedHash: hash(bytes), before: "", after, stylingMode: "vanilla-css", confidence: "exact", evidence, impact: { shared: false, locations: [relativePath] }, allowedChangedFiles: [relativePath] } });
      }
    }
    const bytes = await readFile(chosen.file);
    const relativePath = path.relative(root, chosen.file).split(path.sep).join("/");
    const important = /\s*!important$/i.exec(chosen.declaration.value)?.[0] ?? "";
    const after = `${request.width}px${important}`;
    const evidence = component ? `${component.name} at ${component.path}:${component.line}; style owner ${styleCandidates[0]?.evidence ?? chosen.rule.selector}` : styleCandidates[0]?.evidence ?? "Exact width declaration";
    return frozen({ confidence: "exact", evidence, candidates, requiresImpactApproval: false, plan: { relativePath, range: { start: chosen.declaration.start, end: chosen.declaration.end }, sourceIdentity: `${component ? `component:${component.name}:${component.line}|` : ""}css:${lineAt(chosen.text, chosen.declaration.start)}:${chosen.rule.selector}`, route: request.fingerprint.route, expectedHash: hash(bytes), before: chosen.declaration.value, after, stylingMode: chosen.mode, confidence: "exact", evidence, impact: { shared, locations: reuseLocations.length ? reuseLocations : [relativePath] }, component, allowedChangedFiles: [relativePath] } });
  }

  async function mapHeight(request: WidthEditRequest): Promise<MappingResult> {
    if (!validDimension(request.height) || !Number.isFinite(request.currentHeight) || request.currentHeight! <= 0) return frozen({ confidence: "not-mapped", evidence: "HEIGHT_INVALID", candidates: [], requiresImpactApproval: false });
    const root = await realpath(projectRoot);
    const allFiles = await files(root);
    const jsx = new Map<string, { text: string; nodes: JsxNode[] }>();
    for (const file of allFiles.filter((file) => isMarkupSourceFile(file))) {
      const text = await readFile(file, "utf8");
      jsx.set(file, { text, nodes: jsxNodes(text) });
    }
    const exactNodes = [...jsx.entries()].flatMap(([file, parsed]) => parsed.nodes.filter((node) => node.id === request.fingerprint.id).map((node) => ({ file, text: parsed.text, node })));
    const inferredNodes = [...jsx.entries()].flatMap(([file, parsed]) => parsed.nodes.filter((node) => node.tag.toLowerCase() === request.fingerprint.tag && request.fingerprint.classes.some((name) => hasStaticClass(node, name))).map((node) => ({ file, text: parsed.text, node })));
    const componentUse = exactNodes.some(({ node }) => /^[A-Z]/.test(node.tag));
    const mappedNodes = componentUse && inferredNodes.length === 1 ? inferredNodes : exactNodes.length ? exactNodes : inferredNodes.length === 1 ? inferredNodes : [];
    const componentNode = mappedNodes.length === 1 && mappedNodes[0]!.node.component ? mappedNodes[0] : undefined;
    const component = componentNode ? { name: componentNode.node.component!, path: path.relative(root, componentNode.file).split(path.sep).join("/"), line: lineAt(componentNode.text, componentNode.node.start) } : undefined;
    if (exactNodes.some(({ node }) => node.classExpression && !/^[A-Za-z_$][\w$]*\.[A-Za-z_$][\w$]*$/.test(node.classExpression))) return frozen({ confidence: "not-mapped", evidence: "Dynamic className is not safely editable", candidates: exactNodes.map(({ file, node }) => ({ path: path.relative(root, file).split(path.sep).join("/"), evidence: node.source.slice(0, 160), line: lineAt(jsx.get(file)!.text, node.start) })), requiresImpactApproval: false });
    for (const { file, text, node } of mappedNodes) {
      if (node.classLiteral) {
        const tokens = node.classLiteral.value.split(/\s+/).filter(Boolean);
        const heights = tokens.map((token, index) => ({ token, index })).filter(({ token }) => /^(?:[\w-]+:)*h-(?:\d+|full|\[.+\])$/.test(token));
        if (heights.length) {
          const requestedPrefix = request.breakpoint ? `${request.breakpoint}:` : "";
          const matching = request.breakpoint === undefined || request.breakpoint === null ? heights : heights.filter(({ token }) => token.startsWith(requestedPrefix));
          if (matching.length !== 1 || (heights.length > 1 && request.breakpoint === undefined)) return frozen({ confidence: "ambiguous", evidence: "Choose the responsive height variant", candidates: heights.map(({ token }) => ({ path: path.relative(root, file).split(path.sep).join("/"), evidence: token, line: lineAt(text, node.start) })), requiresImpactApproval: false });
          const selected = matching[0]!;
          const prefix = selected.token.includes(":") ? selected.token.slice(0, selected.token.lastIndexOf(":") + 1) : "";
          const replacement = prefix + tailwindHeightToken(request.height!);
          let tokenStart = node.classLiteral.start;
          for (const token of tokens.slice(0, selected.index)) tokenStart += token.length + 1;
          const bytes = await readFile(file);
          const relativePath = path.relative(root, file).split(path.sep).join("/");
          return frozen({ confidence: "exact", evidence: component ? `${component.name} at ${component.path}:${component.line}; static Tailwind token ${selected.token}` : `Static Tailwind token ${selected.token}`, candidates: component ? [{ path: component.path, evidence: `React component ${component.name}`, line: component.line }, { path: relativePath, evidence: selected.token, line: lineAt(text, tokenStart) }] : [{ path: relativePath, evidence: selected.token, line: lineAt(text, tokenStart) }], requiresImpactApproval: false, plan: { relativePath, range: { start: tokenStart, end: tokenStart + selected.token.length }, sourceIdentity: `${component ? `component:${component.name}:${component.line}|` : ""}jsx:${lineAt(text, node.start)}:${selected.token}:height`, route: request.fingerprint.route, expectedHash: hash(bytes), before: selected.token, after: replacement, stylingMode: "tailwind", confidence: "exact", evidence: node.source.slice(0, 160), impact: { shared: false, locations: [relativePath] }, component, allowedChangedFiles: [relativePath] } });
        }
      }
    }
    const cssCandidates: Array<{ file: string; text: string; rule: CssRule; declaration: CssRule["declarations"][number]; mode: StylingMode }> = [];
    const missingHeightCandidates: Array<{ file: string; text: string; rule: CssRule; score: number; usesId: boolean }> = [];
    const cssFiles = allFiles.filter((file) => path.extname(file).toLowerCase() === ".css" || (options.framework === "vanilla" && path.extname(file).toLowerCase() === ".html"));
    for (const file of cssFiles) {
      const text = await readFile(file, "utf8");
      for (const rule of styleRules(text, path.extname(file).toLowerCase() === ".html")) {
        if (!selectorMatches(rule.selector, request.fingerprint)) continue;
        for (const declaration of rule.declarations.filter(cssHeightDeclaration)) cssCandidates.push({ file, text, rule, declaration, mode: options.framework === "vanilla" ? "vanilla-css" : "react-css" });
        const specificity = options.framework === "vanilla" ? simpleSelectorSpecificity(rule.selector, request.fingerprint) : null;
        if (specificity && !rule.declarations.some(({ property }) => property === "height")) missingHeightCandidates.push({ file, text, rule, ...specificity });
      }
    }
    const currentMatches = cssCandidates.filter(({ declaration }) => { const px = cssLengthPx(declaration.value); return px !== null && Math.abs(px - request.currentHeight!) <= 1; });
    const styleCandidates = (currentMatches.length ? currentMatches : cssCandidates).map(({ file, text, rule, declaration }) => ({ path: path.relative(root, file).split(path.sep).join("/"), evidence: `${rule.selector} { height: ${declaration.value} }${rule.atRule ? ` in ${rule.atRule}` : ""}`, line: lineAt(text, declaration.start) }));
    const candidates = component ? [{ path: component.path, evidence: `React component ${component.name}`, line: component.line }, ...styleCandidates] : styleCandidates;
    const oneFile = new Set(cssCandidates.map(({ file }) => file)).size === 1;
    const chosen = cssCandidates.length === 1 && cssCandidates[0]!.rule.atRule === null ? cssCandidates[0] : oneFile && currentMatches.length === 1 && cssCandidates.every(({ rule }) => rule.atRule === null) ? currentMatches[0] : undefined;
    if (!chosen && !cssCandidates.length && missingHeightCandidates.length) {
      const score = Math.max(...missingHeightCandidates.map((candidate) => candidate.score));
      const best = missingHeightCandidates.filter((candidate) => candidate.score === score);
      const insertion = best.length === 1 && best[0]!.rule.atRule === null ? best[0] : undefined;
      const insertionCandidates = best.map(({ file, text, rule }) => ({ path: path.relative(root, file).split(path.sep).join("/"), evidence: `${rule.selector} { no height declaration }${rule.atRule ? ` in ${rule.atRule}` : ""}`, line: lineAt(text, rule.bodyStart) }));
      if (!insertion) return frozen({ confidence: "ambiguous", evidence: "Multiple or responsive style owners remain", candidates: insertionCandidates, requiresImpactApproval: false });
      const shared = !insertion.usesId;
      if (shared && !request.sharedImpactAccepted) return frozen({ confidence: "probable", evidence: `Style owner ${insertion.rule.selector} may affect every matching element`, candidates: insertionCandidates, requiresImpactApproval: true });
      let start = insertion.rule.bodyEnd;
      while (start > insertion.rule.bodyStart && /\s/.test(insertion.text[start - 1]!)) start -= 1;
      const before = insertion.text.slice(start, insertion.rule.bodyEnd);
      const body = insertion.text.slice(insertion.rule.bodyStart, start).trimEnd();
      const indent = /\n([ \t]+)\S/.exec(insertion.text.slice(insertion.rule.bodyStart, insertion.rule.bodyEnd))?.[1] ?? "  ";
      const after = `${body && !body.endsWith(";") ? ";" : ""}\n${indent}height: ${request.height}px;${before}`;
      const bytes = await readFile(insertion.file);
      const relativePath = path.relative(root, insertion.file).split(path.sep).join("/");
      return frozen({ confidence: "exact", evidence: `Added height to existing style owner ${insertion.rule.selector}`, candidates: insertionCandidates, requiresImpactApproval: false, plan: { relativePath, range: { start, end: insertion.rule.bodyEnd }, sourceIdentity: `css:${lineAt(insertion.text, insertion.rule.bodyStart)}:${insertion.rule.selector}:new-height`, route: request.fingerprint.route, expectedHash: hash(bytes), before, after, stylingMode: "vanilla-css", confidence: "exact", evidence: `Added height to existing style owner ${insertion.rule.selector}`, impact: { shared, locations: insertionCandidates.map(({ path: candidatePath, line }) => `${candidatePath}:${line}`) }, allowedChangedFiles: [relativePath] } });
    }
    if (!chosen) return frozen({ confidence: cssCandidates.length ? "ambiguous" : "not-mapped", evidence: cssCandidates.length ? "Multiple or responsive height owners remain" : "No unique static height owner found", candidates, requiresImpactApproval: false });
    const bytes = await readFile(chosen.file);
    const relativePath = path.relative(root, chosen.file).split(path.sep).join("/");
    const important = /\s*!important$/i.exec(chosen.declaration.value)?.[0] ?? "";
    const after = `${request.height}px${important}`;
    const evidence = styleCandidates[0]?.evidence ?? "Exact height declaration";
    return frozen({ confidence: "exact", evidence, candidates, requiresImpactApproval: false, plan: { relativePath, range: { start: chosen.declaration.start, end: chosen.declaration.end }, sourceIdentity: `css:${lineAt(chosen.text, chosen.declaration.start)}:${chosen.rule.selector}:height`, route: request.fingerprint.route, expectedHash: hash(bytes), before: chosen.declaration.value, after, stylingMode: chosen.mode, confidence: "exact", evidence, impact: { shared: false, locations: [relativePath] }, component, allowedChangedFiles: [relativePath] } });
  }

  async function mapText(request: WidthEditRequest): Promise<MappingResult> {
    if (request.previewText === null || request.previewText === undefined || request.originalText === undefined || request.previewText === request.originalText) return frozen({ confidence: "not-mapped", evidence: "TEXT_UNCHANGED", candidates: [], requiresImpactApproval: false });
    const root = await realpath(projectRoot);
    const allFiles = await files(root);
    const candidates: MappingCandidate[] = [];
    const idPattern = request.fingerprint.id ? `[^>]*\\bid\\s*=\\s*["']${escapeRegExp(request.fingerprint.id)}["']` : null;
    const htmlPattern = idPattern
      ? new RegExp(`<${escapeRegExp(request.fingerprint.tag)}${idPattern}[^>]*>([^<]*)</${escapeRegExp(request.fingerprint.tag)}>`, "i")
      : new RegExp(`<${escapeRegExp(request.fingerprint.tag)}[^>]*>\\s*${escapeRegExp(request.originalText)}\\s*</${escapeRegExp(request.fingerprint.tag)}>`, "i");
    for (const file of allFiles.filter((entry) => /\.html$/i.test(entry))) {
      const text = await readFile(file, "utf8");
      const match = htmlPattern.exec(text);
      if (!match) continue;
      const before = match[1] ?? "";
      if (before.replace(/\s+/g, " ").trim() !== request.originalText.replace(/\s+/g, " ").trim()) continue;
      const start = match.index + match[0].indexOf(before);
      const relativePath = path.relative(root, file).split(path.sep).join("/");
      candidates.push({ path: relativePath, evidence: `HTML text in <${request.fingerprint.tag}>`, line: lineAt(text, start) });
      const bytes = await readFile(file);
      return frozen({ confidence: "exact", evidence: `Static HTML text at ${relativePath}:${lineAt(text, start)}`, candidates, requiresImpactApproval: false, plan: { relativePath, range: { start, end: start + before.length }, sourceIdentity: `html:${lineAt(text, start)}:${request.fingerprint.tag}:text`, route: request.fingerprint.route, expectedHash: hash(bytes), before, after: request.previewText, stylingMode: "vanilla-css", confidence: "exact", evidence: `Static HTML text`, impact: { shared: false, locations: [relativePath] }, allowedChangedFiles: [relativePath] } });
    }
    for (const file of allFiles.filter((entry) => isMarkupSourceFile(entry))) {
      const text = await readFile(file, "utf8");
      const nodes = jsxNodes(text).filter((node) => (request.fingerprint.id ? node.id === request.fingerprint.id : node.tag.toLowerCase() === request.fingerprint.tag && request.fingerprint.classes.every((name) => hasStaticClass(node, name))));
      if (nodes.length !== 1) continue;
      const node = nodes[0]!;
      const literal = new RegExp(`>(\\s*)${escapeRegExp(request.originalText)}(\\s*)<`).exec(node.source);
      if (!literal) return frozen({ confidence: "not-mapped", evidence: "Dynamic JSX text is not safely editable", candidates: [{ path: path.relative(root, file).split(path.sep).join("/"), evidence: node.source.slice(0, 160), line: lineAt(text, node.start) }], requiresImpactApproval: false });
      const before = literal[1] + request.originalText + literal[2];
      const start = node.start + literal.index + 1 + (literal[1]?.length ?? 0);
      const end = start + request.originalText.length;
      if (request.previewText !== undefined && request.previewText !== null && request.previewText.includes("<")) return frozen({ confidence: "not-mapped", evidence: "HTML markup in text is not safely editable", candidates: [{ path: path.relative(root, file).split(path.sep).join("/"), evidence: node.source.slice(0, 160), line: lineAt(text, node.start) }], requiresImpactApproval: false });
      const relativePath = path.relative(root, file).split(path.sep).join("/");
      const bytes = await readFile(file);
      return frozen({ confidence: "exact", evidence: `Static JSX text in ${relativePath}:${lineAt(text, node.start)}`, candidates: [{ path: relativePath, evidence: node.source.slice(0, 160), line: lineAt(text, node.start) }], requiresImpactApproval: false, plan: { relativePath, range: { start, end }, sourceIdentity: `jsx:${lineAt(text, node.start)}:${node.tag}:text`, route: request.fingerprint.route, expectedHash: hash(bytes), before: request.originalText, after: request.previewText, stylingMode: /\.module\.css$/i.test(text) ? "css-module" : "react-css", confidence: "exact", evidence: node.source.slice(0, 160), impact: { shared: false, locations: [relativePath] }, allowedChangedFiles: [relativePath] } });
    }
    return frozen({ confidence: "not-mapped", evidence: "No unique static text owner found", candidates, requiresImpactApproval: false });
  }

  async function mapCssProperty(request: WidthEditRequest, property: string, previewValue: string, originalValue: string): Promise<MappingResult> {
    if (!previewValue || previewValue === originalValue) return frozen({ confidence: "not-mapped", evidence: `${property.toUpperCase()}_UNCHANGED`, candidates: [], requiresImpactApproval: false });
    const root = await realpath(projectRoot);
    const allFiles = await files(root);
    const stylingMode = (file: string): StylingMode => options.framework === "vanilla" ? "vanilla-css" : "react-css";
    const cssCandidates: Array<{ file: string; text: string; rule: CssRule; declaration: CssRule["declarations"][number]; mode: StylingMode }> = [];
    const missingPropertyCandidates: Array<{ file: string; text: string; rule: CssRule; score: number; usesId: boolean; affinity: number }> = [];
    for (const file of allFiles.filter((entry) => /\.css$/i.test(entry))) {
      const text = await readFile(file, "utf8");
      for (const rule of styleRules(text, false)) {
        if (!selectorMatches(rule.selector, request.fingerprint)) continue;
        const declarations = rule.declarations.filter((item) => item.property === property);
        if (declarations.length) {
          for (const declaration of declarations) cssCandidates.push({ file, text, rule, declaration, mode: stylingMode(file) });
          continue;
        }
        const specificity = simpleSelectorSpecificity(rule.selector, request.fingerprint);
        if (specificity) missingPropertyCandidates.push({ file, text, rule, ...specificity, affinity: ruleDimensionAffinity(rule, request) });
      }
    }
    const candidates = cssCandidates.map(({ file, text, rule, declaration }) => ({ path: path.relative(root, file).split(path.sep).join("/"), evidence: `${rule.selector} { ${property}: ${declaration.value} }`, line: lineAt(text, declaration.start) }));
    const original = originalValue.trim();
    const valueMatches = original && original !== "none"
      ? cssCandidates.filter(({ declaration }) => declaration.value.trim() === original)
      : [];
    const oneFile = new Set(cssCandidates.map(({ file }) => file)).size === 1;
    let chosen = cssCandidates.length === 1 && cssCandidates[0]!.rule.atRule === null ? cssCandidates[0]
      : oneFile && valueMatches.length === 1 && cssCandidates.every(({ rule }) => rule.atRule === null) ? valueMatches[0]
      : undefined;
    if (!chosen && !cssCandidates.length && missingPropertyCandidates.length) {
      const ranked = missingPropertyCandidates.map((candidate) => ({ ...candidate, total: candidate.score + candidate.affinity }));
      const bestScore = Math.max(...ranked.map((candidate) => candidate.total));
      const best = ranked.filter((candidate) => candidate.total === bestScore && candidate.rule.atRule === null);
      const insertionCandidates = best.map(({ file, text, rule }) => ({ path: path.relative(root, file).split(path.sep).join("/"), evidence: `${rule.selector} { no ${property} declaration }${rule.atRule ? ` in ${rule.atRule}` : ""}`, line: lineAt(text, rule.bodyStart) }));
      const insertion = best.length === 1 ? best[0] : undefined;
      if (!insertion) return frozen({ confidence: "ambiguous", evidence: `Multiple ${property} owners remain`, candidates: insertionCandidates, requiresImpactApproval: false });
      const shared = !insertion.usesId;
      if (shared && !request.sharedImpactAccepted) return frozen({ confidence: "probable", evidence: `Style owner ${insertion.rule.selector} may affect every matching element`, candidates: insertionCandidates, requiresImpactApproval: true });
      let start = insertion.rule.bodyEnd;
      while (start > insertion.rule.bodyStart && /\s/.test(insertion.text[start - 1]!)) start -= 1;
      const before = insertion.text.slice(start, insertion.rule.bodyEnd);
      const body = insertion.text.slice(insertion.rule.bodyStart, start).trimEnd();
      const indent = /\n([ \t]+)\S/.exec(insertion.text.slice(insertion.rule.bodyStart, insertion.rule.bodyEnd))?.[1] ?? "  ";
      const after = `${body && !body.endsWith(";") ? ";" : ""}\n${indent}${property}: ${previewValue};${before}`;
      const bytes = await readFile(insertion.file);
      const relativePath = path.relative(root, insertion.file).split(path.sep).join("/");
      const evidence = `Added ${property} to existing style owner ${insertion.rule.selector}`;
      return frozen({ confidence: "exact", evidence, candidates: insertionCandidates, requiresImpactApproval: false, plan: { relativePath, range: { start, end: insertion.rule.bodyEnd }, sourceIdentity: `css:${lineAt(insertion.text, insertion.rule.bodyStart)}:${insertion.rule.selector}:new-${property}`, route: request.fingerprint.route, expectedHash: hash(bytes), before, after, stylingMode: stylingMode(insertion.file), confidence: "exact", evidence, impact: { shared, locations: insertionCandidates.map(({ path: candidatePath, line }) => `${candidatePath}:${line}`) }, allowedChangedFiles: [relativePath] } });
    }
    if (!chosen) return frozen({ confidence: cssCandidates.length ? "ambiguous" : "not-mapped", evidence: cssCandidates.length ? `Multiple ${property} owners remain` : `No unique static ${property} owner found`, candidates, requiresImpactApproval: false });
    const bytes = await readFile(chosen.file);
    const relativePath = path.relative(root, chosen.file).split(path.sep).join("/");
    const important = /\s*!important$/i.exec(chosen.declaration.value)?.[0] ?? "";
    return frozen({ confidence: "exact", evidence: candidates[0]?.evidence ?? `Exact ${property} declaration`, candidates, requiresImpactApproval: false, plan: { relativePath, range: { start: chosen.declaration.start, end: chosen.declaration.end }, sourceIdentity: `css:${lineAt(chosen.text, chosen.declaration.start)}:${chosen.rule.selector}:${property}`, route: request.fingerprint.route, expectedHash: hash(bytes), before: chosen.declaration.value, after: `${previewValue}${important}`, stylingMode: chosen.mode, confidence: "exact", evidence: candidates[0]?.evidence ?? `Exact ${property} declaration`, impact: { shared: false, locations: [relativePath] }, allowedChangedFiles: [relativePath] } });
  }

  async function mapEdit(request: WidthEditRequest, requireChange = false): Promise<MappingResult> {
    const widthChange = dimensionChanged(request.currentWidth, request.width);
    const heightChange = dimensionChanged(request.currentHeight, request.height);
    const textChange = request.previewText !== null && request.previewText !== undefined && request.originalText !== undefined && request.previewText !== request.originalText;
    const styleChange = Boolean(request.previewStyles && Object.entries(request.previewStyles).some(([property, value]) => value !== (request.originalStyles?.[property] ?? "")));
    if (requireChange && !widthChange && !heightChange && !textChange && !styleChange) return frozen({ confidence: "not-mapped", evidence: "Change width, height, text, or style before Apply", candidates: [], requiresImpactApproval: false });
    const rank = (value: MappingConfidence) => ({ exact: 0, probable: 1, ambiguous: 2, "not-mapped": 3 }[value]);
    const parts: MappingResult[] = [];
    if (requireChange || widthChange) parts.push(await mapWidth(request));
    if (requireChange || heightChange) parts.push(await mapHeight(request));
    if (textChange) parts.push(await mapText(request));
    if (request.previewStyles) {
      for (const [property, value] of Object.entries(request.previewStyles)) {
        const originalValue = request.originalStyles?.[property] ?? "";
        if (value !== originalValue) parts.push(await mapCssProperty(request, property, value, originalValue));
      }
    }
    if (!parts.length) parts.push(await mapWidth(request));
    if (!parts.length) return frozen({ confidence: "not-mapped", evidence: "NO_MAPPINGS", candidates: [], requiresImpactApproval: false });
    const worst = parts.reduce((left, right) => rank(right.confidence) > rank(left.confidence) ? right : left);
    if (worst.confidence !== "exact" || !parts.every((part) => part.plan)) return worst;
    return frozen({ confidence: "exact", evidence: parts.map((part) => part.evidence).join("; "), candidates: parts.flatMap((part) => part.candidates), requiresImpactApproval: parts.some((part) => part.requiresImpactApproval), plan: parts[0]!.plan });
  }

  async function atomicReplace(target: string, bytes: Uint8Array, mode: number, rollback = false): Promise<string> {
    const temporary = path.join(path.dirname(target), `.${path.basename(target)}.reframe-${randomUUID()}.tmp`);
    const writer = rollback ? operations.rollbackWriteFile : operations.writeFile;
    const mover = rollback ? operations.rollbackRename : operations.rename;
    try {
      await writer(temporary, bytes, { mode });
      if (hash(await readFile(temporary)) !== hash(bytes)) throw new Error("SHORT_WRITE");
      const handle = await open(temporary, "r");
      try { await handle.sync(); }
      catch (error) { if (!(["EPERM", "EINVAL"] as Array<string | undefined>).includes((error as NodeJS.ErrnoException).code)) throw error; }
      finally { await handle.close(); }
      for (let attempt = 0; ; attempt += 1) {
        try { await mover(temporary, target); break; }
        catch (error) {
          const code = (error as NodeJS.ErrnoException).code;
          if (!["EPERM", "EACCES", "EBUSY"].includes(code ?? "") || attempt >= 5) throw error;
          await new Promise((resolve) => setTimeout(resolve, 10 * 2 ** attempt));
        }
      }
      await chmod(target, mode);
      return temporary;
    } catch (error) {
      await operations.unlink(temporary).catch(() => undefined);
      throw error;
    }
  }

  async function transact(plan: EditPlan, mapping: MappingResult, mappingMs: number, verify = options.verify, request?: WidthEditRequest, transactOptions?: { skipCheckpoint?: boolean }): Promise<EditResult> {
    const target = await resolveProjectPath(projectRoot, plan.relativePath);
    const beforeBytes = await readFile(target);
    if (hash(beforeBytes) !== plan.expectedHash) return { status: "rejected", code: "FILE_STALE", mapping, plan, mappingMs };
    const source = beforeBytes.toString("utf8");
    if (source.slice(plan.range.start, plan.range.end) !== plan.before) return { status: "rejected", code: "FILE_STALE", mapping, plan, mappingMs };
    const afterBytes = Buffer.from(source.slice(0, plan.range.start) + plan.after + source.slice(plan.range.end), "utf8");
    const information = await stat(target);
    let preflight: HistoryPreflight | undefined;
    if (options.history && request) {
      try { preflight = await options.history.prepareEdit(plan, request); }
      catch (error) { return { status: "rejected", code: error instanceof Error ? error.message : String(error), mapping, plan, mappingMs }; }
    }
    const backupDirectory = path.join(tmpdir(), "reframe-phase6-backups");
    await mkdir(backupDirectory, { recursive: true });
    const backupPath = path.join(backupDirectory, `${randomUUID()}.bak`);
    await writeFile(backupPath, beforeBytes, { mode: information.mode });
    const writeStarted = performance.now();
    try {
      await atomicReplace(target, afterBytes, information.mode);
    } catch (error) {
      await unlink(backupPath).catch(() => undefined);
      return { status: "rejected", code: `WRITE_FAILED:${error instanceof Error ? error.message : String(error)}`, mapping, plan, mappingMs, writeMs: performance.now() - writeStarted };
    }
    const writeMs = performance.now() - writeStarted;
    const verificationStarted = performance.now();
    try {
      const verified = await Promise.race([
        Promise.resolve(verify?.(plan, "apply") ?? true),
        new Promise<boolean>((_resolve, reject) => setTimeout(() => reject(new Error("VERIFICATION_TIMEOUT")), verificationTimeoutMs)),
      ]);
      if (!verified) throw new Error("VERIFICATION_FAILED");
      const verificationMs = performance.now() - verificationStarted;
      const checkpoint = !transactOptions?.skipCheckpoint && options.history && request && preflight ? await options.history.createCheckpoint({
        files: [{ relativePath: plan.relativePath, beforeBytes, afterBytes, mode: information.mode, range: plan.range }],
        request,
        plan,
        preflight,
        verificationMs,
      }) : undefined;
      await unlink(backupPath).catch(() => undefined);
      return { status: "applied", code: "EDIT_APPLIED", mapping, plan, mappingMs, writeMs, verificationMs, checkpointId: checkpoint?.id, visualComplete: checkpoint?.screenshots.visualComplete };
    } catch (error) {
      const primaryCode = error instanceof Error ? error.message : "VERIFICATION_FAILED";
      try {
        await atomicReplace(target, beforeBytes, information.mode, true);
        let recovered = true;
        if (verify) {
          try {
            recovered = await Promise.race([
              Promise.resolve(verify(plan, "rollback")),
              new Promise<boolean>((_resolve, reject) => setTimeout(() => reject(new Error("VERIFICATION_TIMEOUT")), verificationTimeoutMs)),
            ]);
          } catch { recovered = false; }
        }
        await unlink(backupPath).catch(() => undefined);
        return { status: "rolled-back", code: recovered ? primaryCode : `${primaryCode}:RECOVERY_UNVERIFIED`, mapping, plan, mappingMs, writeMs, verificationMs: performance.now() - verificationStarted };
      } catch (rollbackError) {
        return { status: "critical", code: `ROLLBACK_FAILED:${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`, mapping, plan, backupPath, backupHash: hash(beforeBytes), mappingMs, writeMs, verificationMs: performance.now() - verificationStarted };
      }
    }
  }

  async function applyWidth(request: WidthEditRequest, verify?: SourceEditorOptions["verify"]): Promise<EditResult> {
    return applyEdit(request, verify);
  }

  async function promoteUnmappedToSource(request: WidthEditRequest): Promise<EditResult | null> {
    const mappingStarted = performance.now();
    const root = await realpath(projectRoot);
    const fpHash = fingerprintHash(request.fingerprint);
    const widthChange = dimensionChanged(request.currentWidth, request.width);
    const heightChange = dimensionChanged(request.currentHeight, request.height);
    const textChange = request.previewText !== null && request.previewText !== undefined && request.originalText !== undefined && request.previewText !== request.originalText;
    const styleChange = Boolean(request.previewStyles && Object.entries(request.previewStyles).some(([property, value]) => value !== (request.originalStyles?.[property] ?? "")));
    if (!widthChange && !heightChange && !textChange && !styleChange) return null;

    if (options.framework === "react" && await projectUsesTailwind(root, options.styling)) {
      const jsx = new Map<string, { text: string; nodes: JsxNode[] }>();
      for (const file of (await files(root)).filter((entry) => isMarkupSourceFile(entry))) {
        const text = await readFile(file, "utf8");
        jsx.set(file, { text, nodes: jsxNodes(text) });
      }
      const target = findUniqueJsxTarget(jsx, request.fingerprint);
      if (!target) return null;

      const { file, text, node } = target;
      const relativePath = path.relative(root, file).split(path.sep).join("/");
      let nextText = text;
      const changedFiles = new Set<string>();

      if (widthChange || heightChange || styleChange) {
        const utilityStyles: Record<string, string> = {};
        if (widthChange) utilityStyles.width = tailwindToken(request.width);
        if (heightChange && validDimension(request.height)) utilityStyles.height = tailwindHeightToken(request.height!);
        if (request.previewStyles) {
          for (const [property, value] of Object.entries(request.previewStyles)) {
            const originalValue = request.originalStyles?.[property] ?? "";
            if (!value || value === originalValue) continue;
            if (property === "color") utilityStyles.color = tailwindTextColorToken(value);
          }
        }
        if (Object.keys(utilityStyles).length) {
          let classValue = node.classLiteral?.value ?? "";
          if (utilityStyles.width) classValue = upsertTailwindUtility(classValue, tailwindWidthPattern, utilityStyles.width);
          if (utilityStyles.height) classValue = upsertTailwindUtility(classValue, tailwindHeightPattern, utilityStyles.height);
          if (utilityStyles.color) classValue = upsertTailwindUtility(classValue, tailwindTextColorPattern, utilityStyles.color);
          if (node.classLiteral) {
            nextText = `${nextText.slice(0, node.classLiteral.start)}${classValue}${nextText.slice(node.classLiteral.end)}`;
          } else {
            const updatedTag = injectClassNameIntoOpeningTag(node.source, classValue);
            nextText = `${nextText.slice(0, node.start)}${updatedTag}${nextText.slice(node.end)}`;
          }
          changedFiles.add(relativePath);
        }
      }

      if (textChange) {
        const windowStart = node.start;
        const windowEnd = node.end + (nextText.length - text.length);
        const literal = new RegExp(`>(\\s*)${escapeRegExp(request.originalText!)}(\\s*)<`).exec(nextText.slice(windowStart, windowEnd));
        if (!literal || request.previewText!.includes("<")) {
          if (!changedFiles.size) return null;
        } else {
          const innerStart = windowStart + literal.index! + 1 + (literal[1]?.length ?? 0);
          const innerEnd = innerStart + request.originalText!.length;
          nextText = `${nextText.slice(0, innerStart)}${request.previewText}${nextText.slice(innerEnd)}`;
          changedFiles.add(relativePath);
        }
      }

      if (!changedFiles.size || nextText === text) return null;
      await writeFile(file, nextText);
      const mappingMs = performance.now() - mappingStarted;
      const evidence = `Promoted unmapped Tailwind utilities in ${[...changedFiles].join(" + ")}`;
      return {
        status: "applied",
        code: "SOURCE_CLASS_PROMOTED",
        mapping: {
          confidence: "exact",
          evidence,
          candidates: [...changedFiles].map((changedPath) => ({ path: changedPath, evidence: "Tailwind className", line: lineAt(text, node.start) })),
          requiresImpactApproval: false,
        },
        mappingMs,
      };
    }

    if (options.framework === "react" && options.styling !== "css-modules") {
      const jsx = new Map<string, { text: string; nodes: JsxNode[] }>();
      for (const file of (await files(root)).filter((entry) => isMarkupSourceFile(entry))) {
        const text = await readFile(file, "utf8");
        jsx.set(file, { text, nodes: jsxNodes(text) });
      }
      const target = findUniqueJsxTarget(jsx, request.fingerprint);
      if (!target || target.node.classExpression) return null;

      const { file, text, node } = target;
      const { selector, className } = promotedSelector(request.fingerprint, fpHash);
      const styles: Record<string, string> = {};
      if (widthChange) styles.width = `${request.width}px`;
      if (heightChange) styles.height = `${request.height}px`;
      if (request.previewStyles) {
        for (const [property, value] of Object.entries(request.previewStyles)) {
          if (value && value !== (request.originalStyles?.[property] ?? "")) styles[property] = value;
        }
      }

      const cssFile = Object.keys(styles).length ? await reactCssTarget(root, file, text) : null;
      if (Object.keys(styles).length && !cssFile) return null;
      let nextText = text;
      let delta = 0;
      if (className) {
        const openingTag = injectClassNameIntoOpeningTag(node.source, className);
        delta = openingTag.length - node.source.length;
        nextText = `${nextText.slice(0, node.start)}${openingTag}${nextText.slice(node.end)}`;
      }
      if (textChange) {
        const windowEnd = node.end + delta;
        const literal = new RegExp(`>(\\s*)${escapeRegExp(request.originalText!)}(\\s*)<`).exec(nextText.slice(node.start, windowEnd));
        if (!literal || request.previewText!.includes("<")) return null;
        const start = node.start + literal.index! + 1 + (literal[1]?.length ?? 0);
        nextText = `${nextText.slice(0, start)}${request.previewText}${nextText.slice(start + request.originalText!.length)}`;
      }

      const changedFiles: string[] = [];
      if (cssFile) {
        const css = await readFile(cssFile, "utf8");
        await writeFile(cssFile, upsertPromotedCssRule(css, selector, styles));
        changedFiles.push(path.relative(root, cssFile).split(path.sep).join("/"));
      }
      if (nextText !== text) {
        await writeFile(file, nextText);
        changedFiles.push(path.relative(root, file).split(path.sep).join("/"));
      }
      if (!changedFiles.length) return null;
      const evidence = `Promoted unmapped edit to ${selector} in ${changedFiles.join(" + ")}`;
      return {
        status: "applied",
        code: "SOURCE_CLASS_PROMOTED",
        mapping: {
          confidence: "exact",
          evidence,
          candidates: changedFiles.map((changedPath) => ({ path: changedPath, evidence: selector, line: 1 })),
          requiresImpactApproval: false,
        },
        mappingMs: performance.now() - mappingStarted,
      };
    }

    if (options.framework !== "vanilla") return null;

    const styles: Record<string, string> = {};
    if (widthChange) styles.width = `${request.width}px`;
    if (heightChange) styles.height = `${request.height}px`;
    if (request.previewStyles) {
      for (const [property, value] of Object.entries(request.previewStyles)) {
        const originalValue = request.originalStyles?.[property] ?? "";
        if (value && value !== originalValue) styles[property] = value;
      }
    }

    const { selector, className } = promotedSelector(request.fingerprint, fpHash);
    const markup = (await files(root)).filter((file) => /\.html$/i.test(file) || /\.blade\.php$/i.test(file));
    const targets = [];
    for (const file of markup) {
      const html = await readFile(file, "utf8");
      const relativePath = path.relative(root, file).split(path.sep).join("/");
      const target = findVanillaHtmlTarget(html, relativePath, request.fingerprint, request.originalText);
      if (target) targets.push({ file, html, target });
    }
    if (targets.length !== 1) return null;
    const { file: htmlFile, html, target } = targets[0]!;
    const htmlPath = target.relativePath;

    let nextHtml = html;
    if (target) {
      let tagDelta = 0;
      if (className) {
        const updatedTag = injectClassIntoOpeningTag(target.openingTag, className);
        tagDelta = updatedTag.length - target.openingTag.length;
        nextHtml = `${nextHtml.slice(0, target.matchIndex)}${updatedTag}${nextHtml.slice(target.matchIndex + target.openingTag.length)}`;
      }
      if (textChange) {
        const innerStart = target.innerStart + tagDelta;
        const innerEnd = target.innerEnd + tagDelta;
        const before = nextHtml.slice(innerStart, innerEnd);
        if (before.replace(/\s+/g, " ").trim() === request.originalText!.replace(/\s+/g, " ").trim()) {
          nextHtml = `${nextHtml.slice(0, innerStart)}${request.previewText}${nextHtml.slice(innerEnd)}`;
        }
      }
    }

    const styleTarget = resolveVanillaStyleTarget(htmlPath, html);
    const changedFiles: string[] = [];
    if (Object.keys(styles).length) {
      if (styleTarget.kind === "file") {
        const cssPath = path.join(root, styleTarget.relativePath);
        let css = "";
        try { css = await readFile(cssPath, "utf8"); } catch { /* ponytail: create on first promotion */ }
        const nextCss = upsertPromotedCssRule(css, selector, styles);
        await mkdir(path.dirname(cssPath), { recursive: true });
        await writeFile(cssPath, nextCss);
        changedFiles.push(styleTarget.relativePath);
        if (styleTarget.relativePath === "style.css" && !/<link\b[^>]*\brel\s*=\s*["']stylesheet["']/i.test(html)) {
          nextHtml = ensureStylesheetLink(nextHtml);
        }
      } else {
        const body = html.slice(styleTarget.bodyStart, styleTarget.bodyEnd);
        const nextBody = upsertPromotedCssRule(body, selector, styles);
        nextHtml = `${nextHtml.slice(0, styleTarget.bodyStart)}${nextBody}${nextHtml.slice(styleTarget.bodyEnd)}`;
      }
    }

    if (nextHtml !== html) {
      await writeFile(htmlFile, nextHtml);
      changedFiles.push(htmlPath);
    }
    if (!changedFiles.length) return null;

    const mappingMs = performance.now() - mappingStarted;
    const evidence = `Promoted unmapped edit to ${selector} in ${changedFiles.join(" + ")}`;
    return {
      status: "applied",
      code: "SOURCE_CLASS_PROMOTED",
      mapping: {
        confidence: "exact",
        evidence,
        candidates: changedFiles.map((file) => ({ path: file, evidence: selector, line: 1 })),
        requiresImpactApproval: false,
      },
      mappingMs,
    };
  }

  async function applyOverrides(request: WidthEditRequest): Promise<EditResult> {
    const mappingStarted = performance.now();
    const root = await realpath(projectRoot);
    const hash = fingerprintHash(request.fingerprint);
    const reframeDir = path.join(root, ".reframe");
    await mkdir(reframeDir, { recursive: true });
    try { await writeFile(path.join(reframeDir, ".gitignore"), "history/\ndrafts/\nsnapshots/\ninsertions/\noverrides.css\noverrides.json\n.gitignore\n", { flag: "wx" }); }
    catch { /* ponytail: gitignore may already exist */ }
    const cssPath = path.join(reframeDir, "overrides.css");
    const textPath = path.join(reframeDir, "overrides.json");
    const widthChange = dimensionChanged(request.currentWidth, request.width);
    const heightChange = dimensionChanged(request.currentHeight, request.height);
    const textChange = request.previewText !== null && request.previewText !== undefined && request.originalText !== undefined && request.previewText !== request.originalText;
    const styleChange = Boolean(request.previewStyles && Object.entries(request.previewStyles).some(([property, value]) => value !== (request.originalStyles?.[property] ?? "")));
    if (!widthChange && !heightChange && !textChange && !styleChange) {
      return { status: "rejected", code: "NO_CHANGES", mapping: { confidence: "not-mapped", evidence: "NO_CHANGES", candidates: [], requiresImpactApproval: false }, mappingMs: performance.now() - mappingStarted };
    }
    const styles: Record<string, string> = {};
    if (widthChange) styles.width = `${request.width}px`;
    if (heightChange) styles.height = `${request.height}px`;
    if (request.previewStyles) {
      for (const [property, value] of Object.entries(request.previewStyles)) {
        const originalValue = request.originalStyles?.[property] ?? "";
        if (value && value !== originalValue) styles[property] = value;
      }
    }
    const selector = `[data-reframe-fingerprint="${hash}"]`;
    let css = "";
    try { css = await readFile(cssPath, "utf8"); } catch { /* ponytail: first override */ }
    const rulePattern = new RegExp(`${escapeRegExp(selector)}\\s*\\{[^}]*\\}\\s*`, "g");
    css = css.replace(rulePattern, "").trimEnd();
    const block = Object.entries(styles).map(([property, value]) => `  ${property}: ${value} !important;`).join("\n");
    if (block) css += `${css ? "\n\n" : ""}${selector} {\n${block}\n}`;
    await writeFile(cssPath, css ? `${css}\n` : "");
    type OverrideEntry = { text?: string; fingerprint: ElementFingerprint };
    let entries: Record<string, OverrideEntry> = {};
    try { entries = JSON.parse(await readFile(textPath, "utf8")) as Record<string, OverrideEntry>; } catch { /* ponytail: no prior overrides */ }
    if (textChange) entries[hash] = { text: request.previewText!, fingerprint: request.fingerprint };
    else {
      const current = entries[hash];
      if (current) entries[hash] = { fingerprint: request.fingerprint, ...(current.text ? { text: current.text } : {}) };
      if (!block && !textChange) delete entries[hash];
    }
    if (Object.keys(entries).length) await writeFile(textPath, `${JSON.stringify(entries, null, 2)}\n`);
    else await unlink(textPath).catch(() => undefined);
    const mappingMs = performance.now() - mappingStarted;
    return { status: "applied", code: "OVERRIDE_APPLIED", mapping: { confidence: "not-mapped", evidence: `Saved override ${selector} in .reframe/overrides.css`, candidates: [{ path: ".reframe/overrides.css", evidence: selector, line: 1 }], requiresImpactApproval: false }, mappingMs };
  }

  async function applyEdit(request: WidthEditRequest, verify?: SourceEditorOptions["verify"]): Promise<EditResult> {
    const mappingStarted = performance.now();
    const widthChange = dimensionChanged(request.currentWidth, request.width);
    const heightChange = dimensionChanged(request.currentHeight, request.height);
    const textChange = request.previewText !== null && request.previewText !== undefined && request.originalText !== undefined && request.previewText !== request.originalText;
    const styleChange = Boolean(request.previewStyles && Object.entries(request.previewStyles).some(([property, value]) => value !== (request.originalStyles?.[property] ?? "")));
    const parts: MappingResult[] = [];
    if (widthChange) parts.push(await mapWidth(request));
    if (heightChange) parts.push(await mapHeight(request));
    if (textChange) parts.push(await mapText(request));
    if (request.previewStyles) {
      for (const [property, value] of Object.entries(request.previewStyles)) {
        const originalValue = request.originalStyles?.[property] ?? "";
        if (value !== originalValue) parts.push(await mapCssProperty(request, property, value, originalValue));
      }
    }
    const mappingMs = performance.now() - mappingStarted;
    if (!parts.length) {
      if (widthChange || heightChange || textChange || styleChange) {
        const promoted = await promoteUnmappedToSource(request);
        if (promoted) return promoted;
        return applyOverrides(request);
      }
      return { status: "rejected", code: "NO_CHANGES", mapping: { confidence: "not-mapped", evidence: "NO_CHANGES", candidates: [], requiresImpactApproval: false }, mappingMs };
    }
    const rank = (value: MappingConfidence) => ({ exact: 0, probable: 1, ambiguous: 2, "not-mapped": 3 }[value]);
    const worst = parts.reduce((left, right) => rank(right.confidence) > rank(left.confidence) ? right : left);
    const applyAllowed = worst.confidence === "exact" || (worst.confidence === "probable" && request.sharedImpactAccepted);
    const overrideAllowed = (mapping: MappingResult) => {
      if (mapping.confidence === "probable" && mapping.requiresImpactApproval && !request.sharedImpactAccepted) return true;
      if (mapping.confidence !== "not-mapped" && mapping.confidence !== "ambiguous") return false;
      return !/dynamic|not safely editable|_invalid/i.test(mapping.evidence);
    };
    if (!applyAllowed || parts.some((part) => !part.plan)) {
      if ((widthChange || heightChange || textChange || styleChange) && overrideAllowed(worst)) {
        const promoted = await promoteUnmappedToSource(request);
        if (promoted) return promoted;
        return applyOverrides(request);
      }
      return { status: "rejected", code: worst.evidence, mapping: worst, mappingMs };
    }
    const key = await realpath(projectRoot);
    const previous = locks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    const chained = previous.then(() => current);
    locks.set(key, chained);
    await previous;
    try {
      let last: EditResult | undefined;
      for (let index = 0; index < parts.length; index += 1) {
        const mapping = parts[index]!;
        const final = index === parts.length - 1;
        last = await transact(
          mapping.plan!,
          mapping,
          mappingMs,
          final ? verify ?? options.verify : async () => true,
          request,
          { skipCheckpoint: !final },
        );
        if (last.status !== "applied") return last;
      }
      return last!;
    } finally { release(); if (locks.get(key) === chained) locks.delete(key); }
  }

  const applyPlan = (plan: EditPlan): Promise<EditResult> => transact(plan, { confidence: "exact", evidence: plan.evidence, candidates: [{ path: plan.relativePath, evidence: plan.evidence, line: 0 }], requiresImpactApproval: false, plan }, 0);
  return { mapWidth, mapHeight, mapText, mapEdit, applyPlan, applyWidth, applyEdit, applyOverrides, injectReactMetadata };
}
