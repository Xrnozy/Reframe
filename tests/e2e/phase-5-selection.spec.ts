import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { createProjectProxy, type ProjectProxy } from "../../packages/dev-server/src/index.js";
import type { EditApplyMessage } from "../../packages/shared/src/index.js";
import { reservePort } from "../helpers/port-probe.js";
import { startViteDemo, type ManagedProcess } from "../helpers/process-harness.js";
import { projectRoot } from "../helpers/paths.js";

let upstream: Server | undefined;
let demo: ManagedProcess | undefined;
let proxy: ProjectProxy | undefined;
let accepted: Readonly<EditApplyMessage>[] = [];

const fixture = `<!doctype html><html><head><style>
*{box-sizing:border-box}body{margin:0;font:16px Arial}main{padding:70px 24px 600px}.grid{display:flex;gap:20px}.card{width:280px;padding:24px;border:1px solid #ccc}.annual{width:320px}.scroll{width:440px;height:180px;overflow:auto;margin-top:40px;border:1px solid}.scroll-inner{width:900px;height:500px;padding:100px}.edge{width:240px}.constraint{box-sizing:border-box;width:50%;min-width:200px;max-width:450px;transform:translateX(10px)}#hidden{display:none}#zero{width:0;height:0;overflow:hidden}
</style></head><body><main><button id="native-button" onclick="this.dataset.clicked='yes'">Native</button><input id="native-input"><select id="native-menu"><option value="one">One</option><option value="two">Two</option></select><a id="native-link" href="#linked">Link</a><div class="grid"><article id="card-starter" class="card">Starter</article><article id="card-annual" class="card annual"><h2>Annual</h2><p>Edit target</p></article><article id="card-enterprise" class="card">Enterprise</article></div><article id="constraint" class="card constraint">Constraint</article><div class="scroll"><div class="scroll-inner"><article id="edge" class="card edge">Edge</article></div></div><canvas id="canvas" width="100" height="40"></canvas><div id="hidden">Hidden</div><div id="zero">Zero</div><iframe id="frame" src="https://example.invalid"></iframe></main></body></html>`;

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("server has no address");
  return `http://127.0.0.1:${address.port}/`;
}

async function start(upstreamUrl?: string, framework = "vanilla"): Promise<string> {
  accepted = [];
  if (!upstreamUrl) {
    upstream = createServer((_request, response) => response.writeHead(200, { "Content-Type": "text/html" }).end(fixture));
    upstreamUrl = await listen(upstream);
  }
  proxy = createProjectProxy(upstreamUrl, {
    session: "phase5_browser_session",
    connectionToken: "phase5_browser_token_0123456789_ABCDEFG",
    heartbeatIntervalMs: 100,
    heartbeatTimeoutMs: 400,
    reconnectBaseMs: 20,
    reconnectMaxMs: 80,
    project: { id: "phase5_browser_project", name: "Phase 5 browser", framework, capabilities: { canExplore: true, canWriteSource: false } },
    onEditProposal: (proposal) => accepted.push(proposal),
  });
  return (await proxy.listen()).url;
}

async function startDemo(name: "vanilla-demo" | "react-demo", framework: string): Promise<string> {
  const port = await reservePort();
  await port.release();
  demo = await startViteDemo(path.join(projectRoot, "demo", name), port.port);
  return start(`http://127.0.0.1:${port.port}/`, framework);
}

async function ready(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await expect(page.locator("#reframe-root")).toHaveAttribute("data-reframe-state", "connected", { timeout: 5_000 });
}

async function selectElement(page: Page, selector: string): Promise<void> {
  const button = page.locator("#reframe-root [data-reframe-select]");
  if (await button.getAttribute("aria-pressed") !== "true") await button.click();
  await page.locator(selector).click();
  await expect(page.locator("#reframe-root [data-reframe-selected]")).toBeVisible();
}

async function dragWidth(page: Page, delta: number): Promise<void> {
  const box = await page.locator("#reframe-root [data-reframe-handle]").boundingBox();
  if (!box) throw new Error("resize handle is not visible");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + delta, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
}

test.afterEach(async () => {
  await proxy?.close();
  proxy = undefined;
  upstream?.closeAllConnections();
  if (upstream?.listening) await new Promise<void>((resolve) => upstream!.close(() => resolve()));
  upstream = undefined;
  await demo?.stop();
  demo = undefined;
});

