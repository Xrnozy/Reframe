import { appendFile, cp, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import os from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { createProjectProxy, type ProjectProxy } from "../../packages/dev-server/src/proxy.js";
import { snapshotTree } from "../helpers/file-snapshot.js";
import { projectRoot, viteBin } from "../helpers/paths.js";
import { reservePort } from "../helpers/port-probe.js";
import { startManagedProcess, type ManagedProcess } from "../helpers/process-harness.js";

let root = "";
let vanillaRoot = "";
let reactRoot = "";
let vanillaServer: ManagedProcess;
let reactServer: ManagedProcess;
let vanillaProxy: ProjectProxy;
let reactProxy: ProjectProxy;
let vanillaUpstream = "";
let reactUpstream = "";
let vanillaUrl = "";
let reactUrl = "";
let vanillaSnapshot: Awaited<ReturnType<typeof snapshotTree>>;
let reactSnapshot: Awaited<ReturnType<typeof snapshotTree>>;

async function createCopy(name: string): Promise<string> {
  const destination = path.join(root, name);
  await cp(path.join(projectRoot, "demo", name), destination, { recursive: true });
  await symlink(path.join(projectRoot, "node_modules"), path.join(destination, "node_modules"), "junction");
  await writeFile(path.join(destination, "phase3.vite.config.mjs"), `import react from "@vitejs/plugin-react";\nexport default { plugins: [react()], cacheDir: ${JSON.stringify(path.join(root, `${name}-vite-cache`))} };\n`);
  return await realpath(destination);
}

async function startDemo(demoRoot: string, port: number): Promise<ManagedProcess> {
  return startManagedProcess({
    executable: process.execPath,
    args: [viteBin, "--config", path.join(demoRoot, "phase3.vite.config.mjs"), "--configLoader", "runner", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
    cwd: demoRoot,
    readyUrl: `http://127.0.0.1:${port}/`,
    port,
  });
}

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => { server.off("error", reject); resolve(); });
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("server has no address");
  return `http://127.0.0.1:${address.port}/`;
}

test.beforeAll(async () => {
  root = await realpath(await mkdtemp(path.join(os.tmpdir(), "reframe phase3 e2e ü ")));
  vanillaRoot = await createCopy("vanilla-demo");
  reactRoot = await createCopy("react-demo");
  await appendFile(path.join(vanillaRoot, "style.css"), "\n* { text-rendering: geometricPrecision !important; }\nbutton { letter-spacing: 0 !important; }\n#reframe-root { display: none !important; }\n");
  vanillaSnapshot = await snapshotTree(vanillaRoot);
  reactSnapshot = await snapshotTree(reactRoot);
  const vanillaPort = await reservePort();
  const reactPort = await reservePort();
  await Promise.all([vanillaPort.release(), reactPort.release()]);
  vanillaUpstream = `http://127.0.0.1:${vanillaPort.port}/`;
  reactUpstream = `http://127.0.0.1:${reactPort.port}/`;
  try {
    vanillaServer = await startDemo(vanillaRoot, vanillaPort.port);
    reactServer = await startDemo(reactRoot, reactPort.port);
    vanillaProxy = createProjectProxy(vanillaUpstream);
    reactProxy = createProjectProxy(reactUpstream);
    vanillaUrl = (await vanillaProxy.listen()).url;
    reactUrl = (await reactProxy.listen()).url;
  } catch (error) {
    await vanillaServer?.stop();
    await reactServer?.stop();
    throw error;
  }
});

test.afterAll(async () => {
  await Promise.all([vanillaProxy?.close(), reactProxy?.close()]);
  await Promise.all([vanillaServer?.stop(), reactServer?.stop()]);
  expect(await snapshotTree(vanillaRoot)).toEqual(vanillaSnapshot);
  expect(await snapshotTree(reactRoot)).toEqual(reactSnapshot);
  await rm(root, { recursive: true, force: true, maxRetries: 30, retryDelay: 50 });
});

