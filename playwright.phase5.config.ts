import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

const windowsChrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const chromeChannel = process.platform === "win32" && existsSync(windowsChrome) ? "chrome" : undefined;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  reporter: [["line"]],
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], channel: chromeChannel } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  use: { trace: "retain-on-failure", screenshot: "only-on-failure" },
});