test("P5-01 selects only the Vanilla Annual card and previews 320px to 420px without changing disk", async ({ page }) => {
  const source = path.join(projectRoot, "demo", "vanilla-demo", "style.css");
  const before = createHash("sha256").update(await readFile(source)).digest("hex");
  const url = await startDemo("vanilla-demo", "vanilla");
  await ready(page, url);
  await page.addStyleTag({ content: "#pricing-grid #card-annual { width: 320px; }" });
  await selectElement(page, "#card-annual");
  await dragWidth(page, 100);
  await expect.poll(() => page.locator("#card-annual").evaluate((element) => element.getBoundingClientRect().width)).toBe(420);
  await expect(page.locator("#reframe-root [data-reframe-width]")).toContainText("320px → 420px");
  await expect(page.locator("#card-starter")).toHaveCSS("width", "280px");
  expect(createHash("sha256").update(await readFile(source)).digest("hex")).toBe(before);
});

test("P5-02 Cancel and Escape restore exact inline width value, priority, and absence", async ({ page }) => {
  const url = await start();
  await ready(page, url);
  await page.locator("#card-annual").evaluate((element: HTMLElement) => element.style.setProperty("width", "320px", "important"));
  await selectElement(page, "#card-annual");
  await dragWidth(page, 80);
  await page.locator("#reframe-root [data-reframe-cancel]").click();
  expect(await page.locator("#card-annual").evaluate((element: HTMLElement) => [element.style.getPropertyValue("width"), element.style.getPropertyPriority("width")])).toEqual(["320px", "important"]);
  await expect(page.locator("#reframe-root [data-reframe-selected]")).toBeHidden();
  await page.locator("#card-annual").evaluate((element: HTMLElement) => element.style.removeProperty("width"));
  await selectElement(page, "#card-annual");
  await dragWidth(page, 50);
  await page.keyboard.press("Escape");
  expect(await page.locator("#card-annual").evaluate((element: HTMLElement) => Array.from({ length: element.style.length }, (_, index) => element.style.item(index)).includes("width"))).toBe(false);
  await expect(page.locator("#reframe-root [data-reframe-panel]")).toBeHidden();
});

test("P5-03 applies one complete immutable React proposal, receives acknowledgement, and changes no file", async ({ page }) => {
  const source = path.join(projectRoot, "demo", "react-demo", "src", "styles.css");
  const before = createHash("sha256").update(await readFile(source)).digest("hex");
  const url = await startDemo("react-demo", "react");
  await ready(page, url);
  await selectElement(page, "#card-annual");
  await page.evaluate(() => window[Symbol.for("reframe.browser-client")].previewWidth(420));
  await page.locator("#reframe-root [data-reframe-apply]").click();
  await expect(page.locator("#reframe-root [data-reframe-diagnostic]")).toContainText("Saved to source");
  await expect.poll(() => accepted.length).toBe(1);
  expect(accepted[0]).toMatchObject({ width: 420, fingerprint: { id: "card-annual" }, original: { computedWidth: 320 } });
  expect(Object.isFrozen(accepted[0])).toBe(true);
  expect(createHash("sha256").update(await readFile(source)).digest("hex")).toBe(before);
});

test("P5-04 confirms discard before a second selection and leaves exactly one preview", async ({ page }) => {
  const url = await start();
  await ready(page, url);
  await selectElement(page, "#card-annual");
  await page.evaluate(() => window[Symbol.for("reframe.browser-client")].previewWidth(420));
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#card-enterprise").click();
  await expect.poll(() => page.evaluate(() => window[Symbol.for("reframe.browser-client")].selection.label)).toContain("card-enterprise");
  await expect(page.locator("#card-annual")).toHaveCSS("width", "320px");
  await expect(page.locator("#reframe-root [data-reframe-selected]")).toHaveCount(1);
});

test("P5-05 tracks constrained and transformed rectangles and rejects non-finite preview input", async ({ page }) => {
  const url = await start();
  await ready(page, url);
  await selectElement(page, "#constraint");
  const before = await page.locator("#constraint").evaluate((element) => element.getBoundingClientRect().width);
  expect(await page.evaluate(() => window[Symbol.for("reframe.browser-client")].previewWidth(Number.NaN))).toBe(false);
  expect(await page.locator("#constraint").evaluate((element) => element.getBoundingClientRect().width)).toBe(before);
  await page.evaluate(() => window[Symbol.for("reframe.browser-client")].previewWidth(900));
  await expect.poll(() => page.locator("#constraint").evaluate((element) => element.getBoundingClientRect().width)).toBe(450);
  const [target, overlay] = await Promise.all([page.locator("#constraint").boundingBox(), page.locator("#reframe-root [data-reframe-selected]").boundingBox()]);
  expect(Math.abs(target!.x - overlay!.x)).toBeLessThanOrEqual(2);
  expect(await page.evaluate(() => window[Symbol.for("reframe.browser-client")].selection.width)).toBe(450);
});