test("P3-01 renders exactly one toolbar on the real Vanilla page without changing project files", async ({ page }) => {
  await page.goto(vanillaUrl, { waitUntil: "networkidle" });
  await expect(page.locator("#reframe-root")).toHaveCount(1);
  await expect(page.locator("#reframe-root [role=toolbar]")).toContainText("Reframe");
  await expect(page.locator("#reframe-root [role=status]")).toHaveText("Connected");
  await expect(page.locator("#site-header")).toBeVisible();
  await expect(page.locator("#primary-cta")).toBeEnabled();
  expect(await snapshotTree(vanillaRoot)).toEqual(vanillaSnapshot);
});

test("P3-02 preserves real React/Vite HMR and one toolbar after an external component edit", async ({ page }) => {
  const file = path.join(reactRoot, "src", "PricingCard.jsx");
  const original = await readFile(file, "utf8");
  await page.goto(reactUrl, { waitUntil: "networkidle" });
  try {
    await writeFile(file, original.replace("<h2>{name}</h2>", "<h2>{name} HMR</h2>"));
    await expect(page.locator("#card-annual h2")).toHaveText("Annual HMR", { timeout: 10_000 });
    await expect(page.locator("#reframe-root")).toHaveCount(1);
  } finally {
    await writeFile(file, original);
  }
  expect(await snapshotTree(reactRoot)).toEqual(reactSnapshot);
});

test("P3-04 keeps one toolbar through SPA history, back/forward, and repeated refresh, with Exit still functional", async ({ page }) => {
  await page.goto(reactUrl, { waitUntil: "networkidle" });
  await page.evaluate(() => { history.pushState({}, "", "/route-a"); history.pushState({}, "", "/route-b"); });
  await page.goBack();
  await page.goForward();
  for (let index = 0; index < 3; index += 1) {
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.locator("#reframe-root")).toHaveCount(1);
  }
  await page.locator("#reframe-root [data-reframe-exit]").click();
  await expect(page.locator("#reframe-root")).toHaveCount(0);
});

test("P3-05 isolates toolbar dimensions, colors, roles, and controls from aggressive project CSS", async ({ page }) => {
  await page.goto(vanillaUrl, { waitUntil: "networkidle" });
  const result = await page.locator("#reframe-root [role=toolbar]").evaluate((toolbar) => {
    const style = getComputedStyle(toolbar);
    const exit = toolbar.querySelector("[data-reframe-exit]");
    return { height: toolbar.getBoundingClientRect().height, background: style.backgroundColor, color: style.color, exitDisplay: exit ? getComputedStyle(exit).display : "missing" };
  });
  expect(result.height).toBe(44);
  expect(result.background).toBe("rgb(17, 24, 39)");
  expect(result.color).toBe("rgb(249, 250, 251)");
  expect(result.exitDisplay).not.toBe("none");
  await expect(page.locator("#reframe-root [role=toolbar]")).toHaveAttribute("aria-label", "Reframe");
});

test("P3-06 leaves application computed styles unchanged and exposes no Reframe style element outside its shadow root", async ({ page, context }) => {
  const direct = await context.newPage();
  await Promise.all([page.goto(vanillaUrl, { waitUntil: "networkidle" }), direct.goto(vanillaUpstream, { waitUntil: "networkidle" })]);
  const selector = "#primary-cta";
  const properties = async (target: typeof page) => target.locator(selector).evaluate((element) => {
    const style = getComputedStyle(element);
    return { display: style.display, padding: style.padding, background: style.backgroundColor, font: style.font, rect: element.getBoundingClientRect().toJSON() };
  });
  expect(await properties(page)).toEqual(await properties(direct));
  expect(await page.locator("style[data-reframe], link[data-reframe]").count()).toBe(0);
  await direct.close();
});

test("P3-09 does not inject upstream directly and blocks a copied bootstrap from an unrelated origin", async ({ page }) => {
  await page.goto(vanillaUpstream, { waitUntil: "networkidle" });
  await expect(page.locator("#reframe-root")).toHaveCount(0);

  const unrelated = createServer((_request, response) => {
    const script = `<script data-reframe-session="${vanillaProxy.session}" data-reframe-proxy-origin="${new URL(vanillaUrl).origin}" src="${new URL(vanillaProxy.clientPath, vanillaUrl)}" defer></script>`;
    response.writeHead(200, { "Content-Type": "text/html" }).end(`<body>unrelated${script}</body>`);
  });
  const unrelatedUrl = await listen(unrelated);
  try {
    await page.goto(unrelatedUrl, { waitUntil: "networkidle" });
    await expect(page.locator("#reframe-root")).toHaveCount(0);
  } finally {
    unrelated.closeAllConnections();
    await new Promise<void>((resolve) => unrelated.close(() => resolve()));
  }
});

