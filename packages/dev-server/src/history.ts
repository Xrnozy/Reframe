import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { chmod, mkdir, open, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { EditPlan, WidthEditRequest } from "./source-editor.js";

export type ScreenshotStage = "before" | "after";
export type ScreenshotKind = "page" | "component";

export interface GitSnapshot {
  readonly available: boolean;
  readonly head: string | null;
  readonly entries: readonly string[];
  readonly error?: string;
}

export interface HistoryPreflight {
  readonly repository: GitSnapshot;
  readonly beforeScreenshots: Readonly<Record<ScreenshotKind, ScreenshotCapture>>;
}

export interface ScreenshotCapture { readonly record: ScreenshotRecord; readonly bytes?: Uint8Array }

export interface HistoryFileInput {
  readonly relativePath: string;
  readonly beforeBytes: Uint8Array;
  readonly afterBytes: Uint8Array;
  readonly mode: number;
  readonly range: { readonly start: number; readonly end: number };
}

export interface CheckpointInput {
  readonly kind?: "edit" | "safety";
  readonly files: readonly HistoryFileInput[];
  readonly request: WidthEditRequest;
  readonly plan: EditPlan;
  readonly preflight: HistoryPreflight;
  readonly verificationMs: number;
  readonly ai?: { readonly prompt: string; readonly conversationId: string; readonly generationId: string; readonly lineage: readonly string[]; readonly designDnaVersion?: string; readonly reference?: ReferenceCheckpoint };
}

export interface CheckpointSummary {
  readonly id: string;
  readonly parentId: string | null;
  readonly kind: "edit" | "safety";
  readonly createdAt: string;
  readonly valid: boolean;
  readonly visualComplete: boolean;
  readonly files: readonly string[];
  readonly route?: string;
  readonly viewport?: { readonly width: number; readonly height: number };
  readonly promptSummary?: string;
  readonly verification?: "passed" | "unavailable";
  readonly screenshots?: CheckpointMetadata["screenshots"];
  readonly error?: string;
}
export interface ReferenceCheckpoint { readonly referenceId: string; readonly provenance: string; readonly hash: string; readonly selectedTraits: readonly string[]; readonly brandTreatment: "preserve" | "blend" | "follow"; readonly planId: string; readonly planHash: string; readonly responsive: readonly { readonly width: number; readonly passed: boolean; readonly findings: readonly string[] }[]; readonly conflicts: readonly string[] }

export interface HistoryState {
  readonly currentId: string | null;
  readonly gitAvailable: boolean;
  readonly dirty: boolean;
  readonly checkpoints: readonly CheckpointSummary[];
  readonly incomplete: readonly string[];
}

interface ArtifactRecord { readonly path: string; readonly hash: string; readonly bytes: number }
interface StoredFile { readonly path: string; readonly beforeHash: string; readonly afterHash: string; readonly mode: number; readonly range: { readonly start: number; readonly end: number }; readonly beforeArtifact: string; readonly afterArtifact: string }
export interface CheckpointMetadata {
  readonly version: 1;
  readonly id: string;
  readonly parentId: string | null;
  readonly kind: "edit" | "safety";
  readonly createdAt: string;
  readonly files: readonly StoredFile[];
  readonly edit: { readonly type: string; readonly sourceIdentity: string; readonly selectedElement: WidthEditRequest["fingerprint"]; readonly route: string; readonly viewport: { readonly width: number; readonly height: number }; readonly beforeWidth: number; readonly afterWidth: number; readonly overlapAccepted: boolean };
  readonly screenshots: { readonly before: Readonly<Record<ScreenshotKind, ScreenshotRecord>>; readonly after: Readonly<Record<ScreenshotKind, ScreenshotRecord>>; readonly visualComplete: boolean };
  readonly verification: { readonly status: "passed"; readonly durationMs: number };
  readonly repository: GitSnapshot;
  readonly artifacts: readonly ArtifactRecord[];
  readonly ai?: { readonly prompt: string; readonly conversationId: string; readonly generationId: string; readonly lineage: readonly string[]; readonly designDnaVersion?: string; readonly reference?: ReferenceCheckpoint };
}
export interface ScreenshotRecord { readonly status: "captured" | "unavailable" | "failed" | "excluded"; readonly path?: string; readonly hash?: string; readonly error?: string }

export interface HistoryOperations {
  readonly writeFile: typeof writeFile;
  readonly rename: typeof rename;
  readonly mkdir: typeof mkdir;
  readonly rm: typeof rm;
}

export interface HistoryStoreOptions {
  readonly projectRoot: string;
  readonly captureScreenshot?: (stage: ScreenshotStage, context: Pick<CheckpointInput, "plan" | "request">, kind: ScreenshotKind) => Promise<Uint8Array>;
  readonly allowScreenshot?: (stage: ScreenshotStage, context: Pick<CheckpointInput, "plan" | "request">, kind: ScreenshotKind) => boolean;
  readonly verifyRestore?: (metadata: Readonly<CheckpointMetadata>, recovery: boolean) => boolean | Promise<boolean>;
  readonly gitRunner?: (args: readonly string[], cwd: string) => Promise<{ code: number; stdout: string; stderr: string }>;
  readonly operations?: Partial<HistoryOperations>;
  readonly now?: () => Date;
  readonly createId?: () => string;
  readonly screenshotTimeoutMs?: number;
}

const projectLocks = new Map<string, Promise<void>>();
const allowedGitCommands = new Set(["rev-parse", "status", "diff"]);

function sha256(value: Uint8Array | string): string { return createHash("sha256").update(value).digest("hex"); }
function normalized(relativePath: string): string { return relativePath.split(path.sep).join("/"); }
function inside(root: string, target: string): boolean { const relative = path.relative(root, target); return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative)); }
function targetPath(root: string, relativePath: string): string {
  if (!relativePath || relativePath.includes("\0") || path.isAbsolute(relativePath) || relativePath.split(/[\\/]/).includes("..")) throw new Error("PATH_OUTSIDE_ROOT");
  const target = path.resolve(root, relativePath);
  if (!inside(root, target)) throw new Error("PATH_OUTSIDE_ROOT");
  return target;
}
function lineAt(source: string, offset: number): number { let line = 1; for (let index = 0; index < offset; index += 1) if (source.charCodeAt(index) === 10) line += 1; return line; }
function pngValid(bytes: Uint8Array): boolean {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return bytes.length >= 20 && Buffer.from(bytes.subarray(0, 8)).equals(signature) && Buffer.from(bytes).includes(Buffer.from("IEND"));
}
function patch(files: readonly HistoryFileInput[], reverse: boolean): string {
  return files.map((file) => {
    const before = Buffer.from(reverse ? file.afterBytes : file.beforeBytes).toString("utf8").replace(/\r\n/g, "\n").split("\n");
    const after = Buffer.from(reverse ? file.beforeBytes : file.afterBytes).toString("utf8").replace(/\r\n/g, "\n").split("\n");
    const name = normalized(file.relativePath);
    return [`--- a/${name}`, `+++ b/${name}`, `@@ -1,${before.length} +1,${after.length} @@`, ...before.map((line) => `-${line}`), ...after.map((line) => `+${line}`)].join("\n");
  }).join("\n");
}

