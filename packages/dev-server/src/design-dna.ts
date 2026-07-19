import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, readdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export type DesignReviewStatus = "correct" | "incorrect" | "intentional-exception" | "deprecated" | "needs-review";
export type DesignCategory = "color" | "font-family" | "font-size" | "spacing" | "radius" | "tailwind";
export interface DesignEvidence { readonly path: string; readonly line: number; readonly raw: string }
export interface DesignFinding { readonly id: string; readonly category: DesignCategory; readonly value: string; readonly rawValues: readonly string[]; readonly count: number; readonly evidence: readonly DesignEvidence[]; readonly confidence: "high" | "medium" | "low"; readonly status: DesignReviewStatus; readonly scope: "global" | "exception"; readonly conflict: boolean }
export interface DesignComponent { readonly id: string; readonly name: string; readonly path: string; readonly usages: number; readonly evidence: readonly DesignEvidence[]; readonly status: DesignReviewStatus }
export interface DesignDnaPreview { readonly schemaVersion: 1; readonly version: string; readonly fingerprint: string; readonly findings: readonly DesignFinding[]; readonly components: readonly DesignComponent[]; readonly errors: readonly { path: string; code: string }[]; readonly incomplete: boolean; readonly analyzedFiles: readonly string[] }
export interface DesignDnaContext { readonly version: string; readonly fingerprint: string; readonly findings: readonly Pick<DesignFinding, "category" | "value" | "evidence">[]; readonly components: readonly Pick<DesignComponent, "name" | "path">[] }
export interface DesignDnaOperations { readonly mkdir: typeof mkdir; readonly writeFile: typeof writeFile; readonly rename: typeof rename; readonly rm: typeof rm }

const ignoredDirectories = new Set([".git", ".reframe", "node_modules", "dist", "build", "coverage", "test-results", ".next", ".cache"]);
const sensitive = /(^|\/)(\.env(?:\.|$)|.*(?:private[-_.]?key|credentials?|secrets?|tokens?|\.pem$|\.key$|\.p12$|\.pfx$|\.sqlite$|\.dump$))/i;
const relevant = /(?:\.css|\.module\.css|\.jsx|\.tsx|\.vue|tailwind\.config\.(?:js|cjs|mjs|ts))$/i;
const markers = { start: "<!-- reframe:design-system:start -->", end: "<!-- reframe:design-system:end -->" };
const hash = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex");
const normalizePath = (value: string) => value.replaceAll("\\", "/");
const normalizeValue = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
const lineAt = (source: string, offset: number) => source.slice(0, offset).split("\n").length;
const inside = (root: string, target: string) => { const relative = path.relative(root, target); return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative)); };
async function renameReliably(operation: typeof rename, from: string, to: string): Promise<void> { for (let attempt = 0; ; attempt += 1) { try { await operation(from, to); return; } catch (error) { if (!(["EPERM", "EACCES", "EBUSY"] as Array<string | undefined>).includes((error as NodeJS.ErrnoException).code) || attempt >= 5) throw error; await new Promise((resolve) => setTimeout(resolve, 10 * 2 ** attempt)); } } }

async function ignorePatterns(root: string): Promise<readonly RegExp[]> {
  try {
    return (await readFile(path.join(root, ".gitignore"), "utf8")).split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("!") && !line.startsWith("#")).map((line) => new RegExp(`(^|/)${line.replace(/[.+^${}()|[\]\\]/g, "\\$&").replaceAll("**", ".*").replaceAll("*", "[^/]*").replace(/^\//, "")}(?:/|$)`));
  } catch { return []; }
}

async function sourceFiles(projectRoot: string, signal?: AbortSignal): Promise<{ files: string[]; errors: { path: string; code: string }[] }> {
  const root = await realpath(projectRoot); const patterns = await ignorePatterns(root); const files: string[] = []; const errors: { path: string; code: string }[] = []; const queue = [root];
  while (queue.length) {
    if (signal?.aborted) throw new Error("ANALYSIS_CANCELLED");
    const directory = queue.shift()!;
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name); const relative = normalizePath(path.relative(root, absolute));
      if (ignoredDirectories.has(entry.name) || sensitive.test(relative) || patterns.some((pattern) => pattern.test(relative))) continue;
      if (entry.isSymbolicLink()) { const resolved = await realpath(absolute).catch(() => ""); if (!resolved || !inside(root, resolved)) errors.push({ path: relative, code: "SYMLINK_OUTSIDE_ROOT" }); continue; }
      if (entry.isDirectory()) queue.push(absolute);
      else if (entry.isFile() && relevant.test(relative)) files.push(relative);
    }
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  return { files: files.sort(), errors };
}

