import { createServer, type Server } from "node:http";
import { expect, test } from "@playwright/test";
import { createProjectProxy, type ProjectProxy } from "../../packages/dev-server/src/index.js";

let upstream: Server;
let proxy: ProjectProxy;

test.afterEach(async () => {
  await proxy?.close();
  upstream?.closeAllConnections();
  if (upstream?.listening) await new Promise<void>((resolve) => upstream.close(() => resolve()));
});

test("P5-16 measures 2,000-node selection and a five-second drag without long tasks or unbounded messages", async ({ page }) => {
  const nodes = Array.from({ length: 2_000 }, (_, index) => `<button class="node" id="node-${index}">${index}</button>`).join("");
  upstream = createServer((_request, response) => response.writeHead(200, { "Content-Type": "text/html" }).end(`<!doctype html><style>*{box-sizing:border-box}body{margin:0;padding:60px 8px}.node{width:36px;height:24px;padding:0}.target{width:320px;height:80px}</style>${nodes}<article id="target" class="target">Drag target</article>`));
  await new Promise<void>((resolve, reject) => { upstream.once("error", reject); upstream.listen(0, "127.0.0.1", resolve); });
  const address = upstream.address();
  if (!address || typeof address === "string") throw new Error("upstream has no address");
  proxy = createProjectProxy(`http://127.0.0.1:${address.port}`, {
    session: "phase5_performance_session",
    connectionToken: "phase5_performance_token_0123456789_ABC",
    heartbeatIntervalMs: 1_000,
    heartbeatTimeoutMs: 2_500,
    project: { id: "phase5_performance_project", name: "Performance fixture", framework: "vanilla", capabilities: { canExplore: true, canWriteSource: false } },
  });
  const url = (await proxy.listen()).url;
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await expect(page.locator("#reframe-root")).toHaveAttribute("data-reframe-state", "connected", { timeout: 5_000 });
  await page.evaluate(() => {
    (window as any).__phase5LongTasks = [];
    if (typeof PerformanceObserver !== "undefined") new PerformanceObserver((list) => (window as any).__phase5LongTasks.push(...list.getEntries().map((entry) => entry.duration))).observe({ type: "longtask", buffered: false });
  });
  await page.locator('#reframe-root [data-reframe-tool="select"]').click();
  for (let index = 1_900; index < 2_000; index += 1) await page.locator(`#node-${index}`).hover();
  await page.locator("#target").click();
  const handle = await page.locator("#reframe-root [data-reframe-handle]").boundingBox();
  if (!handle) throw new Error("resize handle unavailable");
  const x = handle.x + handle.width / 2;
  const y = handle.y + handle.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  const beforeMessages = proxy.connectionDiagnostics().routedByType["preview:changed"] ?? 0;
  const dragStarted = Date.now();
  let index = 0;
  while (Date.now() - dragStarted < 5_000) {
    await page.mouse.move(x + Math.sin(index / 12) * 80, y);
    index += 1;
  }
  await page.mouse.up();
  const dragMs = Date.now() - dragStarted;
  const result = await page.evaluate(() => {
    const metrics = window[Symbol.for("reframe.browser-client")].performanceMetrics as { hover: number[]; preview: number[] };
    const percentile = (values: number[], ratio: number) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * ratio))] ?? 0;
    const combined = [...metrics.hover, ...metrics.preview];
    return { samples: combined.length, p50: percentile(combined, .5), p95: percentile(combined, .95), max: Math.max(0, ...combined), longTasks: (window as any).__phase5LongTasks as number[] };
  });
  const previewMessages = (proxy.connectionDiagnostics().routedByType["preview:changed"] ?? 0) - beforeMessages;
  console.log(`P5-16 ${JSON.stringify({ ...result, previewMessages, nodeCount: 2_000, dragMs, pointerMoves: index })}`);
  expect(result.samples).toBeGreaterThan(100);
  expect(result.longTasks.filter((duration) => duration > 50)).toEqual([]);
  expect(previewMessages).toBeLessThanOrEqual(60);
});

declare global { interface Window { [key: symbol]: any } }