test("P5-06 repositions overlay and controls through nested scroll and viewport edges", async ({ page }) => {
  const url = await start();
  await ready(page, url);
  await page.locator(".scroll").evaluate((element) => { element.scrollLeft = 500; element.scrollTop = 300; });
  await selectElement(page, "#edge");
  await page.locator(".scroll").evaluate((element) => { element.scrollLeft = 560; element.scrollTop = 320; element.dispatchEvent(new Event("scroll", { bubbles: true })); });
  await expect.poll(async () => (await page.locator("#reframe-root [data-reframe-panel]").boundingBox())?.x ?? -1).toBeGreaterThanOrEqual(0);
  const panel = await page.locator("#reframe-root [data-reframe-panel]").boundingBox();
  expect(panel!.x + panel!.width).toBeLessThanOrEqual(await page.evaluate(() => innerWidth));
});

test("P5-07 rejects unsupported, hidden, zero-area, canvas, iframe, and Reframe targets without replacing selection", async ({ page }) => {
  const url = await start();
  await ready(page, url);
  await selectElement(page, "#card-annual");
  const original = await page.evaluate(() => window[Symbol.for("reframe.browser-client")].selection.selectionId);
  for (const selector of ["script", "style", "#hidden", "#zero", "#canvas", "#frame"]) {
    await page.locator(selector).evaluate((element) => element.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true })));
    expect(await page.evaluate(() => window[Symbol.for("reframe.browser-client")].selection.selectionId)).toBe(original);
  }
  await page.locator("#reframe-root .brand").evaluate((element) => element.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true })));
  expect(await page.evaluate(() => window[Symbol.for("reframe.browser-client")].selection.selectionId)).toBe(original);
  expect(accepted).toHaveLength(0);
});

test("P5-08 invalid devtools widths leave the DOM and accepted proposal state unchanged", async ({ page }) => {
  const url = await start();
  await ready(page, url);
  await selectElement(page, "#card-annual");
  const before = await page.locator("#card-annual").evaluate((element) => element.getBoundingClientRect().width);
  for (const value of [Number.NaN, Number.POSITIVE_INFINITY]) expect(await page.evaluate((width) => window[Symbol.for("reframe.browser-client")].previewWidth(width), value)).toBe(false);
  expect(await page.locator("#card-annual").evaluate((element) => element.getBoundingClientRect().width)).toBe(before);
  expect(accepted).toHaveLength(0);
});

test("P5-09 removing the selected node during drag cancels safely and leaves the page usable", async ({ page }) => {
  const url = await start();
  await ready(page, url);
  await selectElement(page, "#card-annual");
  const box = await page.locator("#reframe-root [data-reframe-handle]").boundingBox();
  await page.mouse.move(box!.x + 5, box!.y + 5);
  await page.mouse.down();
  await page.locator("#card-annual").evaluate((element) => element.remove());
  await page.mouse.up();
  await expect(page.locator("#reframe-root [data-reframe-selected]")).toBeHidden();
  await page.locator("#reframe-root [data-reframe-select]").click();
  await page.locator("#native-button").click();
  await expect(page.locator("#native-button")).toHaveAttribute("data-clicked", "yes");
});

test("P5-10 HMR replacement and route change invalidate generations and require reselection", async ({ page }) => {
  const url = await start();
  await ready(page, url);
  await selectElement(page, "#card-annual");
  const generation = await page.evaluate(() => window[Symbol.for("reframe.browser-client")].selection.generation);
  await page.locator("#card-annual").evaluate((element) => element.replaceWith(element.cloneNode(true)));
  await expect.poll(() => page.evaluate(() => window[Symbol.for("reframe.browser-client")].selection)).toBeNull();
  await selectElement(page, "#card-annual");
  const hmrGeneration = await page.evaluate(() => window[Symbol.for("reframe.browser-client")].selection.generation);
  await page.evaluate(() => history.pushState({}, "", "/next"));
  await expect.poll(() => page.evaluate(() => window[Symbol.for("reframe.browser-client")].selection)).toBeNull();
  await expect(page.locator("#reframe-root [data-reframe-diagnostic]")).toContainText("Route changed");
  expect(hmrGeneration).toBeGreaterThan(generation);
  expect(await page.evaluate(() => window[Symbol.for("reframe.browser-client")].generation)).toBeGreaterThan(hmrGeneration);
});

