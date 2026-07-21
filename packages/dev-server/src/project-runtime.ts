import { spawn, type ChildProcess } from "node:child_process";
import { readFile, realpath, stat } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import path from "node:path";
import { ProjectError, type ProjectCommand, type ProjectDescriptor } from "./project.js";

export interface SpawnVector {
  executable: string;
  args: string[];
}

export interface ProjectRuntimeOptions {
  deadlineMs?: number;
  readinessIntervalMs?: number;
  staticPort?: number;
  env?: NodeJS.ProcessEnv;
  attachUrl?: string;
  probePort?: number;
  probePorts?: readonly number[];
  devCommand?: readonly string[];
  resolveCommand?: (command: ProjectCommand) => SpawnVector;
  onProgress?: (message: string) => void;
}

export interface ProjectRuntime {
  readonly url: string;
  readonly ownership: boolean;
  readonly pid?: number;
  readonly command: readonly string[];
  readonly stdout: readonly string[];
  readonly stderr: readonly string[];
  readonly done: Promise<ProjectError | null>;
  stop(): Promise<void>;
}

const contentTypes: Readonly<Record<string, string>> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jsx": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
};

export const DEFAULT_DEV_SERVER_DEADLINE_MS = 30_000;
export const COMMON_DEV_PORTS = [3000, 4200, 4321, 4173, 5173, 8000, 8080, 8888] as const;

function inside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function closeServer(server: Server): Promise<void> {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

async function startStaticProject(descriptor: ProjectDescriptor, options: ProjectRuntimeOptions): Promise<ProjectRuntime> {
  const root = await realpath(descriptor.root);
  let stopping = false;
  let resolveDone!: (error: ProjectError | null) => void;
  const done = new Promise<ProjectError | null>((resolve) => { resolveDone = resolve; });
  const server = createServer(async (request, response) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405).end();
      return;
    }
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const decoded = decodeURIComponent(url.pathname);
      let candidate = path.resolve(root, `.${decoded}`);
      if (!inside(root, candidate)) throw new ProjectError("STATIC_PATH_FORBIDDEN", "Requested path escapes the project root.");
      if ((await stat(candidate)).isDirectory()) candidate = path.join(candidate, "index.html");
      const canonical = await realpath(candidate);
      if (!inside(root, canonical)) throw new ProjectError("STATIC_PATH_FORBIDDEN", "Requested path resolves outside the project root.");
      const body = await readFile(canonical);
      response.writeHead(200, { "Cache-Control": "no-store", "Content-Type": contentTypes[path.extname(canonical).toLowerCase()] ?? "application/octet-stream" });
      response.end(request.method === "HEAD" ? undefined : body);
    } catch (error) {
      const status = error instanceof ProjectError && error.code === "STATIC_PATH_FORBIDDEN" ? 403 : 404;
      response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
      response.end(status === 403 ? "Forbidden" : "Not found");
    }
  });
  server.on("error", (error) => { if (!stopping) resolveDone(new ProjectError("DEV_SERVER_FAILED", `The Vanilla static server stopped unexpectedly: ${String(error)}.`)); });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.staticPort ?? 0, "127.0.0.1", () => { server.off("error", reject); resolve(); });
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new ProjectError("DEV_SERVER_FAILED", "The Vanilla static server has no TCP address.");
  const url = `http://127.0.0.1:${address.port}/`;
  options.onProgress?.(`Development server ready at ${url}`);
  return {
    url,
    ownership: true,
    command: ["reframe-static-server"],
    stdout: [],
    stderr: [],
    done,
    async stop() {
      if (stopping) return;
      stopping = true;
      await closeServer(server);
      resolveDone(null);
    },
  };
}

function redactLog(value: string): string {
  return value
    .replace(/\b(authorization\s*:\s*bearer)\s+\S+/gi, "$1 [REDACTED]")
    .replace(/\b([A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_KEY))\s*=\s*([^\s]+)/gi, "$1=[REDACTED]");
}

function logTail(stdout: readonly string[], stderr: readonly string[]): string {
  return redactLog(`${stdout.join("")}\n${stderr.join("")}`).slice(-2_000).trim();
}

function loopbackUrl(value: string): string | null {
  try {
    const url = new URL(value.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, ""));
    if (url.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname === "::1" ? "[::1]" : url.hostname)) return null;
    return url.href;
  } catch { return null; }
}

function urlsFrom(value: string): string[] {
  const urls: string[] = [];
  for (const match of value.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "").matchAll(/http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/[^\s]*)?/g)) {
    const url = loopbackUrl(match[0]);
    if (url && !urls.includes(url)) urls.push(url);
  }
  return urls;
}

