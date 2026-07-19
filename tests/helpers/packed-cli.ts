import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { waitForPortRelease } from "./port-probe.js";

const root = process.cwd();
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("npm_execpath is required; run tests through npm");

async function run(executable: string, args: string[], cwd: string): Promise<string> {
  const child = spawn(executable, args, { cwd, shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += String(chunk); });
  child.stderr.on("data", (chunk) => { stderr += String(chunk); });
  const code = await new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (exitCode) => resolve(exitCode ?? 1));
  });
  if (code !== 0) throw new Error(`${executable} ${args.join(" ")} failed (${code})\n${stdout}\n${stderr}`);
  return stdout;
}

export interface PackedInstall {
  readonly root: string;
  readonly packageRoot: string;
  readonly npxCli: string;
  cleanup(): Promise<void>;
}

export async function installPackedCli(label: string): Promise<PackedInstall> {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), `reframe phase1 ${label} `));
  try {
    const packDirectory = path.join(tempRoot, "packed artifact");
    const installRoot = path.join(tempRoot, "empty install");
    await mkdir(packDirectory, { recursive: true });
    await mkdir(installRoot, { recursive: true });
    await writeFile(path.join(installRoot, "package.json"), '{"name":"phase1-test","private":true}');
    const packedPath = (await run(process.execPath, [npmCli, "run", "pack:cli", "--", packDirectory], root)).trim().split(/\r?\n/).at(-1);
    if (!packedPath) throw new Error("pack command did not print the tarball path");
    await run(process.execPath, [npmCli, "install", packedPath, "--ignore-scripts", "--no-audit", "--no-fund", "--offline", "--cache", path.join(root, ".npm-cache")], installRoot);
    const packageRoot = path.join(installRoot, "node_modules", "reframe");
    await readFile(path.join(packageRoot, "dist", "bin.js"));
    return {
      root: installRoot,
      packageRoot,
      npxCli: path.join(path.dirname(npmCli), "npx-cli.js"),
      cleanup: () => rm(tempRoot, { recursive: true, force: true }),
    };
  } catch (error) {
    await rm(tempRoot, { recursive: true, force: true });
    throw error;
  }
}

export async function importPackedCli(install: PackedInstall): Promise<typeof import("../../packages/cli/src/index.js")> {
  return import(pathToFileURL(path.join(install.packageRoot, "dist", "index.js")).href);
}

export interface RunningCommand {
  readonly child: ChildProcessWithoutNullStreams;
  readonly stdout: string[];
  readonly stderr: string[];
  signalAndWait(port: number, signal?: NodeJS.Signals): Promise<void>;
  stop(port: number): Promise<void>;
}

export async function startCommand(executable: string, args: string[], cwd: string, port: number, env: NodeJS.ProcessEnv): Promise<RunningCommand> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const child = spawn(executable, args, {
    cwd,
    env: { ...process.env, REFRAME_WELCOME_ONLY: "1", ...env, REFRAME_PORT: String(port) },
    detached: process.platform !== "win32",
    shell: false,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => stdout.push(String(chunk)));
  child.stderr.on("data", (chunk) => stderr.push(String(chunk)));
  await new Promise<void>((resolve, reject) => {
    child.once("spawn", resolve);
    child.once("error", reject);
  });
  const deadline = performance.now() + 5_000;
  while (performance.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`command exited before readiness (${child.exitCode})\n${stdout.join("")}\n${stderr.join("")}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(300) });
      if (response.ok) { await response.arrayBuffer(); break; }
    } catch { /* keep probing until the deadline */ }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  const response = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(500) });
  if (!response.ok) throw new Error(`npx health probe failed with ${response.status}`);
  await response.arrayBuffer();
  return {
    child, stdout, stderr,
    async signalAndWait(expectedPort, signal = "SIGTERM") {
      if (child.exitCode === null) child.kill(signal);
      const exited = child.exitCode !== null || await new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => resolve(false), 2_000);
        child.once("exit", () => { clearTimeout(timer); resolve(true); });
      });
      if (!exited) throw new Error(`command did not exit within 2000ms after ${signal}`);
      await waitForPortRelease(expectedPort, 2_000);
    },
    async stop(expectedPort) {
      if (process.platform === "win32") {
        const netstat = await run("netstat.exe", ["-ano", "-p", "tcp"], root);
        const match = netstat.match(new RegExp(`127\\.0\\.0\\.1:${expectedPort}\\s+[^\\r\\n]*LISTENING\\s+(\\d+)`, "i"));
        const listenerPid = match?.[1];
        if (!listenerPid) throw new Error(`could not find the owned listener for port ${expectedPort}`);
        try { process.kill(Number(listenerPid), "SIGKILL"); } catch { /* listener already exited */ }
        if (child.pid && child.exitCode === null) {
          const killer = spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { shell: false, stdio: "ignore", windowsHide: true });
          await new Promise<void>((resolve) => killer.once("exit", () => resolve()));
        }
      } else if (child.pid && child.exitCode === null) {
          try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); }
      }
      await waitForPortRelease(expectedPort, 5_000);
      if (child.exitCode === null) await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 2_000);
        child.once("exit", () => { clearTimeout(timer); resolve(); });
      });
    },
  };
}

export function startNpx(install: PackedInstall, port: number, env: NodeJS.ProcessEnv): Promise<RunningCommand> {
  return startCommand(process.execPath, [install.npxCli, "--no-install", "reframe"], install.root, port, env);
}