test("P5-11 cancellation restores only width and preserves unrelated inline application changes", async ({ page }) => {
  const url = await start();
  await ready(page, url);
  await selectElement(page, "#card-annual");
  await page.evaluate(() => window[Symbol.for("reframe.browser-client")].previewWidth(420));
  await page.locator("#card-annual").evaluate((element: HTMLElement) => element.style.backgroundColor = "rgb(1, 2, 3)");
  await page.locator("#reframe-root [data-reframe-cancel]").click();
  await expect(page.locator("#card-annual")).toHaveCSS("width", "320px");
  await expect(page.locator("#card-annual")).toHaveCSS("background-color", "rgb(1, 2, 3)");
});

test("P5-12 disconnect labels the preview temporary, disables Apply, and reconnect does not replay it", async ({ page }) => {
  const url = await start();
  await ready(page, url);
  await selectElement(page, "#card-annual");
  await page.evaluate(() => window[Symbol.for("reframe.browser-client")].previewWidth(420));
  proxy!.setConnectionsAvailable(false);
  await expect(page.locator("#reframe-root")).toHaveAttribute("data-reframe-state", "disconnected", { timeout: 5_000 });
  await expect(page.locator("#reframe-root [data-reframe-panel]")).toContainText("Temporary");
  await expect(page.locator("#reframe-root [data-reframe-apply]")).toBeDisabled();
  await page.locator("#reframe-root [data-reframe-apply]").dispatchEvent("click");
  expect(accepted).toHaveLength(0);
  proxy!.setConnectionsAvailable(true);
  await expect(page.locator("#reframe-root")).toHaveAttribute("data-reframe-state", "connected", { timeout: 5_000 });
  expect(accepted).toHaveLength(0);
});

test("P5-13 Select off preserves native links, inputs, buttons, menus, and scrolling", async ({ page }) => {
  const url = await start();
  await ready(page, url);
  await page.locator("#native-input").fill("normal input");
  await page.locator("#native-menu").selectOption("two");
  await page.locator("#native-button").click();
  await page.locator("#native-link").click();
  await page.evaluate(() => scrollTo(0, 300));
  await expect(page.locator("#native-input")).toHaveValue("normal input");
  await expect(page.locator("#native-menu")).toHaveValue("two");
  await expect(page.locator("#native-button")).toHaveAttribute("data-clicked", "yes");
  expect(page.url()).toContain("#linked");
  expect(await page.evaluate(() => scrollY)).toBeGreaterThan(0);
});

test("P5-14 hard refresh discards the active preview with no saved marker", async ({ page }) => {
  const url = await start();
  await ready(page, url);
  await selectElement(page, "#card-annual");
  await page.evaluate(() => window[Symbol.for("reframe.browser-client")].previewWidth(420));
  await expect(page.locator("#card-annual")).toHaveCSS("width", "420px");
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator("#card-annual")).toHaveCSS("width", "320px");
  expect(await page.locator("[data-reframe-saved]").count()).toBe(0);
});

test("P5-15 Chromium hover, select, resize, and cancel behavior is equivalent baseline", async ({ page, browserName }) => {
  const url = await start();
  await ready(page, url);
  await page.locator("#reframe-root [data-reframe-select]").click();
  await page.locator("#card-annual").hover();
  await expect(page.locator("#reframe-root [data-reframe-hover]")).toBeVisible();
  await page.locator("#card-annual").click();
  await dragWidth(page, 50);
  await page.keyboard.press("Escape");
  await expect(page.locator("#card-annual")).toHaveCSS("width", "320px");
  expect(["chromium", "firefox", "webkit"]).toContain(browserName);
});

test("P5-17 toolbar offset and vertical resize handle are available during selection", async ({ page }) => {
  const url = await start();
  await ready(page, url);
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).paddingTop)).toBe("0px");
  await selectElement(page, "#card-annual");
  await expect(page.locator("#reframe-root [data-reframe-context]")).toBeVisible();
  await expect(page.locator("#reframe-root [data-reframe-handle-height]")).toBeVisible();
  const box = await page.locator("#reframe-root [data-reframe-handle-height]").boundingBox();
  if (!box) throw new Error("height resize handle is not visible");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 40, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator("#reframe-root [data-reframe-height]")).toContainText("→");
});

declare global {
  interface Window { [key: symbol]: any }
}
