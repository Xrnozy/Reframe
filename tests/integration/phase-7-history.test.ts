import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHistoryStore, createSourceEditor, readOnlyGitSpawnOptions, type CheckpointInput, type EditPlan, type HistoryOperations, type WidthEditRequest } from "../../packages/dev-server/src/index.js";
import { projectRoot } from "../helpers/paths.js";

const exec = promisify(execFile);
const owned: string[] = [];
let root: string;
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.from("phase7-IEND-image")]);
const fingerprint = { tag: "article", id: "card", classes: [], text: "Annual", parent: null, route: "/", viewport: { width: 1280, height: 720 } };
const request = (width = 420, currentWidth = 320, extra: Partial<WidthEditRequest> = {}): WidthEditRequest => ({ fingerprint, width, currentWidth, ...extra });

async function put(relative: string, contents: string | Uint8Array): Promise<void> {
  const target = path.join(root, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, contents);
}

async function git(...args: string[]): Promise<string> {
  return (await exec("git", args, { cwd: root, windowsHide: true })).stdout;
}

async function initGit(): Promise<void> {
  await git("init", "-q");
  await git("config", "user.email", "phase7@example.invalid");
  await git("config", "user.name", "Phase 7 Test");
  await git("add", ".");
  await git("commit", "-qm", "fixture");
}

function digest(value: Uint8Array): string { return createHash("sha256").update(value).digest("hex"); }

async function directInput(store: ReturnType<typeof createHistoryStore>, files: Array<{ relativePath: string; before: Buffer; after: Buffer }>, width = 420): Promise<CheckpointInput> {
  const first = files[0]!;
  const plan: EditPlan = {
    relativePath: first.relativePath,
    range: { start: 0, end: first.before.length },
    sourceIdentity: `test:${first.relativePath}`,
    route: "/",
    expectedHash: digest(first.before),
    before: first.before.toString("utf8"),
    after: first.after.toString("utf8"),
    stylingMode: "vanilla-css",
    confidence: "exact",
    evidence: "Phase 7 test plan",
    impact: { shared: files.length > 1, locations: files.map((file) => file.relativePath) },
    allowedChangedFiles: files.map((file) => file.relativePath),
  };
  const editRequest = request(width);
  return {
    files: await Promise.all(files.map(async (file) => ({ relativePath: file.relativePath, beforeBytes: file.before, afterBytes: file.after, mode: (await stat(path.join(root, file.relativePath))).mode, range: { start: 0, end: file.before.length } }))),
    request: editRequest,
    plan,
    preflight: await store.prepareEdit(plan, editRequest),
    verificationMs: 1,
  };
}

async function edit(options: Parameters<typeof createHistoryStore>[0] = { projectRoot: root }) {
  const history = createHistoryStore({ projectRoot: root, captureScreenshot: async () => png, ...options });
  const result = await createSourceEditor({ projectRoot: root, framework: "vanilla", history }).applyWidth(request());
  return { history, result };
}

beforeEach(async () => {
  const base = path.join(projectRoot, "test-results", "phase7-fixtures");
  await mkdir(base, { recursive: true });
  root = await mkdtemp(path.join(base, "case-"));
  owned.push(root);
  await put("index.html", '<article id="card">Annual</article>');
  await put("style.css", "#card { width: 320px; }\n");
});

afterEach(async () => {
  await Promise.all(owned.splice(0).map((directory) => rm(directory, { recursive: true, force: true, maxRetries: 20, retryDelay: 20 })));
});

