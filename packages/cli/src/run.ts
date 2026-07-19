import { createCodexCliProvider, createOpenAiCodexProvider, createProjectProxy, createWelcomeServer, COMMON_DEV_PORTS, defaultPortForFramework, detectProject, frameworkLabel, parseDevCommand, ProjectError, proxyFramework, REFRAME_PORT, resolveAiProviderDeadlineMs, resolveDevServer, stackLimitations, type DetectProjectOptions, type ProjectDescriptor, type ProjectFramework, type ProjectProxy, type ProjectRuntime, type ProjectRuntimeOptions, type WelcomeServer } from "@reframe/dev-server";
import { createInterface } from "node:readline/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { openBrowser, type BrowserOpener } from "./browser-opener.js";
import { processOutput, projectReadyMessage, readyMessage, type Output } from "./output.js";
import { loadOpenAiApiKey } from "./credentials.js";
import { createBrowserScreenshotCapture } from "./screenshot-capture.js";

const require = createRequire(import.meta.url);

function codexCommand(): readonly string[] | undefined {
  if (process.env.REFRAME_CODEX_PATH) return [process.env.REFRAME_CODEX_PATH];
  try { return [process.execPath, require.resolve("@openai/codex/bin/codex.js")]; }
  catch { return undefined; }
}

export type LifecycleState = "starting" | "ready" | "stopping" | "stopped" | "failed";

export interface RunOptions {
  port?: number;
  nodeVersion?: string;
  signal?: AbortSignal;
  browserOpener?: BrowserOpener;
  output?: Output;
  onState?: (state: LifecycleState, server?: WelcomeServer | ProjectProxy) => void;
  projectMode?: boolean;
  projectRoot?: string;
  projectRuntimeOptions?: ProjectRuntimeOptions;
  frameworkChoice?: ProjectFramework;
  devCommand?: string;
  attachUrl?: string;
  skipDetectionConfirm?: boolean;
}

export class ReframeError extends Error {
  constructor(readonly code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = "ReframeError";
  }
}

function assertSupportedNode(version: string): void {
  const major = Number.parseInt(version.split(".")[0] ?? "", 10);
  if (!Number.isInteger(major) || major < 22 || major >= 25) {
    throw new ReframeError("NODE_VERSION_UNSUPPORTED", `Reframe requires Node >=22 <25; found ${version}. No files, ports, or browsers were opened.`);
  }
}

function configuredPort(value: number | undefined): number {
  const port = value ?? REFRAME_PORT;
  if (!Number.isInteger(port) || port < 0 || port > 65_535) throw new ReframeError("PORT_INVALID", `Invalid port ${port}.`);
  return port;
}

async function probeHealth(port: number, signal?: AbortSignal): Promise<void> {
  const response = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.any([AbortSignal.timeout(2_000), ...(signal ? [signal] : [])]) });
  if (!response.ok || (await response.json() as { status?: string }).status !== "ok") throw new Error(`health probe returned HTTP ${response.status}`);
}

function waitForStop(signal: AbortSignal | undefined, server: WelcomeServer): Promise<"signal" | Error> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve("signal");
    signal?.addEventListener("abort", () => resolve("signal"), { once: true });
    server.server.once("error", (error) => resolve(error));
  });
}

