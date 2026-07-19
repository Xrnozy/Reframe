import { afterEach, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { detectProject, detectProjectStack, defaultPortForFramework, parseDevCommand, ProjectError } from "../../packages/dev-server/src/project.js";
import { attachProject, findRunningDevServer, resolveDevServer, startProject } from "../../packages/dev-server/src/project-runtime.js";
import { runReframe } from "../../packages/cli/src/run.js";
import { createFixtureCopy, type FixtureCopy } from "../helpers/fixture-copy.js";
import { snapshotTree } from "../helpers/file-snapshot.js";
import { fixtureTemplatesRoot, projectRoot, viteBin } from "../helpers/paths.js";
import { canBind, reservePort, waitForPortRelease } from "../helpers/port-probe.js";

const fixtureCopies: FixtureCopy[] = [];
const tempRoots: string[] = [];

async function runRuntimeChild(root: string): Promise<{ descriptor: Awaited<ReturnType<typeof detectProject>>; url: string; command: string[]; status: number; body: string; progress: string[] }> {
  const runner = path.join(projectRoot, "tests", "fixtures", "processes", "phase2-runtime-runner.mjs");
  const modulePath = path.join(projectRoot, "packages", "dev-server", "dist", "index.js");
  const bin = path.join(projectRoot, "node_modules", ".bin");
  const child = spawn(process.execPath, [runner, modulePath, root, "10000"], {
    cwd: projectRoot,
    env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`, NO_COLOR: "1", FORCE_COLOR: "0", REFRAME_TEST_VITE_BIN: viteBin },
    shell: false,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += String(chunk); });
  child.stderr.on("data", (chunk) => { stderr += String(chunk); });
  const code = await new Promise<number>((resolve, reject) => { child.once("error", reject); child.once("close", (value) => resolve(value ?? 1)); });
  child.stdout.destroy();
  child.stderr.destroy();
  if (code !== 0) throw new Error(`runtime child failed (${code})\n${stdout}\n${stderr}`);
  return JSON.parse(stdout.trim().split(/\r?\n/).at(-1)!) as { descriptor: Awaited<ReturnType<typeof detectProject>>; url: string; command: string[]; status: number; body: string; progress: string[] };
}

async function waitForHttpText(url: string, expected: string, deadlineMs = 2_000): Promise<void> {
  const deadline = performance.now() + deadlineMs;
  let lastFailure = "not probed";
  while (performance.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(300) });
      const body = await response.text();
      if (response.ok && body === expected) return;
      lastFailure = `HTTP ${response.status}: ${body}`;
    } catch (error) { lastFailure = String(error); }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`HTTP readiness failed for ${url}: ${lastFailure}`);
}

async function fixture(name: string, setup?: (root: string) => Promise<void>): Promise<FixtureCopy> {
  const copy = await createFixtureCopy(path.join(fixtureTemplatesRoot, name), { beforeFinalize: setup });
  fixtureCopies.push(copy);
  await copy.releasePort();
  return copy;
}

afterEach(async () => {
  await Promise.all(fixtureCopies.splice(0).map((copy) => copy.cleanup()));
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Phase 2 project detection", () => {
  it("P2-01 detects and serves Vanilla without package metadata or project writes", async () => {
    const copy = await fixture("vanilla");
    const before = await snapshotTree(copy.root);
    const descriptor = await detectProject(copy.root);
    expect(descriptor).toMatchObject({ framework: "vanilla", styling: "plain-css", packageManager: null, command: null, capabilities: { canStart: true, canWriteSource: true } });
    const runtime = await startProject(descriptor);
    try {
      const response = await fetch(runtime.url);
      expect(response.status).toBe(200);
      expect(await response.text()).toContain("card-annual");
      expect((await fetch(new URL("/%2e%2e%2fpackage.json", runtime.url))).status).toBe(403);
    } finally {
      await runtime.stop();
    }
    expect(await snapshotTree(copy.root)).toEqual(before);
    expect(await canBind(Number(new URL(runtime.url).port))).toBe(true);
  });

  it("SUP-P2-02 serves a workspace Vanilla package without a local lockfile through the static fallback", async () => {
    const copy = await fixture("vanilla", (root) => writeFile(path.join(root, "package.json"), '{"private":true,"scripts":{"dev":"vite"}}\n'));
    const before = await snapshotTree(copy.root);
    const descriptor = await detectProject(copy.root);
    expect(descriptor).toMatchObject({ framework: "vanilla", packageManager: null, command: null, capabilities: { canStart: true, canWriteSource: true } });
    expect(descriptor.evidence).toContain("command:reframe-static-server");
    const runtime = await startProject(descriptor);
    try {
      expect(await (await fetch(runtime.url)).text()).toContain("card-annual");
    } finally {
      await runtime.stop();
    }
    expect(await snapshotTree(copy.root)).toEqual(before);
  });

  it("P2-02 detects React/Vite plain CSS with npm and reaches real Vite through the exact command", async () => {
    const copy = await fixture("react-plain-css", (root) => writeFile(path.join(root, "package-lock.json"), "{}\n"));
    const result = await runRuntimeChild(copy.root);
    expect(result.descriptor).toMatchObject({ framework: "react-vite", styling: "plain-css", packageManager: "npm", command: { executable: "npm", args: ["run", "dev"] } });
    expect(result.descriptor.evidence).toEqual(expect.arrayContaining(["framework:react-dependency", "framework:vite-dependency-or-script", "styling:css-source", "command:package-script:dev"]));
    expect(result.command).toEqual(["npm", "run", "dev"]);
    expect(result.status).toBe(200);
    expect(result.body).toContain('id="root"');
    expect(result.progress.at(-1)).toContain("Development server ready at");
    await waitForPortRelease(Number(new URL(result.url).port), 5_000);
  });

  it("P2-03 detects CSS Modules from real source usage without false plain-CSS or Tailwind evidence", async () => {
    const copy = await fixture("react-css-modules", (root) => writeFile(path.join(root, "package-lock.json"), "{}\n"));
    const descriptor = await detectProject(copy.root);
    expect(descriptor.framework).toBe("react-vite");
    expect(descriptor.styling).toBe("css-modules");
    expect(descriptor.evidence.some((item) => item.startsWith("styling:css-module-import:"))).toBe(true);
    expect(descriptor.evidence.some((item) => item.includes("tailwind") || item === "styling:css-source")).toBe(false);
  });

  it("P2-04 requires and reports Tailwind dependency, config, and CSS-import evidence", async () => {
    const copy = await fixture("react-tailwind", (root) => writeFile(path.join(root, "package-lock.json"), "{}\n"));
    const descriptor = await detectProject(copy.root);
    expect(descriptor.styling).toBe("tailwind");
    expect(descriptor.command).toEqual({ executable: "npm", args: ["run", "dev"], script: "dev" });
    expect(descriptor.evidence).toEqual(expect.arrayContaining([
      "styling:tailwind-dependency",
      "styling:tailwind-config:tailwind.config.js",
      "styling:tailwind-import:src/style.css",
    ]));
  });

  it("P2-05 maps npm, pnpm, Yarn, and Bun lockfiles to exact immutable command vectors", async () => {
    const cases = [
      ["package-lock.json", "npm"],
      ["pnpm-lock.yaml", "pnpm"],
      ["yarn.lock", "yarn"],
      ["bun.lock", "bun"],
    ] as const;
    for (const [lockfile, manager] of cases) {
      const copy = await fixture("react-plain-css", (root) => writeFile(path.join(root, lockfile), `${manager}-lock\n`));
      const before = await snapshotTree(copy.root);
      const descriptor = await detectProject(copy.root);
      expect(descriptor.packageManager, lockfile).toBe(manager);
      expect(descriptor.command, lockfile).toEqual({ executable: manager, args: ["run", "dev"], script: "dev" });
      expect(await snapshotTree(copy.root), lockfile).toEqual(before);
      expect(await readFile(path.join(copy.root, lockfile), "utf8"), lockfile).toBe(`${manager}-lock\n`);
    }
  });

  it("P2-06 rejects conflicting lockfiles without silently choosing or writing", async () => {
    const copy = await fixture("react-plain-css", async (root) => {
      await writeFile(path.join(root, "package-lock.json"), "npm\n");
      await writeFile(path.join(root, "yarn.lock"), "yarn\n");
    });
    const before = await snapshotTree(copy.root);
    await expect(detectProject(copy.root)).rejects.toMatchObject<ProjectError>({
      code: "PACKAGE_MANAGER_AMBIGUOUS",
      choices: ["npm", "yarn"],
    });
    await expect(detectProject(copy.root)).rejects.toThrow(/npm, yarn/);
    expect(await snapshotTree(copy.root)).toEqual(before);
  });

  it("P2-07 revalidates and uses an existing saved serve command without selection", async () => {
    const copy = await fixture("unknown-scripts", async (root) => {
      await writeFile(path.join(root, "package.json"), '{"private":true,"scripts":{"serve":"node server.mjs","preview":"node preview.mjs"}}');
      await writeFile(path.join(root, "package-lock.json"), "{}\n");
      await mkdir(path.join(root, ".reframe"));
      await writeFile(path.join(root, ".reframe", "config.json"), `${JSON.stringify({ version: 1, root: await realpath(root), packageManager: "npm", script: "serve" })}\n`);
    });
    const descriptor = await detectProject(copy.root, { commandChoice: "preview" });
    expect(descriptor.command).toEqual({ executable: "npm", args: ["run", "serve"], script: "serve" });
    expect(descriptor.evidence).toContain("command:saved-config:serve");
  });

  it("P2-08 reports malformed package JSON with its exact path and line before startup", async () => {
    const copy = await fixture("malformed-package");
    await expect(detectProject(copy.root)).rejects.toMatchObject<ProjectError>({ code: "PACKAGE_JSON_INVALID" });
    const canonical = await realpath(copy.root);
    await expect(detectProject(copy.root)).rejects.toThrow(new RegExp(`${canonical.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}.*line`, "i"));
  });

  it("P2-09 rejects a stale saved root/script and reports only current choices", async () => {
    const copy = await fixture("unknown-scripts", async (root) => {
      await writeFile(path.join(root, "package.json"), '{"private":true,"scripts":{"preview":"node preview.mjs"}}');
      await writeFile(path.join(root, "package-lock.json"), "{}\n");
      await mkdir(path.join(root, ".reframe"));
      await writeFile(path.join(root, ".reframe", "config.json"), `${JSON.stringify({ version: 1, root: `${root}-old`, packageManager: "npm", script: "removed" })}\n`);
    });
    const before = await snapshotTree(copy.root);
    await expect(detectProject(copy.root)).rejects.toMatchObject<ProjectError>({ code: "PROJECT_CONFIG_STALE", choices: ["preview"] });
    await expect(detectProject(copy.root)).rejects.toThrow(/No obsolete command was executed/);
    expect(await snapshotTree(copy.root)).toEqual(before);
  });

  it("P2-10 rejects the selected empty directory without scanning its valid parent", async () => {
    const parent = await mkdtemp(path.join(os.tmpdir(), "reframe valid parent "));
    tempRoots.push(parent);
    const empty = path.join(parent, "wrong child");
    await mkdir(empty);
    await writeFile(path.join(parent, "index.html"), "<!doctype html><title>parent must not be selected</title>");
    await expect(detectProject(empty)).rejects.toMatchObject<ProjectError>({ code: "PROJECT_ROOT_INVALID" });
    await expect(detectProject(empty)).rejects.toThrow(/no parent folders were scanned/i);
  });

  it("P2-11 limits preview-only frameworks without source-write capability", async () => {
    for (const [fixtureName, framework] of [["unsupported-vue", "vue"], ["unsupported-next", "next"], ["unsupported-nuxt", "nuxt"], ["unsupported-svelte", "svelte"]] as const) {
      const copy = await fixture(fixtureName, (root) => writeFile(path.join(root, "package-lock.json"), "{}\n"));
      const descriptor = await detectProject(copy.root);
      expect(descriptor.framework).toBe(framework);
      expect(descriptor.capabilities).toMatchObject({ canProxy: true, canExplore: true, canWriteSource: false, canStart: true });
      expect(descriptor.confidence).toBe("medium");
    }
  });

  it("P2-11b enables source writes for React TypeScript and Laravel Tailwind projects", async () => {
    for (const [fixtureName, framework] of [["unsupported-typescript", "react-vite-typescript"], ["laravel-tailwind", "laravel"]] as const) {
      const copy = await fixture(fixtureName, (root) => writeFile(path.join(root, "package-lock.json"), "{}\n"));
      const descriptor = await detectProject(copy.root);
      expect(descriptor.framework).toBe(framework);
      expect(descriptor.capabilities).toMatchObject({ canProxy: true, canExplore: true, canWriteSource: true, canStart: true });
      expect(descriptor.confidence).toBe("high");
    }
  });

  it("P2-12 reports an early nonzero exit and redacted log tail without false readiness", async () => {
    const copy = await fixture("crashing-server", async (root) => {
      await writeFile(path.join(root, "package.json"), '{"private":true,"scripts":{"dev":"node server.mjs"}}');
      await writeFile(path.join(root, "package-lock.json"), "{}\n");
      await writeFile(path.join(root, "server.mjs"), 'process.stderr.write("API_KEY=phase2-canary intentional fixture crash\\n"); process.exit(17);');
    });
    const descriptor = await detectProject(copy.root);
    let failure: unknown;
    try {
      await startProject(descriptor, { deadlineMs: 1_000, readinessIntervalMs: 10, resolveCommand: () => ({ executable: process.execPath, args: [path.join(copy.root, "server.mjs")] }) });
    } catch (error) { failure = error; }
    expect(failure).toMatchObject<ProjectError>({ code: "DEV_SERVER_EXITED" });
    expect(String(failure)).toContain("17");
    expect(String(failure)).toContain("API_KEY=[REDACTED]");
    expect(String(failure)).not.toContain("phase2-canary");
  });

  it("P2-13 ignores a printed URL that never returns HTTP and times out with progress", async () => {
    const copy = await fixture("slow-server", async (root) => {
      await writeFile(path.join(root, "package.json"), '{"private":true,"scripts":{"dev":"node server.mjs"}}');
      await writeFile(path.join(root, "package-lock.json"), "{}\n");
      await writeFile(path.join(root, "server.mjs"), 'process.stdout.write(`${process.env.TEST_URL}\\n`); setInterval(() => {}, 1000);');
    });
    const descriptor = await detectProject(copy.root);
    const progress: string[] = [];
    await expect(startProject(descriptor, {
      deadlineMs: 250,
      readinessIntervalMs: 10,
      env: { TEST_URL: `http://127.0.0.1:${copy.port}/` },
      resolveCommand: () => ({ executable: process.execPath, args: [path.join(copy.root, "server.mjs")] }),
      onProgress: (message) => progress.push(message),
    })).rejects.toMatchObject<ProjectError>({ code: "DEV_SERVER_TIMEOUT" });
    expect(progress.some((message) => message.startsWith("Waiting for development server"))).toBe(true);
    expect(await canBind(copy.port)).toBe(true);
  });

  it("P2-14 leaves an occupied Vite port owner alive and discovers Vite's dynamic URL", async () => {
    const occupied = createServer((_request, response) => response.end("unrelated-owner"));
    await new Promise<void>((resolve, reject) => { occupied.once("error", reject); occupied.listen(5173, "127.0.0.1", resolve); });
    try {
      const copy = await fixture("react-plain-css", (root) => writeFile(path.join(root, "package-lock.json"), "{}\n"));
      const result = await runRuntimeChild(copy.root);
      expect(Number(new URL(result.url).port)).not.toBe(5173);
      expect(await (await fetch("http://127.0.0.1:5173/")).text()).toBe("unrelated-owner");
    } finally {
      await new Promise<void>((resolve, reject) => occupied.close((error) => error ? reject(error) : resolve()));
      await waitForPortRelease(5173, 2_000);
    }
  });

  it("P2-15 stops a registered owned child and grandchild tree within five seconds", async () => {
    const parentPort = await reservePort();
    const grandchildPort = await reservePort();
    const ports = [parentPort.port, grandchildPort.port];
    await parentPort.release();
    await grandchildPort.release();
    const copy = await fixture("slow-server", async (root) => {
      await writeFile(path.join(root, "package.json"), '{"private":true,"scripts":{"dev":"node server.mjs"}}');
      await writeFile(path.join(root, "package-lock.json"), "{}\n");
      await writeFile(path.join(root, "grandchild.mjs"), 'import { createServer } from "node:http"; createServer((_q,r)=>r.end("grandchild")).listen(Number(process.argv[2]), "127.0.0.1");');
      await writeFile(path.join(root, "server.mjs"), 'import { spawn } from "node:child_process"; import { createServer } from "node:http"; const child=spawn(process.execPath,["grandchild.mjs",process.env.GRANDCHILD_PORT],{cwd:process.cwd(),stdio:"ignore"}); process.stdout.write(`[reframe-owned-pid:${child.pid}]\\n`); createServer((_q,r)=>r.end("parent")).listen(Number(process.env.PARENT_PORT),"127.0.0.1",()=>process.stdout.write(`http://127.0.0.1:${process.env.PARENT_PORT}/\\n`));');
    });
    const descriptor = await detectProject(copy.root);
    const runtime = await startProject(descriptor, {
      deadlineMs: 2_000,
      env: { PARENT_PORT: String(ports[0]), GRANDCHILD_PORT: String(ports[1]) },
      resolveCommand: () => ({ executable: process.execPath, args: [path.join(copy.root, "server.mjs")] }),
    });
    let started = 0;
    try {
      await waitForHttpText(`http://127.0.0.1:${ports[1]}/`, "grandchild");
      started = performance.now();
    } finally {
      await runtime.stop();
    }
    await Promise.all(ports.map((port) => waitForPortRelease(port, 5_000)));
    expect(performance.now() - started).toBeLessThanOrEqual(5_000);
  });

  it("P2-16 attaches only to a verified local server with ownership=false and never stops it", async () => {
    const external = createServer((_request, response) => response.end("still-running"));
    await new Promise<void>((resolve, reject) => { external.once("error", reject); external.listen(0, "127.0.0.1", resolve); });
    const address = external.address();
    if (!address || typeof address === "string") throw new Error("external server has no port");
    const url = `http://127.0.0.1:${address.port}/`;
    try {
      const attached = await attachProject(url);
      expect(attached.ownership).toBe(false);
      await attached.stop();
      expect(await (await fetch(url)).text()).toBe("still-running");
    } finally {
      await new Promise<void>((resolve, reject) => external.close((error) => error ? reject(error) : resolve()));
    }
  });

  it("P2-17 keeps detection/config stable through 20 process cycles in a path with spaces", async () => {
    const copy = await fixture("slow-server", async (root) => {
      await writeFile(path.join(root, "package.json"), '{"private":true,"scripts":{"serve":"node server.mjs"}}');
      await writeFile(path.join(root, "package-lock.json"), "{}\n");
      await writeFile(path.join(root, "server.mjs"), 'import { createServer } from "node:http"; createServer((_q,r)=>r.end("cycle")).listen(Number(process.env.TEST_PORT),"127.0.0.1",()=>process.stdout.write(`http://127.0.0.1:${process.env.TEST_PORT}/\\n`));');
    });
    expect(copy.root).toContain(" ");
    const first = await detectProject(copy.root, { commandChoice: "serve", approveConfigWrite: true });
    const afterConfig = await snapshotTree(copy.root);
    const second = await detectProject(copy.root);
    expect(second).toEqual(first);
    expect(await snapshotTree(copy.root)).toEqual(afterConfig);
    for (let iteration = 0; iteration < 20; iteration += 1) {
      const reservation = await reservePort();
      const port = reservation.port;
      await reservation.release();
      const runtime = await startProject(second, {
        deadlineMs: 2_000,
        env: { TEST_PORT: String(port) },
        resolveCommand: () => ({ executable: process.execPath, args: [path.join(copy.root, "server.mjs")] }),
      });
      expect(await (await fetch(runtime.url)).text(), `iteration ${iteration + 1}`).toBe("cycle");
      await runtime.stop();
      expect(await canBind(port), `iteration ${iteration + 1}`).toBe(true);
    }
    expect(await snapshotTree(copy.root)).toEqual(afterConfig);
  });

  it("P2-18 exposes detectProjectStack with default ports and dev command vectors", async () => {
    const copy = await fixture("react-plain-css", (root) => writeFile(path.join(root, "package-lock.json"), "{}\n"));
    const stack = await detectProjectStack(copy.root);
    expect(stack).toMatchObject({ framework: "react-vite", packageManager: "npm", devCommand: ["npm", "run", "dev"], defaultPort: 5173, confidence: "high" });
    expect(defaultPortForFramework("next")).toBe(3000);
    expect([...parseDevCommand('pnpm run "my dev"')]).toEqual(["pnpm", "run", "my dev"]);
  });

  it("P2-19 prefers start/serve scripts when dev is absent and attaches to an existing default-port server", async () => {
    const copy = await fixture("unknown-scripts", async (root) => {
      await writeFile(path.join(root, "package.json"), '{"private":true,"scripts":{"serve":"node server.mjs"}}');
      await writeFile(path.join(root, "package-lock.json"), "{}\n");
      await writeFile(path.join(root, "server.mjs"), 'import { createServer } from "node:http"; createServer((_q,r)=>r.end("attached")).listen(Number(process.env.TEST_PORT),"127.0.0.1");');
    });
    const reservation = await reservePort();
    const port = reservation.port;
    await reservation.release();
    const child = spawn(process.execPath, [path.join(copy.root, "server.mjs")], { cwd: copy.root, env: { ...process.env, TEST_PORT: String(port) }, stdio: "ignore", shell: false, windowsHide: true });
    try {
      await waitForHttpText(`http://127.0.0.1:${port}/`, "attached");
      const descriptor = await detectProject(copy.root);
      expect(descriptor.command).toEqual({ executable: "npm", args: ["run", "serve"], script: "serve" });
      const runtime = await resolveDevServer(descriptor, { probePorts: [port], deadlineMs: 500, readinessIntervalMs: 10 });
      expect(runtime.ownership).toBe(false);
      expect(await (await fetch(runtime.url)).text()).toBe("attached");
      await runtime.stop();
      expect(child.exitCode).toBeNull();
    } finally {
      child.kill("SIGTERM");
      await waitForPortRelease(port, 2_000);
    }
  });

  it("P2-20 discovers a running server on a non-default port before spawning", async () => {
    const reservation = await reservePort();
    const port = reservation.port;
    await reservation.release();
    const server = createServer((_request, response) => response.end("non-default-port"));
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); });
    try {
      expect(await findRunningDevServer([5173, port, 3000])).toBe(`http://127.0.0.1:${port}/`);
      const copy = await fixture("react-plain-css", (root) => writeFile(path.join(root, "package-lock.json"), "{}\n"));
      const descriptor = await detectProject(copy.root);
      const runtime = await resolveDevServer(descriptor, { probePorts: [5173, port], deadlineMs: 500, readinessIntervalMs: 10 });
      expect(runtime.ownership).toBe(false);
      expect(await (await fetch(runtime.url)).text()).toBe("non-default-port");
      await runtime.stop();
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      await waitForPortRelease(port, 2_000);
    }
  });

  it("SUP-P2-03 detects workspace vanilla-demo as static vanilla without project writes", async () => {
    const root = path.join(projectRoot, "demo", "vanilla-demo");
    const descriptor = await detectProject(root);
    expect(descriptor).toMatchObject({ framework: "vanilla", styling: "plain-css", packageManager: null, command: null, capabilities: { canStart: true, canWriteSource: true } });
    expect(descriptor.evidence).toContain("framework:index.html");
    expect(descriptor.evidence).toContain("command:reframe-static-server");
  });

  it("SUP-P2-04 detects workspace react-demo as React/Vite with npm dev command", async () => {
    const root = path.join(projectRoot, "demo", "react-demo");
    const descriptor = await detectProject(root);
    expect(descriptor).toMatchObject({ framework: "react-vite", styling: "plain-css", packageManager: "npm", command: { executable: "npm", args: ["run", "dev"], script: "dev" }, capabilities: { canStart: true, canWriteSource: true } });
    expect(descriptor.evidence).toEqual(expect.arrayContaining(["framework:react-dependency", "framework:vite-dependency-or-script", "command:package-script:dev"]));
  });

  it("SUP-P2-01 runs the Phase 2 CLI orchestration against a selected Vanilla project", async () => {
    const copy = await fixture("vanilla");
    const reservation = await reservePort();
    const reframePort = reservation.port;
    await reservation.release();
    const controller = new AbortController();
    const opened: string[] = [];
    const stdout: string[] = [];
    const stderr: string[] = [];
    let ready!: () => void;
    const readyPromise = new Promise<void>((resolve) => { ready = resolve; });
    const execution = runReframe({
      projectMode: true,
      projectRoot: copy.root,
      port: reframePort,
      signal: controller.signal,
      browserOpener: async (url) => { opened.push(url); },
      output: { stdout: (message) => stdout.push(message), stderr: (message) => stderr.push(message) },
      onState(state) { if (state === "ready") ready(); },
    });
    await readyPromise;
    expect(opened).toHaveLength(1);
    expect(await (await fetch(opened[0]!)).text()).toContain("card-annual");
    expect(stdout.join("")).toContain("Project detected: Vanilla HTML/CSS");
    expect(stdout.join("")).toContain("Development command: Reframe static server");
    expect(stderr).toEqual([]);
    controller.abort();
    expect(await execution).toBe(0);
    await waitForPortRelease(reframePort, 2_000);
    await waitForPortRelease(Number(new URL(opened[0]!).port), 2_000);
  });
});
