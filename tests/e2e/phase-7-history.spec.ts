import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { expect, test, type Page } from "@playwright/test";
import { createProjectProxy, type ProjectProxy, type ProjectProxyOptions } from "../../packages/dev-server/src/index.js";
import { reservePort } from "../helpers/port-probe.js";
import { startViteDemo, type ManagedProcess } from "../helpers/process-harness.js";
import { projectRoot } from "../helpers/paths.js";

let copyRoot: string | undefined;
let demo: ManagedProcess | undefined;
let proxy: ProjectProxy | undefined;
const exec = promisify(execFile);

async function start(prepare?: (root: string) => Promise<void>, captureHistoryScreenshot?: ProjectProxyOptions["captureHistoryScreenshot"]): Promise<string> {
  const base = path.join(projectRoot, ".reframe-test-artifacts", "phase7-e2e");
  await mkdir(base, { recursive: true });
  copyRoot = await mkdtemp(path.join(base, "vanilla-"));
  await cp(path.join(projectRoot, "demo", "vanilla-demo"), copyRoot, { recursive: true });
  await rm(path.join(copyRoot, ".reframe"), { recursive: true, force: true });
  await prepare?.(copyRoot);
  const port = await reservePort();
  await port.release();
  demo = await startViteDemo(copyRoot, port.port);
  proxy = createProjectProxy(`http://127.0.0.1:${port.port}/`, {
    projectRoot: copyRoot,
    captureHistoryScreenshot,
    project: { id: "phase7_vanilla", name: "Phase 7 vanilla", framework: "vanilla", capabilities: { canExplore: true, canWriteSource: true } },
  });
  return (await proxy.listen()).url;
}

async function ready(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await expect(page.locator("#reframe-root")).toHaveAttribute("data-reframe-state", "connected", { timeout: 5_000 });
}

async function apply(page: Page, width: number): Promise<void> {
  await page.locator("#reframe-root [data-reframe-select]").click();
  await page.locator("#card-annual").click();
  await expect(page.locator("#reframe-root [data-reframe-mapping]")).toHaveText("exact");
  await page.evaluate((value) => window[Symbol.for("reframe.browser-client")].previewWidth(value), width);
  await page.locator("#reframe-root [data-reframe-apply]").click();
  await expect(page.locator("#reframe-root [data-reframe-diagnostic]")).toContainText("source edit applied");
  await expect(page.locator("#reframe-root [data-reframe-restore]")).toBeEnabled();
}

async function restore(page: Page): Promise<void> {
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#reframe-root [data-reframe-restore]").click();
  await expect(page.locator("#reframe-root")).toHaveAttribute("data-reframe-state", "connected", { timeout: 10_000 });
}

test.afterEach(async () => {
  await proxy?.close();
  proxy = undefined;
  await demo?.stop();
  demo = undefined;
  if (copyRoot) await rm(copyRoot, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 });
  copyRoot = undefined;
});

test("P7-02 Restore Previous creates safety history and restores exact source and browser state", async ({ page }) => {
  const url = await start();
  const css = path.join(copyRoot!, "style.css");
  const original = await readFile(css);
  await ready(page, url);
  const originalWidth = await page.locator("#card-annual").evaluate((element) => getComputedStyle(element).width);
  await expect(page.locator("#reframe-root [data-reframe-current]")).toContainText("working tree");
  await apply(page, 420);
  expect(await readFile(css, "utf8")).toContain("width: 420px");
  await expect(page.locator("#card-annual")).toHaveCSS("width", "420px");
  await restore(page);
  await expect.poll(() => readFile(css)).toEqual(original);
  await expect(page.locator("#card-annual")).toHaveCSS("width", originalWidth);
  await expect(page.locator("#reframe-root [data-reframe-current]")).toContainText("working tree");
  await expect(page.locator("#reframe-root [data-reframe-restore]")).toBeDisabled();
});

test("P7-03 no-Git project exposes local history and restores through the toolbar", async ({ page }) => {
  const url = await start();
  await ready(page, url);
  const originalWidth = await page.locator("#card-annual").evaluate((element) => getComputedStyle(element).width);
  expect(await page.evaluate(() => window[Symbol.for("reframe.browser-client")].historyState.gitAvailable)).toBe(false);
  await expect(page.locator("#reframe-root [data-reframe-current]")).toContainText("no Git");
  await apply(page, 430);
  await expect(page.locator("#reframe-root [data-reframe-previous]")).toContainText("original");
  await restore(page);
  await expect(page.locator("#card-annual")).toHaveCSS("width", originalWidth);
});