export async function runReframe(options: RunOptions = {}): Promise<number> {
  if (options.projectMode) return runProjectReframe(options);
  const output = options.output ?? processOutput;
  const setState = (state: LifecycleState, server?: WelcomeServer | ProjectProxy) => options.onState?.(state, server);
  let server: WelcomeServer | undefined;
  setState("starting");
  try {
    assertSupportedNode(options.nodeVersion ?? process.versions.node);
    const requestedPort = configuredPort(options.port);
    if (options.signal?.aborted) {
      setState("stopping");
      setState("stopped");
      return 0;
    }
    server = createWelcomeServer();
    let port: number;
    try {
      port = await server.listen(requestedPort);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EADDRINUSE") {
        throw new ReframeError("PORT_IN_USE", `Port ${requestedPort} is already in use. Stop the other process or set REFRAME_PORT to a free port.`);
      }
      throw new ReframeError("HTTP_SERVER_FAILED", `The local server could not start: ${String(error)}. Source files were not changed; restart Reframe.`);
    }
    if (options.signal?.aborted) {
      setState("stopping", server);
      await server.close();
      setState("stopped");
      return 0;
    }
    try {
      await probeHealth(port, options.signal);
    } catch (error) {
      if (options.signal?.aborted) {
        setState("stopping", server);
        await server.close();
        setState("stopped");
        return 0;
      }
      throw new ReframeError("HTTP_SERVER_FAILED", `The local server failed its health check: ${String(error)}. Source files were not changed; restart Reframe.`);
    }
    if (options.signal?.aborted) {
      setState("stopping", server);
      await server.close();
      setState("stopped");
      return 0;
    }
    const url = `http://localhost:${port}`;
    let browserOpened = true;
    try {
      await (options.browserOpener ?? openBrowser)(url);
    } catch (error) {
      browserOpened = false;
      output.stderr(`BROWSER_OPEN_FAILED: Browser could not be opened (${String(error)}). Open ${url} manually.\n`);
    }
    setState("ready", server);
    output.stdout(readyMessage(url, browserOpened));
    const stoppedBy = await waitForStop(options.signal, server);
    setState("stopping", server);
    await server.close();
    if (stoppedBy instanceof Error) {
      setState("failed");
      output.stderr(`HTTP_SERVER_FAILED: The local server stopped unexpectedly (${String(stoppedBy)}). Source files were not changed; restart Reframe.\n`);
      return 1;
    }
    setState("stopped");
    return 0;
  } catch (error) {
    if (server?.server.listening) await server.close().catch(() => undefined);
    setState("failed");
    output.stderr(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

function waitForProjectStop(signal: AbortSignal | undefined, proxy: ProjectProxy, runtime: ProjectRuntime): Promise<"signal" | Error> {
  return Promise.race([
    new Promise<"signal">((resolve) => {
      if (signal?.aborted) resolve("signal");
      else signal?.addEventListener("abort", () => resolve("signal"), { once: true });
    }),
    new Promise<Error>((resolve) => proxy.server.once("error", resolve)),
    runtime.done.then((error) => error ?? new Error("Development server stopped unexpectedly.")),
  ]);
}

async function confirmDetection(output: Output, descriptor: ProjectDescriptor): Promise<void> {
  if (descriptor.confidence === "high" || !process.stdin.isTTY || !process.stdout.isTTY) return;
  const limits = stackLimitations(descriptor.framework, descriptor.styling);
  output.stdout(`Detected ${frameworkLabel(descriptor.framework)} (${descriptor.confidence} confidence).\n`);
  if (limits.length) output.stdout(`${limits.map((item) => `- ${item}`).join("\n")}\n`);
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await terminal.question("Continue with this detection? [Y/n] ");
  terminal.close();
  if (/^n(?:o)?$/i.test(answer.trim())) throw new ProjectError("DETECTION_REJECTED", "Startup cancelled after detection review. No command was started.");
}

async function runProjectReframe(options: RunOptions): Promise<number> {
  const output = options.output ?? processOutput;
  const setState = (state: LifecycleState, server?: WelcomeServer | ProjectProxy) => options.onState?.(state, server);
  let proxy: ProjectProxy | undefined;
  let runtime: ProjectRuntime | undefined;
  let screenshots: ReturnType<typeof createBrowserScreenshotCapture> | undefined;
  setState("starting");
  try {
    assertSupportedNode(options.nodeVersion ?? process.versions.node);
    const root = options.projectRoot ?? process.cwd();
    let detectorOptions: DetectProjectOptions = {
      ...(options.frameworkChoice ? { frameworkChoice: options.frameworkChoice } : {}),
      ...(options.devCommand ? { devCommandOverride: options.devCommand } : {}),
    };
    let descriptor: ProjectDescriptor;
    for (;;) {
      try { descriptor = await detectProject(root, detectorOptions); break; }
      catch (error) {
        if (!(error instanceof ProjectError) || !["PACKAGE_MANAGER_AMBIGUOUS", "DEVELOPMENT_COMMAND_UNKNOWN", "PROJECT_FRAMEWORK_UNKNOWN"].includes(error.code) || !process.stdin.isTTY || !process.stdout.isTTY) throw error;
        output.stdout(`${error.message}\n${error.choices.map((choice, index) => `${index + 1}. ${choice}`).join("\n")}\n`);
        const terminal = createInterface({ input: process.stdin, output: process.stdout });
        const answer = await terminal.question("Choose a command: ");
        const selected = error.choices[Number(answer) - 1] ?? error.choices.find((choice) => choice === answer.trim());
        if (!selected) { terminal.close(); throw new ProjectError("SELECTION_INVALID", `No listed choice matched ${answer}. No command was started.`); }
        let approved = false;
        if (error.code !== "PROJECT_FRAMEWORK_UNKNOWN") {
          approved = /^y(?:es)?$/i.test(await terminal.question("Save this validated choice in .reframe/config.json? [y/N] "));
        }
        terminal.close();
        detectorOptions = error.code === "PACKAGE_MANAGER_AMBIGUOUS"
          ? { ...detectorOptions, packageManagerChoice: selected as "npm" | "pnpm" | "yarn" | "bun", approveConfigWrite: approved }
          : error.code === "PROJECT_FRAMEWORK_UNKNOWN"
            ? { ...detectorOptions, frameworkChoice: selected as ProjectFramework }
            : { ...detectorOptions, commandChoice: selected, approveConfigWrite: approved };
      }
    }
    if (!options.skipDetectionConfirm) await confirmDetection(output, descriptor);
    const frameworkPort = defaultPortForFramework(descriptor.framework);
    const runtimeOptions: ProjectRuntimeOptions = {
      ...options.projectRuntimeOptions,
      ...(options.attachUrl ? { attachUrl: options.attachUrl } : {}),
      ...(options.devCommand ? { devCommand: [...parseDevCommand(options.devCommand)] } : {}),
      probePorts: options.attachUrl ? undefined : [...new Set([...(frameworkPort ? [frameworkPort] : []), ...COMMON_DEV_PORTS])],
      onProgress: options.projectRuntimeOptions?.onProgress,
    };
    runtime = await resolveDevServer(descriptor, runtimeOptions);
    screenshots = createBrowserScreenshotCapture(runtime.url);
    proxy = createProjectProxy(runtime.url, {
      projectRoot: descriptor.root,
      captureHistoryScreenshot: screenshots.capture,
      verifyResponsive: screenshots.verifyResponsive,
      historyScreenshotTimeoutMs: 15_000,
      aiProvider: process.env.REFRAME_AI_PROVIDER === "api"
        ? createOpenAiCodexProvider({ getApiKey: loadOpenAiApiKey })
        : createCodexCliProvider({ command: codexCommand() }),
      aiProviderDeadlineMs: resolveAiProviderDeadlineMs(),
      project: {
        name: path.basename(descriptor.root),
        framework: proxyFramework(descriptor.framework),
        capabilities: { canExplore: descriptor.capabilities.canExplore, canWriteSource: descriptor.capabilities.canWriteSource },
      },
    });
    let proxyAddress: { port: number; url: string };
    try { proxyAddress = await proxy.listen(configuredPort(options.port)); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EADDRINUSE") throw new ReframeError("PORT_IN_USE", `Port ${configuredPort(options.port)} is already in use. Stop the other process or set REFRAME_PORT to a free port.`);
      throw error;
    }
    const proxyResponse = await fetch(proxyAddress.url, { headers: { Accept: "text/html" }, signal: AbortSignal.any([AbortSignal.timeout(2_000), ...(options.signal ? [options.signal] : [])]) });
    if (!proxyResponse.ok || (await proxyResponse.text()).match(/data-reframe-bootstrap/g)?.length !== 1) throw new ReframeError("PROXY_NOT_READY", `The Reframe proxy did not return one injected application page at ${proxyAddress.url}. Source files were not changed; restart Reframe.`);
    if (options.signal?.aborted) {
      setState("stopping", proxy);
      await screenshots.close();
      await runtime.stop();
      await proxy.close();
      setState("stopped");
      return 0;
    }
    let browserOpened = true;
    try { await (options.browserOpener ?? openBrowser)(proxyAddress.url); }
    catch (error) {
      browserOpened = false;
      output.stderr(`BROWSER_OPEN_FAILED: Browser could not be opened (${String(error)}). Open ${proxyAddress.url} manually.\n`);
    }
    setState("ready", proxy);
    output.stdout(projectReadyMessage(descriptor, proxyAddress.url, browserOpened, runtime));
    const stoppedBy = await waitForProjectStop(options.signal, proxy, runtime);
    setState("stopping", proxy);
    await screenshots.close();
    await runtime.stop();
    await proxy.close();
    if (stoppedBy instanceof Error) {
      setState("failed");
      output.stderr(`${stoppedBy.message}\n`);
      return 1;
    }
    setState("stopped");
    return 0;
  } catch (error) {
    await screenshots?.close().catch(() => undefined);
    await proxy?.close().catch(() => undefined);
    await runtime?.stop().catch(() => undefined);
    setState("failed");
    const message = error instanceof ProjectError || error instanceof ReframeError || error instanceof Error ? error.message : String(error);
    output.stderr(`${message}\n`);
    return 1;
  }
}
