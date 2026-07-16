import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { rm, rmdir } from "node:fs/promises";
import path from "node:path";
import { waitForPortRelease } from "./port-probe.js";
import { viteBin } from "./paths.js";

export interface ManagedProcess {
  readonly pid: number;
  readonly stdout: string[];
  readonly stderr: string[];
  stop(): Promise<void>;
}

export interface ProcessOptions {
  executable: string;
  args: string[];
  cwd: string;
  readyUrl: string;
  port: number;
  env?: NodeJS.ProcessEnv;
  deadlineMs?: number;
}

async function waitForHttp(url: string, child: ChildProcessWithoutNullStreams, deadlineMs: number): Promise<void> {
  const deadline = performance.now() + deadlineMs;
  let lastFailure = "not probed";
  let consecutiveSuccesses = 0;
  while (performance.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`process exited before readiness with code ${child.exitCode}`);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(500) });
      if (response.ok) {
        await response.arrayBuffer();
        consecutiveSuccesses += 1;
        if (consecutiveSuccesses >= 2) return;
        await new Promise((resolve) => setTimeout(resolve, 100));
        continue;
      }
      consecutiveSuccesses = 0;
      lastFailure = `HTTP ${response.status}`;
    } catch (error) { consecutiveSuccesses = 0; lastFailure = String(error); }
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error(`HTTP readiness timed out for ${url}: ${lastFailure}`);
}

async function waitForExit(child: ChildProcessWithoutNullStreams, deadlineMs: number): Promise<boolean> {
  if (child.exitCode !== null) return true;
  return await new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), deadlineMs);
    child.once("exit", () => { clearTimeout(timer); resolve(true); });
  });
}

async function killTree(child: ChildProcessWithoutNullStreams, ownedDescendants: ReadonlySet<number>): Promise<void> {
  if (child.exitCode !== null || child.pid === undefined) return;
  if (process.platform === "win32") {
    for (const pid of ownedDescendants) {
      try { process.kill(pid, "SIGTERM"); } catch { /* already gone */ }
    }
    child.kill("SIGTERM");
    if (!(await waitForExit(child, 1500))) {
      const killer = spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
      await new Promise<void>((resolve) => killer.once("exit", () => resolve()));
      child.kill("SIGKILL");
    }
  } else {
    try { process.kill(-child.pid, "SIGTERM"); } catch { child.kill("SIGTERM"); }
    if (!(await waitForExit(child, 1500))) {
      try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); }
    }
  }
}

export async function startManagedProcess(options: ProcessOptions): Promise<ManagedProcess> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const ownedDescendants = new Set<number>();
  const child = spawn(options.executable, options.args, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    shell: false,
    windowsHide: true,
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => {
    const text = String(chunk);
    stdout.push(text);
    for (const match of text.matchAll(/\[reframe-owned-pid:(\d+)\]/g)) ownedDescendants.add(Number(match[1]));
  });
  child.stderr.on("data", (chunk) => stderr.push(String(chunk)));
  await new Promise<void>((resolve, reject) => {
    child.once("spawn", resolve);
    child.once("error", reject);
  });
  try { await waitForHttp(options.readyUrl, child, options.deadlineMs ?? 15_000); }
  catch (error) { await killTree(child, ownedDescendants); throw new Error(`${String(error)}\nstdout=${stdout.join("")}\nstderr=${stderr.join("")}`); }
  let stopped = false;
  return {
    pid: child.pid!, stdout, stderr,
    async stop() {
      if (stopped) return;
      stopped = true;
      await killTree(child, ownedDescendants);
      await waitForExit(child, 3000);
      await waitForPortRelease(options.port, 10_000);
    },
  };
}

export async function startViteDemo(demoRoot: string, port: number): Promise<ManagedProcess> {
  const cacheDirectory = path.join(demoRoot, "node_modules", ".vite");
  try {
    const managed = await startManagedProcess({
      executable: process.execPath,
      args: [viteBin, "--configLoader", "runner", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
      cwd: demoRoot,
      readyUrl: `http://127.0.0.1:${port}/`,
      port,
    });
    return {
      ...managed,
      async stop() {
        await managed.stop();
        await rm(cacheDirectory, { recursive: true, force: true });
        await rmdir(path.dirname(cacheDirectory)).catch(() => undefined);
      },
    };
  } catch (error) {
    await rm(cacheDirectory, { recursive: true, force: true });
    throw error;
  }
}
