import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { createProjectProxy, type ProjectProxy, type ProjectProxyOptions } from "../../packages/dev-server/src/index.js";
import { reservePort } from "../helpers/port-probe.js";
import { startViteDemo, type ManagedProcess } from "../helpers/process-harness.js";
import { projectRoot } from "../helpers/paths.js";

let copyRoot: string | undefined;
let demo: ManagedProcess | undefined;
let proxy: ProjectProxy | undefined;

async function copyDemo(name: "vanilla-demo" | "react-demo"): Promise<string> {
  const base = path.join(projectRoot, ".reframe-test-artifacts", "phase6-e2e");
  await mkdir(base, { recursive: true });
  copyRoot = await mkdtemp(path.join(base, `${name}-`));
  await cp(path.join(projectRoot, "demo", name), copyRoot, { recursive: true });
  return copyRoot;
}

async function start(
  name: "vanilla-demo" | "react-demo",
  framework: "vanilla" | "react",
  prepare?: (root: string) => Promise<void>,
  options: Pick<ProjectProxyOptions, "verificationTimeoutMs" | "verifyEdit" | "onEditProposal"> & { sourceEditing?: boolean } = {},
): Promise<string> {
  const root = await copyDemo(name);
  await prepare?.(root);
  const port = await reservePort();
  await port.release();
  demo = await startViteDemo(root, port.port);
  const { sourceEditing = true, ...proxyOptions } = options;
  proxy = createProjectProxy(`http://127.0.0.1:${port.port}/`, {
    ...proxyOptions,
    projectRoot: sourceEditing ? root : undefined,
    project: { id: `phase6_${framework}`, name: `Phase 6 ${framework}`, framework, capabilities: { canExplore: true, canWriteSource: true } },
  });
  return (await proxy.listen()).url;
}

async function ready(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await expect(page.locator("#reframe-root")).toHaveAttribute("data-reframe-state", "connected", { timeout: 5_000 });
}

async function selectAndApply(page: Page, selector: string, width: number): Promise<void> {
  await page.locator('#reframe-root [data-reframe-tool="select"]').click();
  await page.locator(selector).click();
  await expect(page.locator("#reframe-root [data-reframe-mapping]")).toHaveText("exact");
  await page.evaluate((value) => window[Symbol.for("reframe.browser-client")].previewWidth(value), width);
  await expect(page.locator("#reframe-root [data-reframe-apply]")).toBeEnabled();
  await page.locator("#reframe-root [data-reframe-apply]").click();
  await expect(page.locator("#reframe-root [data-reframe-diagnostic]")).toContainText("Saved to source");
}

async function sourceFiles(root: string): Promise<Map<string, Buffer>> {
  const output = new Map<string, Buffer>();
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".reframe") continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile()) output.set(path.relative(root, absolute).split(path.sep).join("/"), await readFile(absolute));
    }
  }
  await visit(root);
  return output;
}

test.afterEach(async () => {
  await proxy?.close();
  proxy = undefined;
  await demo?.stop();
  demo = undefined;
  if (copyRoot) await rm(copyRoot, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 });
  copyRoot = undefined;
});

test("P6-01 persists one Vanilla ID width after reload without writing metadata", async ({ page }) => {
  const url = await start("vanilla-demo", "vanilla");
  const css = path.join(copyRoot!, "style.css");
  const html = path.join(copyRoot!, "index.html");
  await ready(page, url);
  await expect(page.locator("#card-annual")).toHaveAttribute("data-reframe-source-id", "card-annual");
  await selectAndApply(page, "#card-annual h2", 420.4);
  await expect.poll(() => readFile(css, "utf8")).toContain("#pricing-grid #card-annual { width: 420px;");
  await expect(page.locator("#card-annual")).toHaveCSS("width", "420px");
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#card-annual")).toHaveCSS("width", "420px");
  expect(await readFile(html, "utf8")).not.toContain("data-reframe-source");
});

test("P6-03 exposes ambiguous evidence, disables Apply, and leaves disk unchanged", async ({ page }) => {
  const url = await start("vanilla-demo", "vanilla", async (root) => {
    await writeFile(path.join(root, "duplicate.css"), "#card-annual { width: 320px; }\n");
  });
  const css = path.join(copyRoot!, "style.css");
  const before = await readFile(css);
  await ready(page, url);
  await page.locator('#reframe-root [data-reframe-tool="select"]').click();
  await page.locator("#card-annual").click();
  await expect(page.locator("#reframe-root [data-reframe-mapping]")).toHaveText("ambiguous");
  await expect(page.locator("#reframe-root [data-reframe-diagnostic]")).toContainText("Multiple");
  await expect(page.locator("#card-annual")).toHaveAttribute("data-reframe-source", /\.css:/);
  await page.evaluate(() => window[Symbol.for("reframe.browser-client")].previewWidth(420));
  await expect(page.locator("#reframe-root [data-reframe-apply]")).toBeDisabled();
  expect(await readFile(css)).toEqual(before);
});

