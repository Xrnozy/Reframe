import { spawn } from "node:child_process";
import os from "node:os";

export type BrowserOpener = (url: string) => Promise<void>;

export const openBrowser: BrowserOpener = async (url) => {
  const override = process.env.REFRAME_BROWSER;
  const executable = override ?? (process.platform === "win32" ? "cmd.exe" : process.platform === "darwin" ? "open" : "xdg-open");
  let overrideArgs: string[] = [];
  if (override && process.env.REFRAME_BROWSER_ARGS) {
    const parsed: unknown = JSON.parse(process.env.REFRAME_BROWSER_ARGS);
    if (!Array.isArray(parsed) || !parsed.every((value) => typeof value === "string")) throw new Error("REFRAME_BROWSER_ARGS must be a JSON string array");
    overrideArgs = parsed;
  }
  const args = override ? [...overrideArgs, url] : process.platform === "win32" ? ["/d", "/s", "/c", "start", "", url] : [url];
  const child = spawn(executable, args, { cwd: os.tmpdir(), detached: true, shell: false, stdio: "ignore", windowsHide: true });
  await new Promise<void>((resolve, reject) => {
    child.once("spawn", resolve);
    child.once("error", reject);
  });
  child.unref();
};
