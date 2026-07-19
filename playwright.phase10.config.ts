import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

const chrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  reporter: [["line"]],
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], channel: process.platform === "win32" && existsSync(chrome) ? "chrome" : undefined } },
    { name: "firefox", use: { ...devices["Desktop Firefox"], launchOptions: { timeout: 30_000, firefoxUserPrefs: { "gfx.webrender.all": false, "gfx.webrender.software": false, "layers.acceleration.disabled": true } } } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  use: { trace: "retain-on-failure", screenshot: "only-on-failure" },
});
