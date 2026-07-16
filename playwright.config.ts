import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

const windowsChrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const localExecutable = process.platform === "win32" && existsSync(windowsChrome) ? windowsChrome : undefined;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  reporter: [["line"]],
  use: {
    ...devices["Desktop Chrome"],
    channel: localExecutable ? "chrome" : undefined,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