function findingId(category: DesignCategory, value: string): string { return `${category}:${hash(value).slice(0, 12)}`; }

export async function analyzeDesignDna(projectRoot: string, options: { signal?: AbortSignal } = {}): Promise<DesignDnaPreview> {
  const root = await realpath(projectRoot); const scanned = await sourceFiles(root, options.signal); const errors = [...scanned.errors]; const occurrences = new Map<string, { category: DesignCategory; value: string; raw: Set<string>; evidence: DesignEvidence[]; semantic: boolean }>(); const components: DesignComponent[] = []; const fileHashes: string[] = [];
  const add = (category: DesignCategory, raw: string, file: string, source: string, offset: number, semantic = false) => { const value = normalizeValue(raw); if (!value) return; const key = `${category}\0${value}`; const item = occurrences.get(key) ?? { category, value, raw: new Set<string>(), evidence: [], semantic }; item.raw.add(raw.trim()); item.evidence.push({ path: file, line: lineAt(source, offset), raw: raw.trim() }); item.semantic ||= semantic; occurrences.set(key, item); };
  for (const relative of scanned.files) {
    if (options.signal?.aborted) throw new Error("ANALYSIS_CANCELLED");
    let source: string; try { const absolute = path.join(root, relative); if (!(await lstat(absolute)).isFile()) continue; source = await readFile(absolute, "utf8"); } catch { errors.push({ path: relative, code: "SOURCE_UNREADABLE" }); continue; }
    fileHashes.push(`${relative}:${hash(source)}`);
    if (/\.css$/i.test(relative)) {
      const opens = (source.match(/{/g) ?? []).length; const closes = (source.match(/}/g) ?? []).length; if (opens !== closes) { errors.push({ path: relative, code: "CSS_MALFORMED" }); continue; }
      const declarations = /([\w-]+)\s*:\s*([^;{}]+)[;}]/g; let match: RegExpExecArray | null;
      while ((match = declarations.exec(source))) {
        const property = match[1]!.toLowerCase(); const value = match[2]!; const offset = match.index + match[0].indexOf(value);
        if (/^(?:color|background(?:-color)?|border(?:-\w+)?-color)$/.test(property)) for (const color of value.match(/#[\da-f]{3,8}\b|(?:rgb|hsl)a?\([^)]*\)|var\(--[\w-]+\)/gi) ?? []) add("color", color, relative, source, offset);
        if (property === "font-family") add("font-family", value, relative, source, offset);
        if (property === "font-size") add("font-size", value, relative, source, offset);
        if (/^(?:margin|padding|gap|row-gap|column-gap)(?:-|$)/.test(property)) for (const spacing of value.match(/-?(?:\d*\.)?\d+(?:px|rem|em|%)\b|var\(--[\w-]+\)/gi) ?? []) add("spacing", spacing, relative, source, offset);
        if (/border.*radius/.test(property)) for (const radius of value.match(/(?:\d*\.)?\d+(?:px|rem|em|%)\b|var\(--[\w-]+\)/gi) ?? []) add("radius", radius, relative, source, offset);
      }
    }
    if (/tailwind\.config\./i.test(relative)) for (const match of source.matchAll(/(["']?)([\w-]+)\1\s*:\s*["']([^"']+)["']/g)) add("tailwind", `${match[2]}=${match[3]}`, relative, source, match.index, true);
    if (/\.jsx$/i.test(relative)) for (const match of source.matchAll(/(?:function|const)\s+([A-Z][\w]*)\b/g)) { const name = match[1]!; const usages = (source.match(new RegExp(`<${name}(?:\\s|/|>)`, "g")) ?? []).length; components.push({ id: `component:${name}:${normalizePath(relative)}`, name, path: relative, usages, evidence: [{ path: relative, line: lineAt(source, match.index), raw: name }], status: "needs-review" }); }
    if (/\.(?:tsx|vue)$/i.test(relative)) errors.push({ path: relative, code: "ANALYSIS_PREVIEW_ONLY" });
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  const radiusValues = [...occurrences.values()].filter((item) => item.category === "radius" && item.evidence.length > 1).length;
  const findings = [...occurrences.values()].map((item): DesignFinding => { const count = item.evidence.length; const global = item.semantic || count > 1; return { id: findingId(item.category, item.value), category: item.category, value: item.value, rawValues: [...item.raw].sort(), count, evidence: item.evidence.slice(0, 20), confidence: item.semantic || count >= 3 ? "high" : count === 2 ? "medium" : "low", status: "needs-review", scope: global ? "global" : "exception", conflict: item.category === "radius" && radiusValues > 1 }; }).sort((a, b) => a.category.localeCompare(b.category) || a.value.localeCompare(b.value));
  const fingerprint = hash(fileHashes.sort().join("\n"));
  return Object.freeze({ schemaVersion: 1, version: `dna-${fingerprint.slice(0, 12)}`, fingerprint, findings, components: components.sort((a, b) => a.name.localeCompare(b.name)), errors, incomplete: errors.some((error) => error.code !== "ANALYSIS_PREVIEW_ONLY"), analyzedFiles: scanned.files });
}

export function reviewDesignDna(preview: DesignDnaPreview, updates: Readonly<Record<string, DesignReviewStatus>>): DesignDnaPreview {
  const valid = new Set<DesignReviewStatus>(["correct", "incorrect", "intentional-exception", "deprecated", "needs-review"]); for (const status of Object.values(updates)) if (!valid.has(status)) throw new Error("DESIGN_REVIEW_STATUS_INVALID");
  return Object.freeze({ ...preview, findings: preview.findings.map((item) => ({ ...item, status: updates[item.id] ?? item.status })), components: preview.components.map((item) => ({ ...item, status: updates[item.id] ?? item.status })) });
}

function designMarkdown(preview: DesignDnaPreview): string {
  const approved = preview.findings.filter((item) => item.status === "correct"); const component = preview.components.filter((item) => item.status === "correct");
  return `# Design DNA\n\nVersion: ${preview.version}\nFingerprint: ${preview.fingerprint}\n\n## Approved tokens\n${approved.length ? approved.map((item) => `- ${item.category}: \`${item.value}\` (${item.count} uses; ${item.evidence[0]!.path}:${item.evidence[0]!.line})`).join("\n") : "- None approved."}\n\n## Approved components\n${component.length ? component.map((item) => `- ${item.name} (${item.path}; ${item.usages} uses)`).join("\n") : "- None approved."}\n\nUnconfirmed, rejected, exception, and deprecated evidence remains in the JSON files for review.\n`;
}

export function updateAgentsDesignSection(source: string, designPath = ".reframe/design-dna/DESIGN.md"): string {
  const section = `${markers.start}\n## Design System\n\n- Read \`${designPath}\` before modifying UI.\n- Use approved tokens and reuse existing components.\n- Preserve the current design unless a redesign is explicitly requested.\n- Avoid unrelated colors, fonts, spacing systems, and component patterns.\n${markers.end}`;
  const start = source.indexOf(markers.start); const end = source.indexOf(markers.end);
  if (start >= 0 && end >= start) return source.slice(0, start) + section + source.slice(end + markers.end.length);
  return source + (source && !source.endsWith("\n") ? "\n" : "") + section + "\n";
}

export async function persistDesignDna(projectRoot: string, preview: DesignDnaPreview, options: { permission: boolean; agentsPermission?: boolean; operations?: Partial<DesignDnaOperations> }): Promise<{ written: boolean; version: string }> {
  if (!options.permission) return { written: false, version: preview.version };
  const root = await realpath(projectRoot); const ops = { mkdir, writeFile, rename, rm, ...options.operations }; const reframe = path.join(root, ".reframe"); const final = path.join(reframe, "design-dna"); const stage = path.join(reframe, `.design-dna-${randomUUID()}.tmp`); const backup = path.join(reframe, `.design-dna-${randomUUID()}.backup`); let backedUp = false;
  await ops.mkdir(reframe, { recursive: true }); await ops.mkdir(stage, { recursive: false });
  try {
    const structured = { schemaVersion: 1, version: preview.version, fingerprint: preview.fingerprint };
    await ops.writeFile(path.join(stage, "DESIGN.md"), designMarkdown(preview));
    await ops.writeFile(path.join(stage, "tokens.json"), `${JSON.stringify({ ...structured, findings: preview.findings, errors: preview.errors, incomplete: preview.incomplete }, null, 2)}\n`);
    await ops.writeFile(path.join(stage, "components.json"), `${JSON.stringify({ ...structured, components: preview.components }, null, 2)}\n`);
    await ops.writeFile(path.join(stage, "fingerprint.json"), `${JSON.stringify({ ...structured, analyzedFiles: preview.analyzedFiles, status: "Current" }, null, 2)}\n`);
    try { await renameReliably(ops.rename, final, backup); backedUp = true; } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    await renameReliably(ops.rename, stage, final);
    if (options.agentsPermission) { const agents = path.join(root, "AGENTS.md"); const existing = await readFile(agents, "utf8").catch(() => ""); await ops.writeFile(agents, updateAgentsDesignSection(existing)); }
    if (backedUp) await ops.rm(backup, { recursive: true, force: true });
    return { written: true, version: preview.version };
  } catch (error) { await ops.rm(stage, { recursive: true, force: true }).catch(() => undefined); if (backedUp) { await ops.rm(final, { recursive: true, force: true }).catch(() => undefined); await renameReliably(ops.rename, backup, final).catch(() => undefined); } throw error; }
}

export async function readDesignDna(projectRoot: string): Promise<DesignDnaPreview> { const directory = path.join(projectRoot, ".reframe", "design-dna"); const tokens = JSON.parse(await readFile(path.join(directory, "tokens.json"), "utf8")); const components = JSON.parse(await readFile(path.join(directory, "components.json"), "utf8")); const fingerprint = JSON.parse(await readFile(path.join(directory, "fingerprint.json"), "utf8")); if (tokens.schemaVersion !== 1 || tokens.version !== components.version || tokens.version !== fingerprint.version || tokens.fingerprint !== components.fingerprint || tokens.fingerprint !== fingerprint.fingerprint) throw new Error("DESIGN_DNA_SCHEMA_INVALID"); return { schemaVersion: 1, version: tokens.version, fingerprint: tokens.fingerprint, findings: tokens.findings, components: components.components, errors: tokens.errors ?? [], incomplete: Boolean(tokens.incomplete), analyzedFiles: fingerprint.analyzedFiles ?? [] }; }
export async function designDnaStatus(projectRoot: string): Promise<"Current" | "May be outdated" | "Analysis unavailable"> { try { const saved = await readDesignDna(projectRoot); const current = await analyzeDesignDna(projectRoot); return saved.fingerprint === current.fingerprint ? "Current" : "May be outdated"; } catch { return "Analysis unavailable"; } }
export function selectDesignDnaContext(preview: DesignDnaPreview, options: { sourcePath?: string; componentNames?: readonly string[] } = {}): DesignDnaContext { const css = /\.css$/i.test(options.sourcePath ?? ""); const categories = css ? new Set<DesignCategory>(["color", "font-family", "font-size", "spacing", "radius", "tailwind"]) : new Set<DesignCategory>(["color", "spacing", "tailwind"]); return { version: preview.version, fingerprint: preview.fingerprint, findings: preview.findings.filter((item) => item.status === "correct" && item.scope === "global" && categories.has(item.category)).slice(0, 24).map(({ category, value, evidence }) => ({ category, value, evidence: evidence.slice(0, 2) })), components: preview.components.filter((item) => item.status === "correct" && (!options.componentNames?.length || options.componentNames.includes(item.name))).slice(0, 12).map(({ name, path }) => ({ name, path })) }; }