async function waitForExit(child: ChildProcess, deadlineMs: number): Promise<boolean> {
  if (child.exitCode !== null) return true;
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), deadlineMs);
    child.once("exit", () => { clearTimeout(timer); resolve(true); });
  });
}

async function waitForClose(child: ChildProcess, deadlineMs: number): Promise<void> {
  if (child.stdout?.closed && child.stderr?.closed) return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, deadlineMs);
    child.once("close", () => { clearTimeout(timer); resolve(); });
  });
}

async function killOwnedTree(child: ChildProcess, _readyUrl?: string, ownedDescendants: ReadonlySet<number> = new Set(), directChild = false): Promise<void> {
  if (child.pid === undefined || child.exitCode !== null) return;
  if (process.platform === "win32") {
    for (const pid of ownedDescendants) {
      if (pid !== process.pid) try { process.kill(pid, "SIGKILL"); } catch { /* descendant already stopped */ }
    }
    if (directChild) child.kill("SIGTERM");
    else {
      const killer = spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { shell: false, windowsHide: true, stdio: "ignore" });
      await new Promise<void>((resolve) => { killer.once("error", () => resolve()); killer.once("close", () => resolve()); });
    }
  } else {
    try { process.kill(-child.pid, "SIGTERM"); } catch { child.kill("SIGTERM"); }
    if (!(await waitForExit(child, 1_500))) {
      try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); }
    }
  }
  if (!(await waitForExit(child, 3_000))) child.kill("SIGKILL");
  await waitForClose(child, 3_000);
  child.stdout?.destroy();
  child.stderr?.destroy();
}

function defaultCommand(command: ProjectCommand): SpawnVector {
  if (command.executable === "npm" && process.env.npm_execpath) {
    return { executable: process.execPath, args: [process.env.npm_execpath, ...command.args] };
  }
  const packageManagers = new Set(["npm", "pnpm", "yarn", "bun"]);
  const executable = process.platform === "win32" && packageManagers.has(command.executable) ? `${command.executable}.cmd` : command.executable;
  return { executable, args: [...command.args] };
}

function devCommandVector(options: ProjectRuntimeOptions): SpawnVector | null {
  if (!options.devCommand?.length) return null;
  const [executable, ...args] = options.devCommand;
  return { executable: executable!, args: [...args] };
}

function looksLikeDirectoryListing(body: string): boolean {
  const sample = body.slice(0, 8_192).toLowerCase();
  return sample.includes("directory listing for")
    || sample.includes("<title>index of")
    || /<h1>\s*index of\s/i.test(sample)
    || (sample.includes("parent directory") && sample.includes("<pre>"));
}

async function probeAttachable(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(500) });
    if (!response.ok) return false;
    return !looksLikeDirectoryListing(await response.text());
  } catch { return false; }
}

export async function findRunningDevServer(ports: readonly number[]): Promise<string | null> {
  const seen = new Set<number>();
  for (const port of ports) {
    if (seen.has(port)) continue;
    seen.add(port);
    const candidate = `http://127.0.0.1:${port}/`;
    if (await probeAttachable(candidate)) return candidate;
  }
  return null;
}

function probePortList(options: ProjectRuntimeOptions): readonly number[] {
  const ports: number[] = [];
  if (options.probePort) ports.push(options.probePort);
  if (options.probePorts?.length) ports.push(...options.probePorts);
  return [...new Set(ports)];
}

