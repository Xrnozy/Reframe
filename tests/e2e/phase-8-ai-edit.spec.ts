import { cp, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { createFakeCodexProvider, createProjectProxy, type ProjectProxy } from "../../packages/dev-server/src/index.js";
import { reservePort } from "../helpers/port-probe.js";
import { startViteDemo, type ManagedProcess } from "../helpers/process-harness.js";
import { projectRoot } from "../helpers/paths.js";

let copyRoot: string | undefined;
let demo: ManagedProcess | undefined;
let proxy: ProjectProxy | undefined;

test.afterEach(async () => {
  await proxy?.close(); proxy = undefined;
  await demo?.stop(); demo = undefined;
  if (copyRoot) await rm(copyRoot, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 });
  copyRoot = undefined;
});

test("P8-16 select -> Generate -> packet preview -> Compare -> Reject restores exact source/browser", async ({ page }) => {
  const base = path.join(projectRoot, ".reframe-test-artifacts", "phase8-e2e");
  await mkdir(base, { recursive: true });
  copyRoot = await mkdtemp(path.join(base, "vanilla-"));
  await cp(path.join(projectRoot, "demo", "vanilla-demo"), copyRoot, { recursive: true });
  const css = path.join(copyRoot, "style.css");
  const original = await readFile(css);
  const port = await reservePort(); await port.release();
  demo = await startViteDemo(copyRoot, port.port);
  let generations = 0;
  const provider = createFakeCodexProvider(async (packet, context) => {
    generations += 1;
    return {
      generationId: context.generationId,
      conversationId: context.conversationId,
      changes: [{ path: packet.source.path, expectedHash: packet.source.hash, before: packet.source.snippet, after: `${packet.source.snippet}\n#pricing-grid #card-annual { box-shadow: 0 18px 40px rgb(91 69 214 / .22); }\n` }],
    };
  });
  proxy = createProjectProxy(`http://127.0.0.1:${port.port}/`, { projectRoot: copyRoot, aiProvider: provider, project: { id: "phase8_vanilla", name: "Phase 8 vanilla", framework: "vanilla", capabilities: { canExplore: true, canWriteSource: true } } });
  const url = (await proxy.listen()).url;
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await expect(page.locator("#reframe-root")).toHaveAttribute("data-reframe-state", "connected", { timeout: 5_000 });
  const originalShadow = await page.locator("#card-annual").evaluate((element) => getComputedStyle(element).boxShadow);
  await page.locator("#reframe-root [data-reframe-select]").click();
  await page.locator("#card-annual").click();
  await expect(page.locator("#reframe-root [data-reframe-mapping]")).toHaveText("exact");
  await expect(page.locator("#reframe-root [data-reframe-generate]")).toBeVisible();
  await page.locator("#reframe-root [data-reframe-generate]").click();
  await expect(page.locator("#reframe-root [data-reframe-ai-prompt]")).toBeFocused();
  await expect(page.locator("#reframe-root [data-reframe-ai-status]")).toHaveText("Enter a prompt, then click Generate");
  expect(generations).toBe(0);
  await page.locator("#reframe-root [data-reframe-ai-prompt]").fill("Make the Annual card more prominent");
  await page.locator("#reframe-root [data-reframe-generate]").click();
  await expect.poll(() => generations).toBe(1);
  await expect(page.locator("#reframe-root [data-reframe-ai-status]")).toContainText("review");
  await expect(page.locator("#reframe-root [data-reframe-ai-status]")).toContainText("style.css");
  await expect(page.locator("#reframe-root [data-reframe-ai-accept]")).toBeVisible();
  await expect.poll(() => page.locator("#card-annual").evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe(originalShadow);
  await page.locator("#reframe-root [data-reframe-ai-compare]").click();
  await expect(page.locator("#reframe-root [data-reframe-ai-status]")).toContainText("COMPARE_READY");
  expect(await readFile(css, "utf8")).toContain("0 18px 40px");
  await page.locator("#reframe-root [data-reframe-ai-reject]").click();
  await expect.poll(() => readFile(css)).toEqual(original);
  await expect(page.locator("#card-annual")).toHaveCSS("box-shadow", originalShadow, { timeout: 10_000 });
});