test("P3-12 fully tears down after scroll, route change, and HMR without changing normal page behavior", async ({ page }) => {
  const file = path.join(reactRoot, "src", "PricingCard.jsx");
  const original = await readFile(file, "utf8");
  await page.goto(reactUrl, { waitUntil: "networkidle" });
  try {
    await page.evaluate(() => { scrollTo(0, document.body.scrollHeight); history.pushState({}, "", "/after-scroll"); });
    await writeFile(file, original.replace("<h2>{name}</h2>", "<h2>{name} teardown</h2>"));
    await expect(page.locator("#card-annual h2")).toHaveText("Annual teardown", { timeout: 10_000 });
    await page.locator("#reframe-root [data-reframe-exit]").click();
    await expect(page.locator("#reframe-root")).toHaveCount(0);
    expect(await page.evaluate(() => ({ client: window[Symbol.for("reframe.browser-client")], offset: document.documentElement.style.cssText, roots: document.querySelectorAll("[data-reframe-root]").length }))).toEqual({ client: undefined, offset: "", roots: 0 });
    await expect(page.locator("#primary-cta")).toBeEnabled();
  } finally {
    await writeFile(file, original);
  }
});

test("P3-13 runs the proxy/browser-client smoke on Windows real Chrome; Unix and nightly browsers remain separately gated", async ({ browser }) => {
  expect(process.platform).toBe("win32");
  for (const url of [vanillaUrl, reactUrl]) {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle" });
    await expect(page.locator("#reframe-root")).toHaveCount(1);
    await page.locator("#reframe-root [data-reframe-exit]").click();
    await expect(page.locator("#reframe-root")).toHaveCount(0);
    await page.close();
  }
});

test("SUP-P3-02 renders the isolated toolbar under a default-src self CSP without inline-style permission", async ({ page }) => {
  const upstream = createServer((_request, response) => response.writeHead(200, {
    "Content-Security-Policy": "default-src 'self'",
    "Content-Type": "text/html; charset=utf-8",
  }).end("<!doctype html><body><main>CSP project</main></body>"));
  const upstreamUrl = await listen(upstream);
  const proxy = createProjectProxy(upstreamUrl);
  const proxyUrl = (await proxy.listen()).url;
  try {
    await page.goto(proxyUrl, { waitUntil: "networkidle" });
    await expect(page.locator("#reframe-root [role=toolbar]")).toBeVisible();
    await expect(page.locator("#reframe-root [role=toolbar]")).toHaveCSS("height", "44px");
  } finally {
    await proxy.close();
    upstream.closeAllConnections();
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  }
});

test("SUP-P3-03 renders one toolbar on React plain-CSS, CSS-Modules, and Tailwind fixture projects", async ({ page }) => {
  for (const fixture of ["react-plain-css", "react-css-modules", "react-tailwind"]) {
    const fixtureRoot = path.join(root, `matrix-${fixture}`);
    await cp(path.join(projectRoot, "tests", "fixtures", "templates", fixture), fixtureRoot, { recursive: true });
    await symlink(path.join(projectRoot, "node_modules"), path.join(fixtureRoot, "node_modules"), "junction");
    await writeFile(path.join(fixtureRoot, "phase3.vite.config.mjs"), `import react from "@vitejs/plugin-react";\nexport default { plugins: [react()], cacheDir: ${JSON.stringify(path.join(root, `${fixture}-vite-cache`))} };\n`);
    const before = await snapshotTree(fixtureRoot);
    const reservation = await reservePort();
    const port = reservation.port;
    await reservation.release();
    const server = await startDemo(fixtureRoot, port);
    const proxy = createProjectProxy(`http://127.0.0.1:${port}/`);
    const url = (await proxy.listen()).url;
    try {
      await page.goto(url, { waitUntil: "networkidle" });
      await expect(page.locator("#reframe-root")).toHaveCount(1);
    } finally {
      await proxy.close();
      await server.stop();
    }
    expect(await snapshotTree(fixtureRoot)).toEqual(before);
  }
});