test("P6-05 serves React component, range, instance, props, style-owner, and reuse metadata before one CSS edit", async ({ page }) => {
  const url = await start("react-demo", "react");
  const jsx = path.join(copyRoot!, "src", "PricingCard.jsx");
  const css = path.join(copyRoot!, "src", "styles.css");
  await ready(page, url);
  const annual = page.locator("#card-annual");
  await expect(annual).toHaveAttribute("data-reframe-component", "PricingCard");
  await expect(annual).toHaveAttribute("data-reframe-source", /^src\/PricingCard\.jsx:\d+$/);
  await expect(annual).toHaveAttribute("data-reframe-range", /^\d+:\d+$/);
  await expect(annual).toHaveAttribute("data-reframe-instance", "PricingCard:annual");
  await expect(annual).toHaveAttribute("data-reframe-props", "id,name,description");
  expect(await readFile(jsx, "utf8")).not.toContain("data-reframe-component");

  await page.locator('#reframe-root [data-reframe-tool="select"]').click();
  await annual.click();
  await expect(page.locator("#reframe-root [data-reframe-mapping]")).toHaveText("exact");
  await expect(annual).toHaveAttribute("data-reframe-style-owner", /^src\/styles\.css:\d+$/);
  await expect(annual).toHaveAttribute("data-reframe-reused", "false");
  await page.evaluate(() => window[Symbol.for("reframe.browser-client")].previewWidth(420));
  await page.locator("#reframe-root [data-reframe-apply]").click();
  await expect.poll(() => readFile(css, "utf8")).toContain(".pricing-card--annual { width: 420px;");
  await expect(annual).toHaveCSS("width", "420px");
});

test("P6-10 disables Apply for a computed React class expression", async ({ page }) => {
  const url = await start("react-demo", "react", async (root) => {
    await writeFile(path.join(root, "src", "App.jsx"), 'import "./styles.css"; export function App(){ const size="annual"; return <article id="card-annual" className={`pricing-card pricing-card--${size}`}>Annual</article>; }\n');
  });
  const source = path.join(copyRoot!, "src", "App.jsx");
  const before = await readFile(source);
  await ready(page, url);
  await page.locator('#reframe-root [data-reframe-tool="select"]').click();
  await page.locator("#card-annual").evaluate((element) => element.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true })));
  await expect(page.locator("#reframe-root [data-reframe-mapping]")).toHaveText("not-mapped");
  await expect(page.locator("#reframe-root [data-reframe-diagnostic]")).toContainText("Dynamic className");
  await page.evaluate(() => window[Symbol.for("reframe.browser-client")].previewWidth(420));
  await expect(page.locator("#reframe-root [data-reframe-apply]")).toBeDisabled();
  expect(await readFile(source)).toEqual(before);
});

test("P6-11 requires explicit shared-impact approval before Apply", async ({ page }) => {
  const url = await start("react-demo", "react");
  const css = path.join(copyRoot!, "src", "styles.css");
  await ready(page, url);
  await page.locator('#reframe-root [data-reframe-tool="select"]').click();
  await page.locator("#card-starter").evaluate((element) => element.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true })));
  await expect(page.locator("#reframe-root [data-reframe-mapping]")).toHaveText("probable");
  await expect(page.locator("#reframe-root [data-reframe-diagnostic]")).toContainText("PricingCard component/style owner");
  await expect(page.locator("#card-starter")).toHaveAttribute("data-reframe-source", /PricingCard\.jsx:/);
  await expect(page.locator("#card-starter")).toHaveAttribute("data-reframe-instance", "PricingCard:starter");
  await expect(page.locator("#card-starter")).toHaveAttribute("data-reframe-style-owner", /^src\/styles\.css:\d+$/);
  await expect(page.locator("#card-starter")).toHaveAttribute("data-reframe-reused", "true");
  await expect(page.locator("#reframe-root [data-reframe-impact]")).toBeVisible();
  await page.evaluate(() => window[Symbol.for("reframe.browser-client")].previewWidth(420));
  await expect(page.locator("#reframe-root [data-reframe-apply]")).toBeDisabled();
  await page.locator("#reframe-root [data-reframe-impact]").click();
  await expect(page.locator("#reframe-root [data-reframe-mapping]")).toHaveText("exact");
  await expect(page.locator("#reframe-root [data-reframe-apply]")).toBeEnabled();
  await page.locator("#reframe-root [data-reframe-apply]").click();
  await expect.poll(() => readFile(css, "utf8")).toContain(".pricing-card { width: 420px");
  await expect(page.locator("#card-enterprise")).toHaveCSS("width", "420px");
});