test("P7-08 screenshot-unavailable history is visibly degraded and remains restorable", async ({ page }) => {
  const url = await start();
  await ready(page, url);
  await apply(page, 440);
  await expect(page.locator("#reframe-root [data-reframe-diagnostic]")).toContainText("visual history degraded");
  expect(await page.evaluate(() => window[Symbol.for("reframe.browser-client")].historyState.visualComplete)).toBe(false);
  await expect(page.locator("#reframe-root [data-reframe-restore]")).toBeEnabled();
});

test("SUP-P7-01 explicitly checkpoints an overlapping source change before saving the resize", async ({ page }) => {
  const url = await start(async (root) => {
    const git = (...args: string[]) => exec("git", args, { cwd: root, windowsHide: true });
    await git("init", "-q");
    await git("config", "user.email", "phase7@example.invalid");
    await git("config", "user.name", "Phase 7 Test");
    await git("add", ".");
    await git("commit", "-qm", "fixture");
    const css = path.join(root, "style.css");
    await writeFile(css, (await readFile(css, "utf8")).replace(/(#pricing-grid #card-annual\s*\{[^}]*width:\s*)\d+px/, (_match, prefix: string) => `${prefix}496px`));
  });
  await ready(page, url);
  await page.locator("#reframe-root [data-reframe-select]").click();
  await page.locator("#card-annual").click();
  await expect(page.locator("#reframe-root [data-reframe-mapping]")).toHaveText("exact");
  await expect(page.locator("#reframe-root [data-reframe-overlap]")).toBeHidden();
  await expect(page.locator("#reframe-root [data-reframe-impact]")).toBeHidden();
  await page.evaluate(() => window[Symbol.for("reframe.browser-client")].previewWidth(520));
  await page.locator("#reframe-root [data-reframe-apply]").click();
  await expect(page.locator("#reframe-root [data-reframe-diagnostic]")).toContainText("Source changed outside Reframe");
  await expect(page.locator("#reframe-root [data-reframe-overlap]")).toBeVisible();
  let dialogs = 0;
  page.on("dialog", async (dialog) => { dialogs += 1; await dialog.dismiss(); });
  await page.locator("#card-enterprise").click();
  expect(dialogs).toBe(0);
  await expect(page.locator("#reframe-root [data-reframe-diagnostic]")).toContainText("Click Save resize safely or Cancel");
  await page.locator("#reframe-root [data-reframe-overlap]").click();
  await expect(page.locator("#reframe-root [data-reframe-diagnostic]")).toContainText("source edit applied");
  expect(await readFile(path.join(copyRoot!, "style.css"), "utf8")).toContain("width: 520px");
  await expect(page.locator("#reframe-root [data-reframe-restore]")).toBeEnabled();
});

test("SUP-P7-02 keeps save state coherent when the user clicks another element during checkpointing", async ({ page }) => {
  let releaseCheckpoint!: () => void;
  const checkpointHeld = new Promise<void>((resolve) => { releaseCheckpoint = resolve; });
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.from("phase7-IEND-image")]);
  const url = await start(undefined, async (stage) => { if (stage === "after") await checkpointHeld; return png; });
  await ready(page, url);
  await page.locator("#reframe-root [data-reframe-select]").click();
  await page.locator("#card-annual").click();
  await expect(page.locator("#reframe-root [data-reframe-mapping]")).toHaveText("exact");
  await page.evaluate(() => window[Symbol.for("reframe.browser-client")].previewWidth(520));
  await page.locator("#reframe-root [data-reframe-apply]").click();
  await expect.poll(() => readFile(path.join(copyRoot!, "style.css"), "utf8")).toContain("width: 520px");
  let dialogs = 0;
  page.on("dialog", async (dialog) => { dialogs += 1; await dialog.accept(); });
  await page.locator("#card-enterprise").click();
  releaseCheckpoint();
  expect(dialogs).toBe(0);
  await expect(page.locator("#reframe-root [data-reframe-diagnostic]")).toContainText("source edit applied");
  await expect(page.locator("#reframe-root [data-reframe-restore]")).toBeEnabled();
  expect(await page.evaluate(() => window[Symbol.for("reframe.browser-client")].selection)).toBeNull();

  await page.locator("#card-annual").click();
  await expect(page.locator("#reframe-root [data-reframe-mapping]")).toHaveText("exact");
  await page.evaluate(() => window[Symbol.for("reframe.browser-client")].previewWidth(530));
  await page.locator("#reframe-root [data-reframe-apply]").click();
  await expect(page.locator("#reframe-root [data-reframe-diagnostic]")).toContainText("source edit applied");
  expect(await readFile(path.join(copyRoot!, "style.css"), "utf8")).toContain("width: 530px");
});