async function startCommandProject(descriptor: ProjectDescriptor, options: ProjectRuntimeOptions): Promise<ProjectRuntime> {
  const command = descriptor.command!;
  const override = devCommandVector(options);
  const vector = override ?? (options.resolveCommand ?? defaultCommand)(command);
  const directChild = override !== null || options.resolveCommand !== undefined;
  const stdout: string[] = [];
  const stderr: string[] = [];
  const ownedDescendants = new Set<number>();
  const candidates = new Set<string>();
  let stopping = false;
  let ready = false;
  let resolveDone!: (error: ProjectError | null) => void;
  const done = new Promise<ProjectError | null>((resolve) => { resolveDone = resolve; });
  const child = spawn(vector.executable, vector.args, {
    cwd: descriptor.root,
    env: { ...process.env, ...options.env },
    detached: true,
    shell: false,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => {
    const text = String(chunk);
    stdout.push(text);
    for (const url of urlsFrom(text)) candidates.add(url);
    for (const match of text.matchAll(/\[reframe-owned-pid:(\d+)\]/g)) ownedDescendants.add(Number(match[1]));
  });
  child.stderr.on("data", (chunk) => { const text = String(chunk); stderr.push(text); for (const url of urlsFrom(text)) candidates.add(url); });
  await new Promise<void>((resolve, reject) => { child.once("spawn", resolve); child.once("error", reject); }).catch((error) => {
    throw new ProjectError("DEV_SERVER_START_FAILED", `Could not start ${[command.executable, ...command.args].join(" ")}: ${String(error)}.`);
  });
  child.once("exit", (code) => {
    if (stopping) return resolveDone(null);
    const error = new ProjectError("DEV_SERVER_EXITED", `Development command exited with code ${code ?? "unknown"}.${logTail(stdout, stderr) ? ` Log tail: ${logTail(stdout, stderr)}` : ""} Source files were not changed; fix the command and retry.`);
    if (ready) resolveDone(error);
  });
  const deadlineMs = options.deadlineMs ?? DEFAULT_DEV_SERVER_DEADLINE_MS;
  const intervalMs = options.readinessIntervalMs ?? 50;
  const deadline = performance.now() + deadlineMs;
  let lastProgress = 0;
  options.onProgress?.(`Starting ${[vector.executable, ...vector.args].join(" ")}`);
  while (performance.now() < deadline) {
    if (child.exitCode !== null) {
      await killOwnedTree(child);
      throw new ProjectError("DEV_SERVER_EXITED", `Development command exited with code ${child.exitCode}.${logTail(stdout, stderr) ? ` Log tail: ${logTail(stdout, stderr)}` : ""} Source files were not changed; fix the command and retry.`);
    }
    for (const candidate of candidates) {
      if (await probeAttachable(candidate)) {
        ready = true;
        options.onProgress?.(`Development server ready at ${candidate}`);
        return {
          url: candidate,
          ownership: true,
          pid: child.pid,
          command: override ? [...options.devCommand!] : [command.executable, ...command.args],
          stdout,
          stderr,
          done,
          async stop() {
            if (stopping) return;
            stopping = true;
            await killOwnedTree(child, candidate, ownedDescendants, directChild);
            resolveDone(null);
          },
        };
      }
    }
    if (performance.now() - lastProgress >= 1_000) {
      lastProgress = performance.now();
      options.onProgress?.(`Waiting for development server (${Math.ceil((deadline - performance.now()) / 1_000)}s remaining)`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  stopping = true;
  await killOwnedTree(child, undefined, ownedDescendants, directChild);
  resolveDone(null);
  throw new ProjectError("DEV_SERVER_TIMEOUT", `Development server did not return HTTP within ${deadlineMs}ms. Printed URLs are not considered ready without a successful HTTP response. Source files were not changed; check the command and port, then retry.`);
}

export async function resolveDevServer(descriptor: ProjectDescriptor, options: ProjectRuntimeOptions = {}): Promise<ProjectRuntime> {
  if (options.attachUrl) {
    options.onProgress?.(`Attaching to ${options.attachUrl}`);
    return attachProject(options.attachUrl);
  }
  if (descriptor.framework === "vanilla" && !descriptor.command && !options.devCommand?.length) return startStaticProject(descriptor, options);
  const ports = probePortList(options);
  if (ports.length) {
    const attached = await findRunningDevServer(ports);
    if (attached) {
      options.onProgress?.(`Attached to existing development server at ${attached}`);
      return attachProject(attached);
    }
  }
  if (!descriptor.command && !options.devCommand?.length) throw new ProjectError("DEVELOPMENT_COMMAND_UNKNOWN", "No validated project command is available.");
  return startCommandProject(descriptor, options);
}

export async function startProject(descriptor: ProjectDescriptor, options: ProjectRuntimeOptions = {}): Promise<ProjectRuntime> {
  return resolveDevServer(descriptor, options);
}

export async function attachProject(url: string): Promise<ProjectRuntime> {
  const verified = loopbackUrl(url);
  if (!verified) throw new ProjectError("ATTACH_URL_INVALID", `Only an explicit loopback HTTP URL can be attached: ${url}.`);
  if (!(await probeAttachable(verified))) throw new ProjectError("ATTACH_NOT_READY", `The requested local server did not return a usable HTML page: ${verified}. Directory listings and empty responses are rejected.`);
  return {
    url: verified,
    ownership: false,
    command: ["attach", verified],
    stdout: [],
    stderr: [],
    done: new Promise(() => undefined),
    async stop() { /* Attached processes are never owned or stopped by Reframe. */ },
  };
}
