import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { installPackedCli, importPackedCli, startCommand, startNpx, type PackedInstall } from "../helpers/packed-cli.js";
import { canBind, reservePort, waitForPortRelease } from "../helpers/port-probe.js";

describe("Phase 1 packed CLI", () => {
  let install: PackedInstall;

  beforeAll(async () => { install = await installPackedCli("p1-01-p1-02"); }, 30_000);
  afterAll(async () => { await install.cleanup(); });

  it("P1-01 runs the packed CLI, serves welcome and health, then opens the reachable URL once", async () => {
    const packed = await importPackedCli(install);
    const reservation = await reservePort();
    const port = reservation.port;
    await reservation.release();
    const opened: string[] = [];
    const controller = new AbortController();
    let ready!: () => void;
    const readyPromise = new Promise<void>((resolve) => { ready = resolve; });
    const execution = packed.runReframe({
      port,
      signal: controller.signal,
      browserOpener: async (url) => { opened.push(url); },
      output: { stdout() {}, stderr() {} },
      onState(state) { if (state === "ready") ready(); },
    });
    await readyPromise;
    const rootResponse = await fetch(`http://127.0.0.1:${port}/`);
    const healthResponse = await fetch(`http://127.0.0.1:${port}/health`);
    expect(rootResponse.status).toBe(200);
    expect(await rootResponse.text()).toContain("Project detection is not available yet.");
    expect(healthResponse.status).toBe(200);
    expect(await healthResponse.json()).toEqual({ status: "ok" });
    expect(opened).toEqual([`http://localhost:${port}`]);
    controller.abort();
    expect(await execution).toBe(0);
    await waitForPortRelease(port, 2_000);
  });

  it("P1-02 invokes the installed package through npx and prints the documented ready output", async () => {
    const reservation = await reservePort();
    const port = reservation.port;
    await reservation.release();
    const spyRoot = await mkdtemp(path.join(os.tmpdir(), "reframe browser spy "));
    const script = path.join(spyRoot, "browser-spy.mjs");
    const log = path.join(spyRoot, "opened.txt");
    await writeFile(script, 'import { appendFile } from "node:fs/promises"; await appendFile(process.argv[2], `${process.argv[3]}\\n`);');
    const running = await startNpx(install, port, {
      REFRAME_BROWSER: process.execPath,
      REFRAME_BROWSER_ARGS: JSON.stringify([script, log]),
    });
    try {
      const deadline = performance.now() + 2_000;
      while (!running.stdout.join("").includes("Press Ctrl+C to stop.") && performance.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20));
      expect(running.stdout.join("")).toBe(`Reframe\n\n✓ Reframe Dev Server started\n✓ Browser opened\n\nReframe is running at:\nhttp://localhost:${port}\n\nPress Ctrl+C to stop.\n`);
      let openedUrl = "";
      const logDeadline = performance.now() + 2_000;
      while (!openedUrl && performance.now() < logDeadline) {
        openedUrl = await readFile(log, "utf8").then((value) => value.trim(), () => "");
        if (!openedUrl) await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(openedUrl).toBe(`http://localhost:${port}`);
      expect(running.stderr.join("")).toBe("");
    } finally {
      await running.stop(port);
      await rm(spyRoot, { recursive: true, force: true });
    }
  });

  it("P1-03 handles SIGINT immediately during startup without opening a browser or leaking its partial listener", async () => {
    const reservation = await reservePort();
    const port = reservation.port;
    await reservation.release();
    const spy = path.join(install.root, "immediate-signal-browser-spy.mjs");
    const browserLog = path.join(install.root, "immediate-signal-browser.txt");
    await writeFile(spy, 'import { appendFile } from "node:fs/promises"; await appendFile(process.argv[2], `${process.argv[3]}\\n`);');
    const child = spawn(process.execPath, [path.join(install.packageRoot, "dist", "bin.js")], {
      cwd: install.root,
      env: { ...process.env, REFRAME_WELCOME_ONLY: "1", REFRAME_PORT: String(port), REFRAME_BROWSER: process.execPath, REFRAME_BROWSER_ARGS: JSON.stringify([spy, browserLog]) },
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    await new Promise<void>((resolve, reject) => {
      child.once("spawn", resolve);
      child.once("error", reject);
    });
    const started = performance.now();
    expect(child.kill("SIGINT")).toBe(true);
    const exited = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), 2_000);
      child.once("exit", () => { clearTimeout(timer); resolve(true); });
    });
    expect(exited).toBe(true);
    expect(performance.now() - started).toBeLessThanOrEqual(2_000);
    expect(await readFile(browserLog, "utf8").then(() => true, () => false)).toBe(false);
    await waitForPortRelease(port, 2_000);
  });

  it("P1-04 treats two rapid shutdown signals as one idempotent cleanup", async () => {
    const packed = await importPackedCli(install);
    const reservation = await reservePort();
    const port = reservation.port;
    await reservation.release();
    const signals = new EventEmitter();
    const controller = new AbortController();
    const remove = packed.installSignalHandlers(signals, () => controller.abort());
    let ready!: () => void;
    const readyPromise = new Promise<void>((resolve) => { ready = resolve; });
    const states: string[] = [];
    const execution = packed.runReframe({
      port,
      signal: controller.signal,
      browserOpener: async () => {},
      output: { stdout() {}, stderr() {} },
      onState(state) { states.push(state); if (state === "ready") ready(); },
    });
    await readyPromise;
    signals.emit("SIGINT");
    signals.emit("SIGTERM");
    expect(await execution).toBe(0);
    remove();
    expect(states).toEqual(["starting", "ready", "stopping", "stopped"]);
    await waitForPortRelease(port, 2_000);
  });

  it("SUP-P1-01 forces termination only when a repeated signal arrives after the cleanup deadline", async () => {
    const packed = await importPackedCli(install);
    const signals = new EventEmitter();
    let shutdowns = 0;
    let forced = 0;
    const remove = packed.installSignalHandlers(signals, () => { shutdowns += 1; }, () => { forced += 1; }, 0);
    signals.emit("SIGINT");
    signals.emit("SIGTERM");
    remove();
    expect(shutdowns).toBe(1);
    expect(forced).toBe(1);
  });

  it("SUP-P1-02 treats cancellation during the health probe as graceful shutdown", async () => {
    const packed = await importPackedCli(install);
    const reservation = await reservePort();
    const port = reservation.port;
    await reservation.release();
    const controller = new AbortController();
    const originalFetch = globalThis.fetch;
    let probing!: () => void;
    const probingPromise = new Promise<void>((resolve) => { probing = resolve; });
    globalThis.fetch = ((_input, init) => {
      probing();
      return new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true }));
    }) as typeof fetch;
    try {
      const execution = packed.runReframe({ port, signal: controller.signal, browserOpener: async () => { throw new Error("browser must not open"); }, output: { stdout() {}, stderr() {} } });
      await probingPromise;
      controller.abort();
      expect(await execution).toBe(0);
      await waitForPortRelease(port, 2_000);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("P1-05 rejects a version-shimmed unsupported Node before binding", async () => {
    const reservation = await reservePort();
    const port = reservation.port;
    await reservation.release();
    const shimRoot = await mkdtemp(path.join(os.tmpdir(), "reframe node shim "));
    const shim = path.join(shimRoot, "unsupported.cjs");
    await writeFile(shim, 'Object.defineProperty(process.versions, "node", { value: "20.0.0" });');
    const child = spawn(process.execPath, ["--require", shim, path.join(install.packageRoot, "dist", "bin.js")], {
      cwd: install.root,
      env: { ...process.env, REFRAME_PORT: String(port) },
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    const exitCode = await new Promise<number>((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code) => resolve(code ?? 1));
    });
    await rm(shimRoot, { recursive: true, force: true });
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("NODE_VERSION_UNSUPPORTED");
    expect(stdout).not.toContain("Reframe is running at:");
    expect(await canBind(port)).toBe(true);
  });

  it("P1-06 reports PORT_IN_USE without readiness, browser opening, or an extra listener", async () => {
    const packed = await importPackedCli(install);
    const occupied = createServer();
    await new Promise<void>((resolve, reject) => {
      occupied.once("error", reject);
      occupied.listen(0, "127.0.0.1", resolve);
    });
    const address = occupied.address();
    if (!address || typeof address === "string") throw new Error("occupied test port unavailable");
    const occupiedPort = address.port;
    const stdout: string[] = [];
    const stderr: string[] = [];
    let opened = 0;
    const exitCode = await packed.runReframe({
      port: occupiedPort,
      browserOpener: async () => { opened += 1; },
      output: { stdout: (message) => stdout.push(message), stderr: (message) => stderr.push(message) },
    });
    expect(exitCode).toBe(1);
    expect(stderr.join("")).toContain("PORT_IN_USE");
    expect(stdout.join("")).not.toContain("Reframe is running at:");
    expect(opened).toBe(0);
    await new Promise<void>((resolve, reject) => occupied.close((error) => error ? reject(error) : resolve()));
    await waitForPortRelease(occupiedPort, 2_000);
  });

  it("P1-07 warns on browser-open failure while keeping the welcome server usable", async () => {
    const packed = await importPackedCli(install);
    const reservation = await reservePort();
    const port = reservation.port;
    await reservation.release();
    const controller = new AbortController();
    const stdout: string[] = [];
    const stderr: string[] = [];
    let ready!: () => void;
    const readyPromise = new Promise<void>((resolve) => { ready = resolve; });
    const execution = packed.runReframe({
      port,
      signal: controller.signal,
      browserOpener: async () => { throw new Error("browser unavailable"); },
      output: { stdout: (message) => stdout.push(message), stderr: (message) => stderr.push(message) },
      onState(state) { if (state === "ready") ready(); },
    });
    await readyPromise;
    expect((await fetch(`http://127.0.0.1:${port}/`)).status).toBe(200);
    expect(stderr.join("")).toContain(`BROWSER_OPEN_FAILED`);
    expect(stderr.join("")).toContain(`Open http://localhost:${port} manually.`);
    expect(stdout.join("")).toContain("⚠ Browser did not open");
    controller.abort();
    expect(await execution).toBe(0);
    await waitForPortRelease(port, 2_000);
  });

  it("P1-08 closes after an unexpected HTTP error and permits a subsequent run", async () => {
    const packed = await importPackedCli(install);
    const reservation = await reservePort();
    const port = reservation.port;
    await reservation.release();
    const stderr: string[] = [];
    let ready!: () => void;
    const readyPromise = new Promise<void>((resolve) => { ready = resolve; });
    let ownedServer: { server: EventEmitter } | undefined;
    const failedRun = packed.runReframe({
      port,
      signal: new AbortController().signal,
      browserOpener: async () => {},
      output: { stdout() {}, stderr: (message) => stderr.push(message) },
      onState(state, server) { if (state === "ready" && server) { ownedServer = server; ready(); } },
    });
    await readyPromise;
    ownedServer!.server.emit("error", new Error("forced server failure"));
    expect(await failedRun).toBe(1);
    expect(stderr.join("")).toContain("HTTP_SERVER_FAILED");
    await waitForPortRelease(port, 2_000);

    const controller = new AbortController();
    let restarted!: () => void;
    const restartedPromise = new Promise<void>((resolve) => { restarted = resolve; });
    const recovery = packed.runReframe({ port, signal: controller.signal, browserOpener: async () => {}, output: { stdout() {}, stderr() {} }, onState(state) { if (state === "ready") restarted(); } });
    await restartedPromise;
    controller.abort();
    expect(await recovery).toBe(0);
    await waitForPortRelease(port, 2_000);
  });

  it("P1-09 keeps two configured-port instances isolated", async () => {
    const packed = await importPackedCli(install);
    const firstPort = await reservePort();
    const secondPort = await reservePort();
    const ports = [firstPort.port, secondPort.port];
    await firstPort.release();
    await secondPort.release();
    const controllers = [new AbortController(), new AbortController()];
    const ready = [false, false];
    let bothReady!: () => void;
    const bothReadyPromise = new Promise<void>((resolve) => { bothReady = resolve; });
    const runs = ports.map((port, index) => packed.runReframe({
      port,
      signal: controllers[index]!.signal,
      browserOpener: async () => {},
      output: { stdout() {}, stderr() {} },
      onState(state) { if (state === "ready") { ready[index] = true; if (ready.every(Boolean)) bothReady(); } },
    }));
    await bothReadyPromise;
    controllers[0]!.abort();
    expect(await runs[0]).toBe(0);
    expect((await fetch(`http://127.0.0.1:${ports[1]}/health`)).status).toBe(200);
    controllers[1]!.abort();
    expect(await runs[1]).toBe(0);
    await Promise.all(ports.map((port) => waitForPortRelease(port, 2_000)));
  });

  it("P1-10 starts, stops, and immediately restarts 25 times without leaking the listener", async () => {
    const packed = await importPackedCli(install);
    const reservation = await reservePort();
    const port = reservation.port;
    await reservation.release();
    for (let iteration = 0; iteration < 25; iteration += 1) {
      const controller = new AbortController();
      let ready!: () => void;
      const readyPromise = new Promise<void>((resolve) => { ready = resolve; });
      const execution = packed.runReframe({ port, signal: controller.signal, browserOpener: async () => {}, output: { stdout() {}, stderr() {} }, onState(state) { if (state === "ready") ready(); } });
      await readyPromise;
      controller.abort();
      expect(await execution, `iteration ${iteration + 1}`).toBe(0);
      expect(await canBind(port), `iteration ${iteration + 1}`).toBe(true);
    }
  });

  it.runIf(process.platform === "win32")("P1-11 runs the packed bin from PowerShell in paths with spaces", async () => {
    const reservation = await reservePort();
    const port = reservation.port;
    await reservation.release();
    const launcher = path.join(install.root, "PowerShell launcher.ps1");
    const spy = path.join(install.root, "browser spy.mjs");
    const browserLog = path.join(install.root, "browser calls.txt");
    await writeFile(launcher, "& $args[0] $args[1]");
    await writeFile(spy, 'import { appendFile } from "node:fs/promises"; await appendFile(process.argv[2], `${process.argv[3]}\\n`);');
    const running = await startCommand(
      "powershell.exe",
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", launcher, process.execPath, path.join(install.packageRoot, "dist", "bin.js")],
      install.root,
      port,
      { REFRAME_BROWSER: process.execPath, REFRAME_BROWSER_ARGS: JSON.stringify([spy, browserLog]) },
    );
    try {
      expect((await fetch(`http://127.0.0.1:${port}/`)).status).toBe(200);
      expect(running.stdout.join("")).toContain(`http://localhost:${port}`);
      expect(running.stderr.join("")).toBe("");
    } finally {
      await running.stop(port);
    }
  });
});