async function defaultGitRunner(args: readonly string[], cwd: string): Promise<{ code: number; stdout: string; stderr: string }> {
  if (!allowedGitCommands.has(args[0] ?? "")) throw new Error("GIT_COMMAND_FORBIDDEN");
  return new Promise((resolve) => {
    execFile("git", [...args], { cwd, windowsHide: true, encoding: "utf8", maxBuffer: 4 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_PAGER: "cat" } }, (error, stdout, stderr) => {
      resolve({ code: typeof (error as NodeJS.ErrnoException | null)?.code === "number" ? (error as NodeJS.ErrnoException & { code: number }).code : error ? 1 : 0, stdout, stderr });
    });
  });
}

function changedLines(diff: string): Array<{ start: number; end: number }> {
  return [...diff.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)].map((match) => {
    const start = Number(match[1]);
    const count = Number(match[2] ?? 1);
    return { start, end: count === 0 ? start : start + count - 1 };
  });
}

export function createHistoryStore(options: HistoryStoreOptions) {
  const root = path.resolve(options.projectRoot);
  const historyRoot = path.join(root, ".reframe", "history");
  const ops: HistoryOperations = { writeFile, rename, mkdir, rm, ...options.operations };
  const git = options.gitRunner ?? defaultGitRunner;
  const gitAudit: string[][] = [];
  const screenshotTimeoutMs = options.screenshotTimeoutMs ?? 2_000;
  let unavailableRepository: GitSnapshot | undefined;

  async function runGit(args: readonly string[]): Promise<{ code: number; stdout: string; stderr: string }> {
    if (!allowedGitCommands.has(args[0] ?? "")) throw new Error("GIT_COMMAND_FORBIDDEN");
    gitAudit.push([...args]);
    return git(args, root);
  }

  async function inspectGit(): Promise<GitSnapshot> {
    if (unavailableRepository) return unavailableRepository;
    try {
      const repository = await runGit(["rev-parse", "--is-inside-work-tree"]);
      if (repository.code !== 0 || repository.stdout.trim() !== "true") return unavailableRepository = { available: false, head: null, entries: [], error: repository.stderr.trim() || "NOT_A_GIT_REPOSITORY" };
      const [head, statusResult] = await Promise.all([runGit(["rev-parse", "HEAD"]), runGit(["status", "--porcelain=v1", "-z", "--untracked-files=all"])]);
      const entries = statusResult.stdout.split("\0").filter(Boolean).sort();
      return { available: true, head: head.code === 0 ? head.stdout.trim() : null, entries };
    } catch (error) {
      return unavailableRepository = { available: false, head: null, entries: [], error: error instanceof Error ? error.message : String(error) };
    }
  }

  async function capture(stage: ScreenshotStage, context: Pick<CheckpointInput, "plan" | "request">, kind: ScreenshotKind): Promise<ScreenshotCapture> {
    if (options.allowScreenshot?.(stage, context, kind) === false) return { record: { status: "excluded", error: "PRIVACY_EXCLUDED" } };
    if (!options.captureScreenshot) return { record: { status: "unavailable", error: "SCREENSHOT_SERVICE_UNAVAILABLE" } };
    try {
      const bytes = Buffer.from(await Promise.race([
        options.captureScreenshot(stage, context, kind),
        new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error("SCREENSHOT_TIMEOUT")), screenshotTimeoutMs)),
      ]));
      if (!pngValid(bytes)) return { record: { status: "failed", error: "SCREENSHOT_INVALID" } };
      return { record: { status: "captured", hash: sha256(bytes) }, bytes };
    } catch (error) {
      return { record: { status: "failed", error: error instanceof Error ? error.message : String(error) } };
    }
  }

  async function prepareEdit(plan: EditPlan, request: WidthEditRequest): Promise<HistoryPreflight> {
    const repository = await inspectGit();
    const [page, component] = await Promise.all([capture("before", { plan, request }, "page"), capture("before", { plan, request }, "component")]);
    const beforeScreenshots = { page, component };
    if (!repository.available) return { repository, beforeScreenshots };
    const target = targetPath(root, plan.relativePath);
    const source = await readFile(target, "utf8");
    const startLine = lineAt(source, plan.range.start);
    const endLine = lineAt(source, plan.range.end);
    const relative = normalized(plan.relativePath);
    const currentId = await readCurrent();
    const currentMetadata = currentId ? await validateDirectory(path.join(historyRoot, currentId), currentId).catch(() => undefined) : undefined;
    const owned = currentMetadata?.files.some((file) => file.path === relative && (file.afterHash === sha256(Buffer.from(source)) || file.beforeHash === sha256(Buffer.from(source))));
    const untracked = repository.entries.some((entry) => entry.startsWith("?? ") && entry.slice(3) === relative);
    if (untracked) throw new Error(`USER_CHANGE_OVERLAP:${relative}:${startLine}-${endLine}`);
    const diffs = await Promise.all([
      runGit(["diff", "--unified=0", "--no-ext-diff", "--", relative]),
      runGit(["diff", "--cached", "--unified=0", "--no-ext-diff", "--", relative]),
    ]);
    const overlap = diffs.flatMap(({ stdout }) => changedLines(stdout)).some((range) => range.start <= endLine && range.end >= startLine);
    if (overlap && !owned && !request.overlapAccepted) throw new Error(`USER_CHANGE_OVERLAP:${relative}:${startLine}-${endLine}`);
    return { repository, beforeScreenshots };
  }

  async function writeDurable(file: string, value: Uint8Array | string): Promise<void> {
    await ops.writeFile(file, value);
    const handle = await open(file, "r");
    try { await handle.sync(); } catch (error) { if (!(["EPERM", "EINVAL"] as Array<string | undefined>).includes((error as NodeJS.ErrnoException).code)) throw error; }
    finally { await handle.close(); }
  }

  async function ensureHistoryRoot(): Promise<void> {
    await ops.mkdir(historyRoot, { recursive: true });
    try { await writeFile(path.join(root, ".reframe", ".gitignore"), "history/\n.gitignore\n", { flag: "wx" }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
  }

  async function move(from: string, to: string): Promise<void> {
    for (let attempt = 0; ; attempt += 1) {
      try { await ops.rename(from, to); return; }
      catch (error) {
        if (!(["EPERM", "EACCES", "EBUSY"] as Array<string | undefined>).includes((error as NodeJS.ErrnoException).code) || attempt >= 5) throw error;
        await new Promise((resolve) => setTimeout(resolve, 10 * 2 ** attempt));
      }
    }
  }

  async function readCurrent(): Promise<string | null> {
    try { const value = JSON.parse(await readFile(path.join(historyRoot, "current.json"), "utf8")); return typeof value.currentId === "string" ? value.currentId : null; }
    catch { return null; }
  }

  async function writeCurrent(currentId: string | null): Promise<void> {
    await ensureHistoryRoot();
    const temporary = path.join(historyRoot, `.current-${randomUUID()}.tmp`);
    try {
      await writeDurable(temporary, `${JSON.stringify({ currentId })}\n`);
      await move(temporary, path.join(historyRoot, "current.json"));
    } catch (error) {
      await ops.rm(temporary, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  async function screenshot(stage: ScreenshotStage, kind: ScreenshotKind, input: CheckpointInput, directory: string, artifacts: ArtifactRecord[]): Promise<ScreenshotRecord> {
    const captured = stage === "before" ? input.preflight.beforeScreenshots[kind] : await capture(stage, input, kind);
    if (captured.record.status === "captured" && captured.bytes) {
      const bytes = Buffer.from(captured.bytes);
      const name = `${stage}-${kind}.png`;
      await writeDurable(path.join(directory, name), bytes);
      const record = { path: name, hash: sha256(bytes), bytes: bytes.length };
      artifacts.push(record);
      return { status: "captured", path: name, hash: record.hash };
    }
    return captured.record;
  }

  async function publish(input: CheckpointInput, parentId?: string | null): Promise<CheckpointMetadata> {
    const resolvedParentId = parentId === undefined ? await readCurrent() : parentId;
    const id = options.createId?.() ?? randomUUID();
    const temporary = path.join(historyRoot, `.tmp-${id}`);
    const final = path.join(historyRoot, id);
    const artifacts: ArtifactRecord[] = [];
    await ensureHistoryRoot();
    await ops.mkdir(temporary, { recursive: false });
    try {
      for (let index = 0; index < input.files.length; index += 1) {
        const file = input.files[index]!;
        const beforeArtifact = `file-${index}-before.bin`;
        const afterArtifact = `file-${index}-after.bin`;
        for (const [name, bytes] of [[beforeArtifact, file.beforeBytes], [afterArtifact, file.afterBytes]] as const) {
          await writeDurable(path.join(temporary, name), bytes);
          artifacts.push({ path: name, hash: sha256(bytes), bytes: bytes.length });
        }
      }
      for (const [name, value] of [["before.patch", patch(input.files, true)], ["after.patch", patch(input.files, false)]] as const) {
        await writeDurable(path.join(temporary, name), value);
        artifacts.push({ path: name, hash: sha256(value), bytes: Buffer.byteLength(value) });
      }
      const beforeScreenshots = { page: await screenshot("before", "page", input, temporary, artifacts), component: await screenshot("before", "component", input, temporary, artifacts) };
      const afterScreenshots = { page: await screenshot("after", "page", input, temporary, artifacts), component: await screenshot("after", "component", input, temporary, artifacts) };
      const files: StoredFile[] = input.files.map((file, index) => ({ path: normalized(file.relativePath), beforeHash: sha256(file.beforeBytes), afterHash: sha256(file.afterBytes), mode: file.mode, range: file.range, beforeArtifact: `file-${index}-before.bin`, afterArtifact: `file-${index}-after.bin` }));
      const metadata: CheckpointMetadata = {
        version: 1, id, parentId: resolvedParentId, kind: input.kind ?? "edit", createdAt: (options.now?.() ?? new Date()).toISOString(), files,
        edit: { type: input.plan.stylingMode, sourceIdentity: input.plan.sourceIdentity, selectedElement: input.request.fingerprint, route: input.request.fingerprint.route, viewport: input.request.fingerprint.viewport, beforeWidth: input.request.currentWidth, afterWidth: input.request.width, overlapAccepted: Boolean(input.request.overlapAccepted) },
        screenshots: { before: beforeScreenshots, after: afterScreenshots, visualComplete: [...Object.values(beforeScreenshots), ...Object.values(afterScreenshots)].every((record) => record.status === "captured") },
        verification: { status: "passed", durationMs: input.verificationMs }, repository: input.preflight.repository, artifacts, ai: input.ai,
      };
      const serializedMetadata = `${JSON.stringify(metadata, null, 2)}\n`;
      await writeDurable(path.join(temporary, "metadata.json"), serializedMetadata);
      await writeDurable(path.join(temporary, "metadata.sha256"), `${sha256(serializedMetadata)}\n`);
      await validateDirectory(temporary, id);
      await move(temporary, final);
      try { await writeCurrent(id); }
      catch (error) { await ops.rm(final, { recursive: true, force: true }); throw error; }
      return metadata;
    } catch (error) {
      await ops.rm(temporary, { recursive: true, force: true }).catch(() => undefined);
      throw error;
    }
  }

  async function validateDirectory(directory: string, expectedId = path.basename(directory)): Promise<CheckpointMetadata> {
    const serializedMetadata = await readFile(path.join(directory, "metadata.json"), "utf8");
    const expectedMetadataHash = (await readFile(path.join(directory, "metadata.sha256"), "utf8")).trim();
    if (sha256(serializedMetadata) !== expectedMetadataHash) throw new Error("CHECKPOINT_METADATA_CORRUPT");
    const metadata = JSON.parse(serializedMetadata) as CheckpointMetadata;
    if (metadata.version !== 1 || metadata.id !== expectedId || !Array.isArray(metadata.files) || !Array.isArray(metadata.artifacts)) throw new Error("CHECKPOINT_SCHEMA_INVALID");
    for (const artifact of metadata.artifacts) {
      const bytes = await readFile(targetPath(directory, artifact.path));
      if (bytes.length !== artifact.bytes || sha256(bytes) !== artifact.hash) throw new Error(`CHECKPOINT_CORRUPT:${artifact.path}`);
    }
    for (const stage of [...Object.values(metadata.screenshots.before), ...Object.values(metadata.screenshots.after)]) {
      if (stage.status === "captured" && (!stage.path || !pngValid(await readFile(targetPath(directory, stage.path))))) throw new Error("CHECKPOINT_SCREENSHOT_CORRUPT");
    }
    return metadata;
  }

  async function withLock<T>(work: () => Promise<T>): Promise<T> {
    const key = root;
    const previous = projectLocks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    const chain = previous.then(() => current);
    projectLocks.set(key, chain);
    await previous;
    try { return await work(); }
    finally { release(); if (projectLocks.get(key) === chain) projectLocks.delete(key); }
  }

  async function createCheckpoint(input: CheckpointInput): Promise<CheckpointMetadata> { return withLock(() => publish(input)); }

  async function state(): Promise<HistoryState> {
    await ensureHistoryRoot();
    const entries = await readdir(historyRoot, { withFileTypes: true });
    const incomplete = entries.filter((entry) => entry.isDirectory() && entry.name.startsWith(".tmp-")).map((entry) => entry.name).sort();
    const checkpoints: CheckpointSummary[] = [];
    for (const entry of entries.filter((item) => item.isDirectory() && !item.name.startsWith(".")).sort((left, right) => left.name.localeCompare(right.name))) {
      try {
        const metadata = await validateDirectory(path.join(historyRoot, entry.name), entry.name);
        checkpoints.push({ id: metadata.id, parentId: metadata.parentId, kind: metadata.kind, createdAt: metadata.createdAt, valid: true, visualComplete: metadata.screenshots.visualComplete, files: metadata.files.map((file) => file.path), route: metadata.edit.route, viewport: metadata.edit.viewport, promptSummary: (metadata.ai?.prompt ?? metadata.edit.type).replace(/\s+/g, " ").trim().slice(0, 160), verification: metadata.verification.status, screenshots: metadata.screenshots });
      } catch (error) {
        checkpoints.push({ id: entry.name, parentId: null, kind: "edit", createdAt: "", valid: false, visualComplete: false, files: [], error: error instanceof Error ? error.message : String(error) });
      }
    }
    const repository = await inspectGit();
    checkpoints.sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
    return { currentId: await readCurrent(), gitAvailable: repository.available, dirty: repository.entries.length > 0, checkpoints, incomplete };
  }

  async function readScreenshot(checkpointId: string, stage: ScreenshotStage, kind: ScreenshotKind): Promise<{ record: ScreenshotRecord; bytes?: Uint8Array }> {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(checkpointId)) throw new Error("CHECKPOINT_ID_INVALID");
    const directory = path.join(historyRoot, checkpointId);
    const metadata = await validateDirectory(directory, checkpointId);
    const record = metadata.screenshots[stage][kind];
    return record.status === "captured" && record.path ? { record, bytes: await readFile(targetPath(directory, record.path)) } : { record };
  }

  async function atomicRestore(file: StoredFile, bytes: Uint8Array): Promise<void> {
    const target = targetPath(root, file.path);
    const temporary = `${target}.reframe-restore-${randomUUID()}.tmp`;
    try { await writeDurable(temporary, bytes); await move(temporary, target); await chmod(target, file.mode); }
    catch (error) { await ops.rm(temporary, { force: true }).catch(() => undefined); throw error; }
  }

  async function restorePrevious(): Promise<{ restoredFrom: string; currentId: string | null; safetyId: string }> {
    return withLock(async () => {
      const currentId = await readCurrent();
      if (!currentId) throw new Error("NO_PREVIOUS_CHECKPOINT");
      const metadata = await validateDirectory(path.join(historyRoot, currentId), currentId);
      const currentFiles = await Promise.all(metadata.files.map(async (file) => ({ file, bytes: await readFile(targetPath(root, file.path)) })));
      for (const { file, bytes } of currentFiles) if (sha256(bytes) !== file.afterHash) throw new Error(`RESTORE_FILE_STALE:${file.path}`);
      const safetyInput: CheckpointInput = {
        kind: "safety",
        files: currentFiles.map(({ file, bytes }) => ({ relativePath: file.path, beforeBytes: bytes, afterBytes: bytes, mode: file.mode, range: file.range })),
        request: { fingerprint: { tag: "body", id: null, classes: [], text: "", parent: null, route: metadata.edit.route, viewport: metadata.edit.viewport }, currentWidth: metadata.edit.afterWidth, width: metadata.edit.afterWidth },
        plan: { relativePath: metadata.files[0]!.path, range: metadata.files[0]!.range, sourceIdentity: `safety:${currentId}`, route: metadata.edit.route, expectedHash: metadata.files[0]!.afterHash, before: "", after: "", stylingMode: "vanilla-css", confidence: "exact", evidence: "Pre-restore safety checkpoint", impact: { shared: false, locations: metadata.files.map((file) => file.path) }, allowedChangedFiles: metadata.files.map((file) => file.path) },
        preflight: { repository: await inspectGit(), beforeScreenshots: { page: { record: { status: "unavailable", error: "SAFETY_CHECKPOINT" } }, component: { record: { status: "unavailable", error: "SAFETY_CHECKPOINT" } } } }, verificationMs: 0,
      };
      const safety = await publish(safetyInput, currentId);
      try {
        for (const file of metadata.files) await atomicRestore(file, await readFile(path.join(historyRoot, currentId, file.beforeArtifact)));
        if (options.verifyRestore && !await options.verifyRestore(metadata, false)) throw new Error("RESTORE_VERIFICATION_FAILED");
        await writeDurable(path.join(historyRoot, currentId, "restore.json"), `${JSON.stringify({ status: "passed", restoredAt: (options.now?.() ?? new Date()).toISOString(), safetyId: safety.id })}\n`);
        await writeCurrent(metadata.parentId);
        return { restoredFrom: currentId, currentId: metadata.parentId, safetyId: safety.id };
      } catch (error) {
        let recovered = true;
        try {
          for (const { file, bytes } of currentFiles) await atomicRestore(file, bytes);
          if (options.verifyRestore) recovered = Boolean(await options.verifyRestore(metadata, true));
        } catch { recovered = false; }
        await writeDurable(path.join(historyRoot, safety.id, "restore-failed.json"), `${JSON.stringify({ checkpointId: currentId, recovered, error: error instanceof Error ? error.message : String(error) })}\n`).catch(() => undefined);
        await writeCurrent(currentId);
        throw new Error(`${error instanceof Error ? error.message : String(error)}${recovered ? "" : ":RECOVERY_UNVERIFIED"}`);
      }
    });
  }

  return { prepareEdit, createCheckpoint, state, readScreenshot, restorePrevious, gitAudit: () => gitAudit.map((args) => [...args]) };
}
