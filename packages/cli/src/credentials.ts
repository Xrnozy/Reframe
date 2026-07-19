import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const protectScript = "Add-Type -AssemblyName System.Security; $v=[Console]::In.ReadToEnd(); $b=[Text.Encoding]::UTF8.GetBytes($v); [Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))";
const unprotectScript = "Add-Type -AssemblyName System.Security; $v=[Console]::In.ReadToEnd(); $b=[Convert]::FromBase64String($v); [Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))";

function directory(): string { return path.join(process.env.LOCALAPPDATA || path.join(homedir(), "AppData", "Local"), "Reframe"); }

function powershell(script: string, input: string): Promise<string> {
  if (process.platform !== "win32") return Promise.reject(new Error("OS_CREDENTIAL_STORE_UNAVAILABLE"));
  return new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { windowsHide: true, stdio: ["pipe", "pipe", "ignore"] });
    const chunks: Buffer[] = []; let size = 0;
    child.stdout.on("data", (chunk: Buffer) => { size += chunk.length; if (size <= 8_192) chunks.push(chunk); });
    child.once("error", () => reject(new Error("CREDENTIAL_STORE_FAILED")));
    child.once("exit", (code) => code === 0 && size <= 8_192 ? resolve(Buffer.concat(chunks).toString("utf8").trim()) : reject(new Error("CREDENTIAL_STORE_FAILED")));
    child.stdin.end(input);
  });
}

export async function storeOpenAiApiKey(apiKey: string, credentialDirectory = directory()): Promise<void> {
  if (!apiKey.trim() || apiKey.length > 512 || /\s/.test(apiKey)) throw new Error("PROVIDER_AUTH_INVALID");
  const protectedValue = await powershell(protectScript, apiKey);
  const file = path.join(credentialDirectory, "credentials.json"); const temporary = `${file}.${randomUUID()}.tmp`;
  await mkdir(credentialDirectory, { recursive: true });
  try { await writeFile(temporary, `${JSON.stringify({ version: 1, provider: "openai", protected: protectedValue })}\n`, { mode: 0o600 }); await rm(file, { force: true }); await rename(temporary, file); }
  catch (error) { await rm(temporary, { force: true }).catch(() => undefined); throw error; }
}

export async function loadOpenAiApiKey(credentialDirectory = directory()): Promise<string | undefined> {
  let value: unknown;
  try { value = JSON.parse(await readFile(path.join(credentialDirectory, "credentials.json"), "utf8")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw new Error("CREDENTIAL_STORE_INVALID"); }
  if (!value || typeof value !== "object" || (value as { version?: unknown }).version !== 1 || (value as { provider?: unknown }).provider !== "openai" || typeof (value as { protected?: unknown }).protected !== "string") throw new Error("CREDENTIAL_STORE_INVALID");
  const apiKey = await powershell(unprotectScript, (value as { protected: string }).protected);
  if (!apiKey || apiKey.length > 512 || /\s/.test(apiKey)) throw new Error("CREDENTIAL_STORE_INVALID");
  return apiKey;
}

export async function removeOpenAiApiKey(credentialDirectory = directory()): Promise<void> { await rm(path.join(credentialDirectory, "credentials.json"), { force: true }); }

export async function promptOpenAiApiKey(): Promise<string> {
  if (!process.stdin.isTTY || !process.stdin.setRawMode) throw new Error("AUTH_TTY_REQUIRED");
  process.stdout.write("OpenAI API key: "); process.stdin.setRawMode(true); process.stdin.resume();
  let value = "";
  try {
    return await new Promise<string>((resolve, reject) => {
      const onData = (chunk: Buffer) => {
        for (const byte of chunk) {
          if (byte === 3) { process.stdin.off("data", onData); reject(new Error("AUTH_CANCELLED")); return; }
          if (byte === 13 || byte === 10) { process.stdin.off("data", onData); resolve(value); return; }
          if (byte === 8 || byte === 127) value = value.slice(0, -1);
          else if (byte >= 32 && byte <= 126 && value.length < 512) value += String.fromCharCode(byte);
        }
      };
      process.stdin.on("data", onData);
    });
  } finally { process.stdin.setRawMode(false); process.stdin.pause(); process.stdout.write("\n"); }
}