test("P6-17 rolls back when the browser reports a page error during post-write verification", async ({ page }) => {
  const url = await start("vanilla-demo", "vanilla");
  const css = path.join(copyRoot!, "style.css");
  const before = await readFile(css);
  await ready(page, url);
  const originalWidth = await page.locator("#card-annual").evaluate((element) => getComputedStyle(element).width);
  await page.locator('#reframe-root [data-reframe-tool="select"]').click();
  await page.locator("#card-annual").click();
  await page.evaluate(() => window[Symbol.for("reframe.browser-client")].previewWidth(420));
  await expect(page.locator("#reframe-root [data-reframe-apply]")).toBeEnabled();
  await page.evaluate(() => {
    const button = document.querySelector("#reframe-root").shadowRoot.querySelector("[data-reframe-apply]");
    button.addEventListener("click", () => setTimeout(() => { throw new Error("P6-17 injected page failure"); }, 0), { once: true });
  });
  await page.locator("#reframe-root [data-reframe-apply]").click();
  await expect(page.locator("#reframe-root [data-reframe-diagnostic]")).toContainText("rolled-back: VERIFICATION_FAILED", { timeout: 15_000 });
  expect(await readFile(css)).toEqual(before);
  await expect(page.locator("#card-annual")).toHaveCSS("width", originalWidth);
});

test("P6-18 rolls back on the configured verification timeout and offers retry", async ({ page }) => {
  const url = await start("vanilla-demo", "vanilla", undefined, { verificationTimeoutMs: 25, verifyEdit: () => new Promise(() => undefined) });
  const css = path.join(copyRoot!, "style.css");
  const before = await readFile(css);
  await ready(page, url);
  await page.locator('#reframe-root [data-reframe-tool="select"]').click();
  await page.locator("#card-annual").click();
  await expect(page.locator("#reframe-root [data-reframe-mapping]")).toHaveText("exact");
  await page.evaluate(() => window[Symbol.for("reframe.browser-client")].previewWidth(420));
  await page.locator("#reframe-root [data-reframe-apply]").click();
  await expect(page.locator("#reframe-root [data-reframe-diagnostic]")).toContainText("rolled-back: VERIFICATION_TIMEOUT");
  await expect(page.locator("#reframe-root [data-reframe-diagnostic]")).toContainText("retry or reselect");
  await expect(page.locator("#reframe-root [data-reframe-apply]")).toBeEnabled();
  expect(await readFile(css)).toEqual(before);
});

test("P6-19 presents critical rollback failure and disables further edits", async ({ page }) => {
  const url = await start("vanilla-demo", "vanilla", undefined, {
    sourceEditing: false,
    onEditProposal: () => ({ status: "critical", code: "ROLLBACK_FAILED: backup retained with original hash" }),
  });
  const css = path.join(copyRoot!, "style.css");
  const before = await readFile(css);
  await ready(page, url);
  await page.locator('#reframe-root [data-reframe-tool="select"]').click();
  await page.locator("#card-annual").click();
  await expect(page.locator("#reframe-root [data-reframe-mapping]")).toHaveText("exact");
  await page.evaluate(() => window[Symbol.for("reframe.browser-client")].previewWidth(420));
  await page.locator("#reframe-root [data-reframe-apply]").click();
  await expect(page.locator("#reframe-root [data-reframe-diagnostic]")).toContainText("critical: ROLLBACK_FAILED");
  await expect(page.locator("#reframe-root [data-reframe-apply]")).toBeDisabled();
  expect(await readFile(css)).toEqual(before);
});

test("P6-21 completes the React persistent edit milestone and changes only styles.css", async ({ page }) => {
  const url = await start("react-demo", "react");
  const before = await sourceFiles(copyRoot!);
  const css = path.join(copyRoot!, "src", "styles.css");
  await ready(page, url);
  await selectAndApply(page, "#card-annual", 420);
  await expect.poll(() => readFile(css, "utf8")).toContain(".pricing-card--annual { width: 420px;");
  await expect(page.locator("#card-annual")).toHaveCSS("width", "420px");
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#card-annual")).toHaveCSS("width", "420px");
  await page.locator('#reframe-root [data-reframe-tool="select"]').click();
  await page.locator("#card-annual").click();
  await expect(page.locator("#reframe-root [data-reframe-mapping]")).toHaveText("exact");

  const after = await sourceFiles(copyRoot!);
  const changed = [...after].filter(([relative, bytes]) => !before.get(relative)?.equals(bytes)).map(([relative]) => relative);
  expect(changed).toEqual(["src/styles.css"]);
});
