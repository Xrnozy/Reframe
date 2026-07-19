import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { DesignDnaContext } from "./design-dna.js";

export const REFERENCE_PACKET_BUDGET = 256 * 1024;
export const REFERENCE_CHARACTERISTICS = ["page-structure", "component-arrangement", "colors", "typography", "interaction-behavior", "content-density", "navigation-pattern", "responsive-behavior"] as const;
export type ReferenceCharacteristic = typeof REFERENCE_CHARACTERISTICS[number];
export type ReferenceKind = "screenshot" | "figma-export" | "hand-drawn" | "site-screenshot" | "markdown" | "design-dna";
export type BrandTreatment = "preserve" | "blend" | "follow";
export type EvidenceConfidence = "high" | "medium" | "low" | "unknown";

export class ReferenceError extends Error { constructor(readonly code: string) { super(code); this.name = "ReferenceError"; } }

export interface ReferenceEvidence { readonly confidence: EvidenceConfidence; readonly summary: string; readonly excerpt?: string }
export interface ReferenceDescriptor {
  readonly version: 1;
  readonly id: string;
  readonly kind: ReferenceKind;
  readonly format: "png" | "markdown" | "figma-json" | "design-dna";
  readonly mime: string;
  readonly hash: string;
  readonly filename: string;
  readonly dimensions?: { readonly width: number; readonly height: number };
  readonly pages: number;
  readonly provenance: string;
  readonly retention: "session" | "persisted" | "approved-dna";
  readonly localPath?: string;
  readonly approvedDna?: { readonly id: string; readonly version: string };
  readonly transformations: readonly string[];
  readonly evidence: Readonly<Record<ReferenceCharacteristic, ReferenceEvidence>>;
  readonly analysis: { readonly status: "complete" | "incomplete"; readonly code: string };
}

export interface AdaptationPlanInput {
  readonly referenceId: string;
  readonly target: { readonly route: string; readonly sourcePath: string; readonly placement: string };
  readonly borrowed: readonly ReferenceCharacteristic[];
  readonly brand: BrandTreatment;
  readonly reuse?: readonly string[];
  readonly newComponents?: readonly string[];
  readonly expectedFiles: readonly string[];
  readonly confirmUnknown?: boolean;
  readonly designDna?: DesignDnaContext;
}

export interface AdaptationPlan {
  readonly version: 1;
  readonly id: string;
  readonly referenceId: string;
  readonly target: AdaptationPlanInput["target"];
  readonly borrowed: readonly ReferenceCharacteristic[];
  readonly preserved: readonly ReferenceCharacteristic[];
  readonly brand: BrandTreatment;
  readonly reuse: readonly string[];
  readonly newComponents: readonly string[];
  readonly expectedFiles: readonly string[];
  readonly responsiveAssumptions: readonly string[];
  readonly prohibitedCopy: readonly string[];
  readonly uncertainties: readonly string[];
  readonly verificationViewports: readonly number[];
  readonly designDnaVersion?: string;
  readonly status: "draft" | "frozen";
  readonly hash?: string;
}

export interface ReferencePacketContext {
  readonly descriptor: Pick<ReferenceDescriptor, "version" | "id" | "kind" | "format" | "hash" | "dimensions" | "pages" | "provenance" | "transformations">;
  readonly evidence: Partial<Record<ReferenceCharacteristic, ReferenceEvidence>>;
  readonly plan: AdaptationPlan;
  readonly selectedExcerpt?: string;
}

export interface ReferenceAnalyzer {
  (input: { kind: ReferenceKind; width?: number; height?: number; text?: string; figma?: unknown }): Promise<Partial<Record<ReferenceCharacteristic, ReferenceEvidence>>>;
}

export interface ReferenceServiceOptions {
  readonly projectRoot: string;
  readonly analyzer?: ReferenceAnalyzer;
  readonly analyzerDeadlineMs?: number;
  readonly maxBytes?: number;
  readonly maxPixels?: number;
}

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const URL_OR_SECRET = /(?:https?:\/\/|data:|(?:api[-_ ]?key|secret|token|tracking[-_ ]?id|author|gps|latitude|longitude)\s*[:=])/i;
const SAFE_NAME = /[^\p{L}\p{N}._ -]/gu;
const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;
const DEFAULT_MAX_PIXELS = 40_000_000;

