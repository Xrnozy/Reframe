import { createServer, type Server } from "node:http";
import { expect, test, type Page } from "@playwright/test";
import { createProjectProxy, type ProjectProxy, type ProjectProxyOptions } from "../../packages/dev-server/src/index.js";

let upstream: Server;
let proxy: ProjectProxy;

async function start(options: ProjectProxyOptions = {}): Promise<string> {
  upstream = createServer((_request, response) => response.writeHead(200, { "Content-Type": "text/html" }).end(`<!doctype html><body><button id="app-button" style="margin-top:60px" onclick="this.dataset.clicked='yes'">App control</button></body>`));
  await new Promise<void>((resolve, reject) => {
    upstream.once("error", reject);
    upstream.listen(0, "127.0.0.1", () => { upstream.off("error", reject); resolve(); });
  });
  const address = upstream.address();
  if (!address || typeof address === "string") throw new Error("upstream has no address");
  proxy = createProjectProxy(`http://127.0.0.1:${address.port}`, {
    session: "phase4_browser_session",
    connectionToken: "phase4_browser_token_0123456789_ABCDEFG",
    heartbeatIntervalMs: 100,
    heartbeatTimeoutMs: 300,
    reconnectBaseMs: 20,
    reconnectMaxMs: 80,
    project: { id: "phase4_browser_project", name: "Browser fixture", framework: "vanilla", capabilities: { canExplore: true, canWriteSource: true } },
    ...options,
  });
  return (await proxy.listen()).url;
}

async function connected(page: Page): Promise<void> {
  await expect(page.locator("#reframe-root")).toHaveAttribute("data-reframe-state", "connected", { timeout: 5_000 });
  await expect(page.locator("#reframe-root [role=status]")).toContainText("Connected");
}

async function recordStates(page: Page): Promise<void> {
  await page.evaluate(() => {
    const host = document.querySelector("#reframe-root");
    window.__reframePhase4States = [host?.getAttribute("data-reframe-state")];
    new MutationObserver(() => window.__reframePhase4States.push(host?.getAttribute("data-reframe-state"))).observe(host!, { attributes: true, attributeFilter: ["data-reframe-state"] });
  });
}

test.afterEach(async () => {
  await proxy?.close();
  upstream?.closeAllConnections();
  if (upstream?.listening) await new Promise<void>((resolve) => upstream.close(() => resolve()));
});

test("P4-01 automatically exchanges ready and matching ping/pong, and Test Connection reports Connected", async ({ page }) => {
  const url = await start();
  await page.goto(`${url}?reframeDebug=1`, { waitUntil: "networkidle" });
  await connected(page);
  await page.locator("#reframe-root [data-reframe-test]").click();
  await expect(page.locator("#reframe-root [data-reframe-diagnostic]")).toHaveText(/^Pong test_[a-f0-9]{32}$/);
  await connected(page);
  expect(proxy.connectionDiagnostics().routedByType).toMatchObject({ "client:ready": 1, ping: expect.any(Number), pong: expect.any(Number) });
});

test("P4-02 refreshes ten times with one active socket, closed old sockets/timers, and automatic recovery", async ({ page }) => {
  const url = await start();
  await page.goto(url, { waitUntil: "networkidle" });
  await connected(page);
  for (let index = 0; index < 10; index += 1) {
    await page.reload({ waitUntil: "networkidle" });
    await connected(page);
    await expect.poll(() => proxy.connectionDiagnostics().activeConnections).toBe(1);
  }
  expect(proxy.connectionDiagnostics().acceptedConnections).toBe(11);
  expect(proxy.connectionDiagnostics().closedConnections).toBeGreaterThanOrEqual(10);
});

test("P4-03 reconnects with bounded backoff when the browser starts before the endpoint", async ({ page }) => {
  const url = await start({ connectionsInitiallyAvailable: false });
  await page.goto(url, { waitUntil: "networkidle" });
  await expect.poll(() => page.locator("#reframe-root").getAttribute("data-reframe-state")).not.toBe("connected");
  await page.waitForTimeout(900);
  await expect(page.locator("#reframe-root")).not.toHaveAttribute("data-reframe-state", "connected");
  proxy.setConnectionsAvailable(true);
  await connected(page);
  expect(proxy.connectionDiagnostics().acceptedConnections).toBe(1);
  expect(page.url()).toBe(url);
});

test("P4-04 gives two tabs independent connection IDs and does not share selection state", async ({ context }) => {
  const url = await start({ heartbeatIntervalMs: 60_000, heartbeatTimeoutMs: 120_000 });
  const first = await context.newPage();
  const second = await context.newPage();
  await Promise.all([first.goto(url, { waitUntil: "networkidle" }), second.goto(url, { waitUntil: "networkidle" })]);
  await Promise.all([connected(first), connected(second)]);
  const [firstId, secondId] = await Promise.all([first.evaluate(() => window[Symbol.for("reframe.browser-client")].connectionId), second.evaluate(() => window[Symbol.for("reframe.browser-client")].connectionId)]);
  expect(firstId).not.toBe(secondId);
  const before = proxy.connectionDiagnostics().routedByConnection;
  await first.evaluate(() => {
    const client = window[Symbol.for("reframe.browser-client")];
    client.socket.send(JSON.stringify({ type: "selection:changed", protocol: 1, correlationId: "tab1_selection", sessionId: client.session, selectionId: "card_1", generation: 1 }));
  });
  await expect.poll(() => proxy.connectionDiagnostics().routedByConnection[firstId] ?? 0).toBe((before[firstId] ?? 0) + 1);
  expect(proxy.connectionDiagnostics().routedByConnection[secondId]).toBe(before[secondId]);
  await Promise.all([connected(first), connected(second)]);
});

test("P4-09 disconnects and reconnects without replaying a mutation while the page stays usable", async ({ page }) => {
  const url = await start();
  await page.goto(url, { waitUntil: "networkidle" });
  await connected(page);
  await recordStates(page);
  const beforeApply = proxy.connectionDiagnostics().routedByType["edit:apply"] ?? 0;
  proxy.setConnectionsAvailable(false);
  await expect.poll(() => page.evaluate(() => window.__reframePhase4States.includes("disconnected"))).toBe(true);
  await page.locator("#app-button").click();
  await expect(page.locator("#app-button")).toHaveAttribute("data-clicked", "yes");
  proxy.setConnectionsAvailable(true);
  await connected(page);
  expect(proxy.connectionDiagnostics().routedByType["edit:apply"] ?? 0).toBe(beforeApply);
  expect(proxy.connectionDiagnostics().acceptedConnections).toBeGreaterThanOrEqual(2);
});

test("P4-10 treats dropped pong frames as disconnected and recovers without stale Connected", async ({ page }) => {
  const url = await start();
  await page.goto(url, { waitUntil: "networkidle" });
  await connected(page);
  await recordStates(page);
  proxy.setConnectionPongEnabled(false);
  await expect.poll(() => page.evaluate(() => window.__reframePhase4States.includes("disconnected")), { timeout: 5_000 }).toBe(true);
  await expect(page.locator("#reframe-root")).not.toHaveAttribute("data-reframe-state", "connected");
  proxy.setConnectionPongEnabled(true);
  await connected(page);
});

declare global {
  interface Window {
    __reframePhase4States: Array<string | null | undefined>;
    [key: symbol]: any;
  }
}