describe("Phase 7 durable local history", () => {
  it("P7-01 creates complete parseable artifacts for one accepted clean-Git edit", async () => {
    await initGit();
    const { history, result } = await edit();
    expect(result.status).toBe("applied");
    expect(result.visualComplete).toBe(true);
    const state = await history.state();
    expect(state.currentId).toBe(result.checkpointId);
    expect(state.checkpoints).toHaveLength(1);
    expect(state.checkpoints[0]).toMatchObject({ valid: true, visualComplete: true, files: ["style.css"] });
    const directory = path.join(root, ".reframe", "history", result.checkpointId!);
    for (const name of ["metadata.json", "metadata.sha256", "before.patch", "after.patch", "file-0-before.bin", "file-0-after.bin", "before-page.png", "before-component.png", "after-page.png", "after-component.png"]) expect(await stat(path.join(directory, name))).toBeTruthy();
    const metadata = JSON.parse(await readFile(path.join(directory, "metadata.json"), "utf8"));
    expect(metadata.files[0]).toMatchObject({ beforeHash: digest(Buffer.from("#card { width: 320px; }\n")), afterHash: digest(Buffer.from("#card { width: 420px; }\n")) });
  });

  it("P7-04 preserves unrelated staged, unstaged, and untracked work", async () => {
    await put("staged.txt", "base\n");
    await put("unstaged.txt", "base\n");
    await initGit();
    await put("staged.txt", "staged user work\n");
    await git("add", "staged.txt");
    await put("unstaged.txt", "unstaged user work\n");
    await put("untracked.txt", "untracked user work\n");
    const before = { status: await git("status", "--porcelain=v1", "-z"), staged: await git("diff", "--cached"), unstaged: await git("diff", "--", "unstaged.txt"), untracked: await readFile(path.join(root, "untracked.txt")) };
    const { history, result } = await edit();
    expect(result.status).toBe("applied");
    await history.restorePrevious();
    expect(await git("status", "--porcelain=v1", "-z")).toBe(before.status);
    expect(await git("diff", "--cached")).toBe(before.staged);
    expect(await git("diff", "--", "unstaged.txt")).toBe(before.unstaged);
    expect(await readFile(path.join(root, "untracked.txt"))).toEqual(before.untracked);
  });

  it("P7-05 blocks a user modification overlapping the target range", async () => {
    await initGit();
    await put("style.css", "#card { width: 321px; }\n");
    const history = createHistoryStore({ projectRoot: root });
    const result = await createSourceEditor({ projectRoot: root, framework: "vanilla", history }).applyWidth(request(420, 321));
    expect(result).toMatchObject({ status: "rejected" });
    expect(result.code).toContain("USER_CHANGE_OVERLAP");
    expect(await readFile(path.join(root, "style.css"), "utf8")).toContain("321px");
    expect((await history.state()).checkpoints).toHaveLength(0);
    const accepted = await createSourceEditor({ projectRoot: root, framework: "vanilla", history }).applyWidth(request(420, 321, { overlapAccepted: true }));
    expect(accepted).toMatchObject({ status: "applied" });
    expect(await readFile(path.join(root, "style.css"), "utf8")).toBe("#card { width: 420px; }\n");
    expect((await history.state()).checkpoints).toHaveLength(1);
  });

  it("P7-06 refuses tampered metadata, patch, exact bytes, and screenshot artifacts", async () => {
    const mutations = ["metadata.json", "after.patch", "file-0-after.bin", "after-component.png"];
    for (const artifact of mutations) {
      const caseRoot = await mkdtemp(path.join(path.dirname(root), "tamper-"));
      owned.push(caseRoot);
      await writeFile(path.join(caseRoot, "style.css"), "#card { width: 320px; }\n");
      const history = createHistoryStore({ projectRoot: caseRoot, captureScreenshot: async () => png });
      const result = await createSourceEditor({ projectRoot: caseRoot, framework: "vanilla", history }).applyWidth(request());
      await writeFile(path.join(caseRoot, ".reframe", "history", result.checkpointId!, artifact), "tampered");
      await expect(history.restorePrevious()).rejects.toThrow(/CORRUPT|SCREENSHOT|METADATA|Unexpected token/);
      expect((await history.state()).checkpoints[0]?.valid).toBe(false);
    }
  });

  it("P7-07 rolls source back and cleans temporary history for every required write or publish failure", async () => {
    for (const failure of ["file-0-before.bin", "file-0-after.bin", "before.patch", "after.patch", "before-page.png", "before-component.png", "after-page.png", "after-component.png", "metadata.json", "metadata.sha256", "publish"]) {
      const caseRoot = await mkdtemp(path.join(path.dirname(root), "failure-"));
      owned.push(caseRoot);
      await writeFile(path.join(caseRoot, "style.css"), "#card { width: 320px; }\n");
      const nativeWrite = (await import("node:fs/promises")).writeFile;
      const nativeRename = (await import("node:fs/promises")).rename;
      const operations: Partial<HistoryOperations> = {
        writeFile: async (file, data, options) => { if (String(file).endsWith(failure)) throw new Error(`FAIL_${failure}`); return nativeWrite(file, data, options as never); },
        rename: async (from, to) => { if (failure === "publish" && path.basename(String(to)) === "fixed-id") throw new Error("FAIL_publish"); return nativeRename(from, to); },
      };
      const history = createHistoryStore({ projectRoot: caseRoot, captureScreenshot: async () => png, operations, createId: () => "fixed-id" });
      const result = await createSourceEditor({ projectRoot: caseRoot, framework: "vanilla", history }).applyWidth(request());
      expect(result.status).toBe("rolled-back");
      expect(await readFile(path.join(caseRoot, "style.css"), "utf8")).toContain("320px");
      const state = await history.state();
      expect(state.checkpoints).toHaveLength(0);
      expect(state.incomplete).toHaveLength(0);
    }
  });

  it("P7-08 records screenshot timeout and truncation as degraded without risking source", async () => {
    for (const capture of [async () => new Promise<Buffer>(() => undefined), async () => Buffer.from("not-png")]) {
      const caseRoot = await mkdtemp(path.join(path.dirname(root), "degraded-"));
      owned.push(caseRoot);
      await writeFile(path.join(caseRoot, "style.css"), "#card { width: 320px; }\n");
      const history = createHistoryStore({ projectRoot: caseRoot, captureScreenshot: capture, screenshotTimeoutMs: 10 });
      const result = await createSourceEditor({ projectRoot: caseRoot, framework: "vanilla", history }).applyWidth(request());
      expect(result).toMatchObject({ status: "applied", visualComplete: false });
      expect((await history.state()).checkpoints[0]).toMatchObject({ valid: true, visualComplete: false });
      expect(await readFile(path.join(caseRoot, "style.css"), "utf8")).toContain("420px");
    }
  });

  it("P7-09 blocks restore when source changed after history was listed", async () => {
    const { history } = await edit();
    await history.state();
    await put("style.css", "#card { width: 777px; }\n");
    await expect(history.restorePrevious()).rejects.toThrow("RESTORE_FILE_STALE");
    expect(await readFile(path.join(root, "style.css"), "utf8")).toContain("777px");
  });

  it("P7-10 reapplies current bytes and records failure when restore verification fails", async () => {
    let verificationCalls = 0;
    const history = createHistoryStore({ projectRoot: root, captureScreenshot: async () => png, verifyRestore: async (_metadata, recovery) => { verificationCalls += 1; return recovery; } });
    const result = await createSourceEditor({ projectRoot: root, framework: "vanilla", history }).applyWidth(request());
    await expect(history.restorePrevious()).rejects.toThrow("RESTORE_VERIFICATION_FAILED");
    expect(await readFile(path.join(root, "style.css"), "utf8")).toContain("420px");
    expect(verificationCalls).toBe(2);
    const entries = await readdir(path.join(root, ".reframe", "history"), { withFileTypes: true });
    const failureFiles = await Promise.all(entries.filter((entry) => entry.isDirectory() && entry.name !== result.checkpointId).map((entry) => readFile(path.join(root, ".reframe", "history", entry.name, "restore-failed.json"), "utf8").catch(() => "")));
    expect(failureFiles.some((value) => value.includes("RESTORE_VERIFICATION_FAILED"))).toBe(true);
  });

  it("P7-11 reports incomplete crash temporaries while valid history remains readable", async () => {
    const { history, result } = await edit();
    await mkdir(path.join(root, ".reframe", "history", ".tmp-crashed"));
    await writeFile(path.join(root, ".reframe", "history", ".tmp-crashed", "partial"), "partial");
    const restarted = createHistoryStore({ projectRoot: root });
    const state = await restarted.state();
    expect(state.currentId).toBe(result.checkpointId);
    expect(state.checkpoints.find((checkpoint) => checkpoint.id === result.checkpointId)?.valid).toBe(true);
    expect(state.incomplete).toContain(".tmp-crashed");
  });

  it("P7-12 serializes concurrent checkpoints into one consistent parent chain", async () => {
    await put("a.css", "a");
    await put("b.css", "b");
    const ids = ["checkpoint-a", "checkpoint-b"];
    const history = createHistoryStore({ projectRoot: root, createId: () => ids.shift()! });
    const a = await directInput(history, [{ relativePath: "a.css", before: Buffer.from("a"), after: Buffer.from("A") }]);
    const b = await directInput(history, [{ relativePath: "b.css", before: Buffer.from("b"), after: Buffer.from("B") }]);
    await Promise.all([history.createCheckpoint(a), history.createCheckpoint(b)]);
    const state = await history.state();
    expect(state.checkpoints).toHaveLength(2);
    const current = state.checkpoints.find((checkpoint) => checkpoint.id === state.currentId)!;
    expect(current.parentId).not.toBeNull();
    expect(state.checkpoints.find((checkpoint) => checkpoint.id === current.parentId)?.parentId).toBeNull();
  });

  it("P7-13 invokes only allowlisted offline Git inspection commands", async () => {
    await initGit();
    const { history } = await edit();
    await history.state();
    const commands = history.gitAudit();
    expect(commands.length).toBeGreaterThan(0);
    expect(commands.every(([command]) => ["rev-parse", "status", "diff"].includes(command!))).toBe(true);
    expect(commands.flat().some((value) => /push|fetch|pull|remote|add|commit|reset|merge|checkout/.test(value))).toBe(false);
  });

  it("P7-13b disables interactive Git credential prompts for read-only inspection", () => {
    const { globalArgs, configArgs, env } = readOnlyGitSpawnOptions();
    expect(globalArgs).toContain("--no-optional-locks");
    expect(configArgs).toContain("credential.interactive=never");
    expect(configArgs).toContain("credential.helper=");
    expect(configArgs).toContain("status.aheadBehind=false");
    expect(env.GIT_TERMINAL_PROMPT).toBe("0");
    expect(env.GCM_INTERACTIVE).toBe("0");
    expect(env.GCM_GUI_PROMPT).toBe("0");
    expect(env.GIT_ASKPASS).toBe("");
  });

  it("P7-13c reuses cached Git snapshots during frequent history state reads", async () => {
    await initGit();
    const { history } = await edit();
    await history.state();
    const afterFirst = history.gitAudit().length;
    await Promise.all([history.state(), history.state(), history.state()]);
    expect(history.gitAudit().length).toBe(afterFirst);
  });

  it("P7-14 real Git diff removes only the Reframe edit after restore", async () => {
    await put("other.txt", "base\n");
    await initGit();
    await put("other.txt", "user\n");
    const before = await git("diff", "--", "other.txt");
    const { history } = await edit();
    expect(await git("diff", "--", "style.css")).toContain("420px");
    await history.restorePrevious();
    expect(await git("diff", "--", "style.css")).toBe("");
    expect(await git("diff", "--", "other.txt")).toBe(before);
  });

  it("P7-15 completes twenty edit-checkpoint-restore cycles without drift or duplicate IDs", async () => {
    const history = createHistoryStore({ projectRoot: root });
    const original = await readFile(path.join(root, "style.css"));
    for (let cycle = 0; cycle < 20; cycle += 1) {
      const result = await createSourceEditor({ projectRoot: root, framework: "vanilla", history }).applyWidth(request(420 + cycle));
      expect(result.status).toBe("applied");
      await history.restorePrevious();
      expect(await readFile(path.join(root, "style.css"))).toEqual(original);
    }
    const state = await history.state();
    expect(new Set(state.checkpoints.map((checkpoint) => checkpoint.id)).size).toBe(state.checkpoints.length);
    expect(state.checkpoints.every((checkpoint) => checkpoint.valid)).toBe(true);
    expect(state.incomplete).toHaveLength(0);
  }, 120_000);

  it("P7-16 preserves exact CRLF bytes on Windows-side restore", async () => {
    const before = Buffer.from("#card {\r\n  width: 320px;\r\n}\r\n");
    await put("style.css", before);
    const { history, result } = await edit();
    expect(result.status).toBe("applied");
    await history.restorePrevious();
    expect(await readFile(path.join(root, "style.css"))).toEqual(before);
  });

  it("P7-17 restores to an earlier ancestor checkpoint", async () => {
    const history = createHistoryStore({ projectRoot: root, captureScreenshot: async () => png });
    const editor = createSourceEditor({ projectRoot: root, framework: "vanilla", history });
    const first = await editor.applyWidth(request(420));
    const second = await editor.applyWidth(request(430, 420));
    const third = await editor.applyWidth(request(440, 430));
    expect(first.status).toBe("applied");
    expect(second.status).toBe("applied");
    expect(third.status).toBe("applied");
    expect(await readFile(path.join(root, "style.css"), "utf8")).toContain("440px");
    await history.restoreToCheckpoint(first.checkpointId!);
    expect(await readFile(path.join(root, "style.css"), "utf8")).toContain("420px");
    expect((await history.state()).currentId).toBe(first.checkpointId);
  });
});