function sha(value: Uint8Array | string): string { return createHash("sha256").update(value).digest("hex"); }
function safeFilename(value: string): string {
  const base = path.basename(value || "reference").replace(SAFE_NAME, "_").slice(0, 120);
  if (!base || base === "." || base === ".." || value.includes("\0") || value !== path.basename(value)) throw new ReferenceError("REFERENCE_FILENAME_INVALID");
  return base;
}
function isCharacteristic(value: string): value is ReferenceCharacteristic { return (REFERENCE_CHARACTERISTICS as readonly string[]).includes(value); }
function boundedText(value: string, limit: number): string { return value.replace(/\0/g, "").slice(0, limit); }
function unknown(summary = "No observable evidence in this reference"): ReferenceEvidence { return { confidence: "unknown", summary }; }

function defaultEvidence(input: { kind: ReferenceKind; width?: number; height?: number; text?: string; figma?: unknown }): Readonly<Record<ReferenceCharacteristic, ReferenceEvidence>> {
  const visual = input.kind !== "markdown" && input.kind !== "design-dna";
  const approved = input.kind === "design-dna";
  const lowResolution = visual && ((input.width ?? 0) < 320 || (input.height ?? 0) < 240);
  const textual = input.kind === "markdown";
  const present = (summary: string): ReferenceEvidence => ({ confidence: lowResolution ? "low" : "medium", summary });
  return {
    "page-structure": visual || textual ? present("Observable grouping and page regions") : approved ? { confidence: "high", summary: "Approved local project reference structure" } : unknown(),
    "component-arrangement": visual || textual ? present("Observable component ordering and grouping") : approved ? { confidence: "high", summary: "Approved local project component arrangement" } : unknown(),
    colors: visual ? present("Observable raster color relationships; exact values are intentionally omitted") : textual ? present("Explicit color guidance in the sanitized specification, if selected") : unknown(),
    typography: visual ? present("Observable type hierarchy; font identity is not inferred") : textual ? present("Explicit typography guidance in the sanitized specification, if selected") : unknown(),
    "interaction-behavior": textual && /interaction|hover|click|keyboard|focus/i.test(input.text ?? "") ? present("Explicit interaction guidance in the sanitized specification") : unknown("Static references do not prove interaction behavior"),
    "content-density": visual || textual ? present("Observable information density") : unknown(),
    "navigation-pattern": visual || textual ? present("Observable or explicitly described navigation pattern") : unknown(),
    "responsive-behavior": textual && /responsive|mobile|tablet|breakpoint/i.test(input.text ?? "") ? present("Explicit responsive guidance in the sanitized specification") : unknown("Static references do not prove responsive behavior"),
  };
}

function png(bytes: Uint8Array, maxPixels: number): { bytes: Uint8Array; width: number; height: number; transformations: string[] } {
  const source = Buffer.from(bytes);
  if (source.length < 33 || !source.subarray(0, 8).equals(PNG_SIGNATURE)) throw new ReferenceError("REFERENCE_MIME_SPOOFED");
  let offset = 8; let width = 0; let height = 0; let sawIhdr = false; let sawIend = false; const chunks: Buffer[] = [PNG_SIGNATURE]; let stripped = false;
  while (offset + 12 <= source.length) {
    const length = source.readUInt32BE(offset);
    if (length > source.length - offset - 12) throw new ReferenceError("REFERENCE_PNG_CORRUPT");
    const type = source.toString("ascii", offset + 4, offset + 8);
    const end = offset + 12 + length;
    if (!/^[A-Za-z]{4}$/.test(type)) throw new ReferenceError("REFERENCE_PNG_CORRUPT");
    if (type === "IHDR") { if (sawIhdr || length !== 13) throw new ReferenceError("REFERENCE_PNG_CORRUPT"); sawIhdr = true; width = source.readUInt32BE(offset + 8); height = source.readUInt32BE(offset + 12); }
    if (["IHDR", "PLTE", "IDAT", "IEND", "tRNS", "gAMA", "cHRM", "sRGB", "iCCP"].includes(type)) chunks.push(source.subarray(offset, end)); else stripped = true;
    if (type === "IEND") { sawIend = true; offset = end; break; }
    offset = end;
  }
  if (!sawIhdr || !sawIend || offset !== source.length || width < 1 || height < 1) throw new ReferenceError("REFERENCE_PNG_CORRUPT");
  if (width * height > maxPixels) throw new ReferenceError("REFERENCE_IMAGE_DIMENSIONS_EXCEEDED");
  return { bytes: Buffer.concat(chunks), width, height, transformations: stripped ? ["stripped ancillary PNG metadata"] : [] };
}

