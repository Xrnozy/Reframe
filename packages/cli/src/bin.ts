#!/usr/bin/env node
import { runReframe } from "./run.js";
import { installSignalHandlers } from "./signals.js";
import { promptOpenAiApiKey, removeOpenAiApiKey, storeOpenAiApiKey } from "./credentials.js";
import { runDesignDnaCommand } from "./design-dna-command.js";
import type { ProjectFramework } from "@reframe/dev-server";

if (process.argv[2] === "auth") {
  try {
    if (process.argv[3] === "logout") { await removeOpenAiApiKey(); process.stdout.write("OpenAI credential removed.\n"); }
    else if (process.argv[3] === "api") { await storeOpenAiApiKey(await promptOpenAiApiKey()); process.stdout.write("OpenAI credential stored with Windows DPAPI for the optional API fallback.\n"); }
    else if (process.argv.length > 3) throw new Error("AUTH_USAGE: use `reframe auth`, `reframe auth api`, or `reframe auth logout`");
    else process.stdout.write("Reframe uses your existing Codex login; no API key is required. Run `codex login` only if Codex is signed out.\n");
    process.exit(0);
  } catch (error) { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exit(1); }
}

if (process.argv[2] === "dna") {
  try { process.exit(await runDesignDnaCommand(process.argv.slice(3), process.cwd())); }
  catch (error) { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exit(1); }
}

function cliOptions(argv: string[]) {
  let framework: ProjectFramework | undefined;
  let devCommand = process.env.REFRAME_DEV_CMD;
  let attachUrl = process.env.REFRAME_DEV_URL;
  let port = process.env.REFRAME_PORT === undefined ? undefined : Number(process.env.REFRAME_PORT);
  let explicit = false;
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--framework" && argv[index + 1]) { framework = argv[++index] as ProjectFramework; explicit = true; continue; }
    if (arg === "--dev-cmd" && argv[index + 1]) { devCommand = argv[++index]; explicit = true; continue; }
    if (arg === "--url" && argv[index + 1]) { attachUrl = argv[++index]; explicit = true; continue; }
    if (arg === "--port" && argv[index + 1]) { port = Number(argv[++index]); continue; }
  }
  return { framework, devCommand, attachUrl, port, skipDetectionConfirm: explicit };
}

const controller = new AbortController();
const removeSignalHandlers = installSignalHandlers(process, () => controller.abort(), () => process.exit(1));
const parsed = cliOptions(process.argv);
const exitCode = await runReframe({
  port: parsed.port,
  signal: controller.signal,
  projectMode: process.env.REFRAME_WELCOME_ONLY !== "1",
  projectRoot: process.cwd(),
  frameworkChoice: parsed.framework,
  devCommand: parsed.devCommand,
  attachUrl: parsed.attachUrl,
  skipDetectionConfirm: parsed.skipDetectionConfirm,
});
removeSignalHandlers();
process.exitCode = exitCode;