function sanitizeMarkdown(bytes: Uint8Array): { bytes: Uint8Array; text: string; transformations: string[] } {
  let text = new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/\r\n?/g, "\n");
  if (text.length > 512 * 1024) throw new ReferenceError("REFERENCE_MARKDOWN_TOO_LARGE");
  const before = text;
  text = text.replace(/<!--[^]*?-->/g, "").replace(/<[^>]+>/g, "").replace(/!?\[[^\]]*\]\([^)]*\)/g, "[redacted link]").replace(/https?:\/\/\S+/gi, "[redacted URL]").replace(/^\s*(?:api[-_ ]?key|secret|token|tracking[-_ ]?id|author|gps|latitude|longitude)\s*[:=].*$/gim, "[redacted metadata]").replace(/^\s*(?:logo|brand(?: name)?|marketing copy)\s*[:=].*$/gim, "[redacted protected copy]");
  return { bytes: Buffer.from(text, "utf8"), text, transformations: text === before ? [] : ["removed markup, URLs, comments, or secret-like metadata"] };
}

function sanitizeFigma(bytes: Uint8Array): { bytes: Uint8Array; value: unknown; transformations: string[] } {
  let value: unknown;
  try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { throw new ReferenceError("REFERENCE_FIGMA_CORRUPT"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ReferenceError("REFERENCE_FIGMA_CORRUPT");
  let nodes = 0;
  const clean = (item: unknown, depth: number): unknown => {
    if (depth > 40 || ++nodes > 20_000) throw new ReferenceError("REFERENCE_FIGMA_LIMIT_EXCEEDED");
    if (Array.isArray(item)) return item.slice(0, 2_000).map((child) => clean(child, depth + 1));
    if (!item || typeof item !== "object") return typeof item === "string" ? boundedText(URL_OR_SECRET.test(item) ? "[redacted]" : item, 1_000) : item;
    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(item)) {
      if (/^(?:image|images|bytes|data|url|href|pluginData|sharedPluginData|prototypeStartNodeID)$/i.test(key)) continue;
      result[boundedText(key, 100)] = clean(child, depth + 1);
    }
    return result;
  };
  const sanitized = clean(value, 0);
  return { bytes: Buffer.from(JSON.stringify(sanitized)), value: sanitized, transformations: ["removed remote assets, plugin data, URLs, and embedded content"] };
}

async function deadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try { return await Promise.race([promise, new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new ReferenceError("REFERENCE_ANALYZER_TIMEOUT")), ms); timer.unref?.(); })]); }
  finally { if (timer) clearTimeout(timer); }
}

function planHash(plan: AdaptationPlan): string { const { hash: _hash, ...value } = plan; return sha(JSON.stringify(value)); }

export function createReferenceService(options: ReferenceServiceOptions) {
  const root = path.resolve(options.projectRoot); const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES; const maxPixels = options.maxPixels ?? DEFAULT_MAX_PIXELS; const analyzerDeadlineMs = options.analyzerDeadlineMs ?? 5_000;
  const descriptors = new Map<string, ReferenceDescriptor>(); const plans = new Map<string, AdaptationPlan>(); const excerpts = new Map<string, string>(); const guardTerms = new Map<string, readonly string[]>(); const sessionDirs = new Set<string>();
  const analyze = options.analyzer ?? (async (input) => defaultEvidence(input));

  async function finishDescriptor(base: Omit<ReferenceDescriptor, "evidence" | "analysis">, analysisInput: Parameters<ReferenceAnalyzer>[0]): Promise<ReferenceDescriptor> {
    let partial: Partial<Record<ReferenceCharacteristic, ReferenceEvidence>> = {}; let status: ReferenceDescriptor["analysis"] = { status: "complete", code: "REFERENCE_ANALYZED" };
    try { partial = await deadline(analyze(analysisInput), analyzerDeadlineMs); }
    catch (error) { status = { status: "incomplete", code: error instanceof ReferenceError ? error.code : "REFERENCE_ANALYZER_FAILED" }; }
    const defaults = defaultEvidence(analysisInput); const evidence = Object.fromEntries(REFERENCE_CHARACTERISTICS.map((name) => [name, partial[name] ?? defaults[name]])) as unknown as ReferenceDescriptor["evidence"];
    const descriptor = Object.freeze({ ...base, evidence, analysis: status }); descriptors.set(descriptor.id, descriptor); return descriptor;
  }

  async function intake(input: { kind: Exclude<ReferenceKind, "design-dna">; filename: string; mime: string; bytes: Uint8Array; provenance: string; persist: boolean }): Promise<ReferenceDescriptor> {
    if (input.bytes.byteLength < 1 || input.bytes.byteLength > maxBytes) throw new ReferenceError("REFERENCE_SIZE_EXCEEDED");
    const prefix = Buffer.from(input.bytes.subarray(0, Math.min(input.bytes.byteLength, 4_096))).toString("utf8");
    if (/^\s*(?:<\?xml[^>]*>\s*)?<svg\b/i.test(prefix)) throw new ReferenceError("REFERENCE_ACTIVE_SVG");
    if (prefix.startsWith("%PDF-")) throw new ReferenceError(/\/Encrypt\b/.test(prefix) ? "REFERENCE_DOCUMENT_PASSWORD_PROTECTED" : "REFERENCE_DOCUMENT_UNSUPPORTED");
    if (Buffer.from(input.bytes.subarray(0, 4)).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) throw new ReferenceError("REFERENCE_ARCHIVE_UNSUPPORTED");
    if (input.bytes[0] === 0x1f && input.bytes[1] === 0x8b) throw new ReferenceError("REFERENCE_COMPRESSED_CONTENT_UNSUPPORTED");
    const filename = safeFilename(input.filename); const provenance = boundedText(input.provenance.trim(), 500); if (!provenance) throw new ReferenceError("REFERENCE_PROVENANCE_REQUIRED");
    const ext = path.extname(filename).toLowerCase(); let format: ReferenceDescriptor["format"]; let sanitized: Uint8Array; let dimensions: ReferenceDescriptor["dimensions"]; let transformations: string[] = []; let text: string | undefined; let figma: unknown;
    if (["screenshot", "hand-drawn", "site-screenshot"].includes(input.kind)) {
      if (input.mime !== "image/png" || ext !== ".png") throw new ReferenceError("REFERENCE_MIME_SPOOFED");
      const result = png(input.bytes, maxPixels); format = "png"; sanitized = result.bytes; dimensions = { width: result.width, height: result.height }; transformations = result.transformations;
    } else if (input.kind === "markdown") {
      if (!/^(?:text\/markdown|text\/plain)$/.test(input.mime) || ![".md", ".markdown", ".txt"].includes(ext)) throw new ReferenceError("REFERENCE_MIME_SPOOFED");
      const result = sanitizeMarkdown(input.bytes); format = "markdown"; sanitized = result.bytes; text = result.text; transformations = result.transformations;
    } else {
      if (input.mime !== "application/json" || ext !== ".json") throw new ReferenceError("REFERENCE_MIME_SPOOFED");
      const result = sanitizeFigma(input.bytes); format = "figma-json"; sanitized = result.bytes; figma = result.value; transformations = result.transformations;
    }
    const id = randomUUID(); const contentHash = sha(sanitized); let localPath: string; let retention: ReferenceDescriptor["retention"];
    if (input.persist) {
      const directory = path.join(root, ".reframe", "references"); await mkdir(directory, { recursive: true }); const finalPath = path.join(directory, `${id}.${format === "markdown" ? "md" : format === "figma-json" ? "json" : "png"}`); const staging = `${finalPath}.tmp-${process.pid}`; await writeFile(staging, sanitized, { flag: "wx" }); await rename(staging, finalPath); localPath = path.relative(root, finalPath).split(path.sep).join("/"); retention = "persisted";
    } else {
      const directory = await mkdtemp(path.join(tmpdir(), "reframe-reference-")); sessionDirs.add(directory); const finalPath = path.join(directory, `${id}.${format === "markdown" ? "md" : format === "figma-json" ? "json" : "png"}`); await writeFile(finalPath, sanitized, { flag: "wx" }); localPath = finalPath; retention = "session";
    }
    excerpts.set(id, text ?? ""); const canaries = [...Buffer.from(input.bytes).toString("utf8").matchAll(/(?:https?:\/\/\S+|(?:logo|brand|tracking[-_ ]?id|secret|token)\s*[:=]?\s*[\w.-]{3,})/gi)].map((match) => match[0]).slice(0, 64); guardTerms.set(id, canaries);
    return finishDescriptor({ version: 1, id, kind: input.kind, format, mime: input.mime, hash: contentHash, filename, dimensions, pages: 1, provenance, retention, localPath, transformations }, { kind: input.kind, width: dimensions?.width, height: dimensions?.height, text, figma });
  }

  async function intakePath(input: Omit<Parameters<typeof intake>[0], "bytes"> & { sourcePath: string }): Promise<ReferenceDescriptor> {
    const info = await lstat(input.sourcePath).catch(() => { throw new ReferenceError("REFERENCE_PATH_INVALID"); });
    if (!info.isFile() || info.isSymbolicLink()) throw new ReferenceError("REFERENCE_PATH_UNSAFE");
    await realpath(input.sourcePath); return intake({ ...input, bytes: await readFile(input.sourcePath) });
  }

  async function approvedDna(input: { id: string; version: string; provenance: string; designDna: DesignDnaContext }): Promise<ReferenceDescriptor> {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(input.id) || input.version !== input.designDna.version) throw new ReferenceError("REFERENCE_DNA_INVALID");
    return finishDescriptor({ version: 1, id: randomUUID(), kind: "design-dna", format: "design-dna", mime: "application/vnd.reframe.design-dna+json", hash: sha(`${input.id}:${input.version}`), filename: input.id, pages: 0, provenance: boundedText(input.provenance, 500), retention: "approved-dna", approvedDna: { id: input.id, version: input.version }, transformations: [] }, { kind: "design-dna" });
  }

  function createPlan(input: AdaptationPlanInput): AdaptationPlan {
    const descriptor = descriptors.get(input.referenceId); if (!descriptor) throw new ReferenceError("REFERENCE_NOT_FOUND");
    const missing: string[] = []; if (!input.target?.route || !input.target.sourcePath || !input.target.placement) missing.push("target/placement"); if (!input.borrowed?.length) missing.push("borrowing choice"); if (!input.brand) missing.push("brand treatment"); if (!input.expectedFiles?.length) missing.push("expected files");
    const borrowed = [...new Set(input.borrowed)]; if (borrowed.some((item) => !isCharacteristic(item))) missing.push("valid borrowing choice"); if (missing.length) throw new ReferenceError(`REFERENCE_PLAN_MISSING:${missing.join(", ")}`);
    const uncertainties = borrowed.filter((item) => descriptor.evidence[item].confidence === "unknown").map((item) => `${item}: ${descriptor.evidence[item].summary}`);
    if (descriptor.analysis.status !== "complete") uncertainties.unshift(`analysis incomplete: ${descriptor.analysis.code}`);
    if (uncertainties.length && !input.confirmUnknown) throw new ReferenceError("REFERENCE_UNCERTAINTY_CONFIRMATION_REQUIRED");
    const expectedFiles = [...new Set(input.expectedFiles.map((item) => item.replaceAll("\\", "/")))]; if (expectedFiles.some((item) => !item || path.isAbsolute(item) || item.split("/").includes(".."))) throw new ReferenceError("REFERENCE_PLAN_SCOPE_INVALID");
    const plan: AdaptationPlan = Object.freeze({ version: 1, id: randomUUID(), referenceId: descriptor.id, target: { route: boundedText(input.target.route, 2_048), sourcePath: expectedFiles.includes(input.target.sourcePath.replaceAll("\\", "/")) ? input.target.sourcePath.replaceAll("\\", "/") : expectedFiles[0]!, placement: boundedText(input.target.placement, 500) }, borrowed, preserved: REFERENCE_CHARACTERISTICS.filter((item) => !borrowed.includes(item)), brand: input.brand, reuse: [...new Set(input.reuse ?? [])].slice(0, 64), newComponents: [...new Set(input.newComponents ?? [])].slice(0, 64), expectedFiles, responsiveAssumptions: descriptor.evidence["responsive-behavior"].confidence === "unknown" ? ["Reference does not prove responsive behavior; verify generated project"] : [descriptor.evidence["responsive-behavior"].summary], prohibitedCopy: ["logos", "brand names", "marketing copy", "tracking IDs", "remote URLs", "embedded assets"], uncertainties, verificationViewports: [375, 768, 1280], designDnaVersion: input.designDna?.version, status: "draft" }); plans.set(plan.id, plan); return plan;
  }

  function freeze(planId: string): AdaptationPlan {
    const current = plans.get(planId); if (!current) throw new ReferenceError("REFERENCE_PLAN_NOT_FOUND"); const descriptor = descriptors.get(current.referenceId)!;
    if (descriptor.analysis.status !== "complete") throw new ReferenceError("REFERENCE_ANALYSIS_INCOMPLETE");
    const frozen = Object.freeze({ ...current, status: "frozen" as const, hash: planHash({ ...current, status: "frozen" }) }); plans.set(planId, frozen); return frozen;
  }

  function packet(planId: string): ReferencePacketContext {
    const plan = plans.get(planId); if (!plan || plan.status !== "frozen" || !plan.hash) throw new ReferenceError("REFERENCE_PLAN_NOT_FROZEN"); const descriptor = descriptors.get(plan.referenceId)!;
    const evidence = Object.fromEntries(plan.borrowed.map((item) => [item, descriptor.evidence[item]])); const selectedExcerpt = descriptor.kind === "markdown" ? boundedText(excerpts.get(descriptor.id) ?? "", 16 * 1024) : undefined;
    const result: ReferencePacketContext = { descriptor: { version: descriptor.version, id: descriptor.id, kind: descriptor.kind, format: descriptor.format, hash: descriptor.hash, dimensions: descriptor.dimensions, pages: descriptor.pages, provenance: descriptor.provenance, transformations: descriptor.transformations }, evidence, plan, selectedExcerpt };
    if (Buffer.byteLength(JSON.stringify(result)) > REFERENCE_PACKET_BUDGET) throw new ReferenceError("REFERENCE_PACKET_TOO_LARGE"); return result;
  }

  function copyGuard(planId: string, values: readonly string[]): void {
    const plan = plans.get(planId); if (!plan) throw new ReferenceError("REFERENCE_PLAN_NOT_FOUND"); const terms = guardTerms.get(plan.referenceId) ?? [];
    for (const value of values) if (/https?:\/\/|data:|<script|<svg/i.test(value) || terms.some((term) => term.length >= 4 && value.toLowerCase().includes(term.toLowerCase()))) throw new ReferenceError("REFERENCE_COPY_GUARD");
  }

  async function close(): Promise<void> { await Promise.all([...sessionDirs].map((directory) => rm(directory, { recursive: true, force: true }))); sessionDirs.clear(); }
  return { intake, intakePath, approvedDna, createPlan, freeze, packet, copyGuard, descriptor: (id: string) => descriptors.get(id), plan: (id: string) => plans.get(id), close };
}

export type ReferenceService = ReturnType<typeof createReferenceService>;
