import { BROWSER_CLIENT_SOURCE } from "../../packages/browser-client/src/index.js";
import { createProjectProxy } from "../../packages/dev-server/src/proxy.js";
import { createServer } from "node:http";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";

function percentile(values: number[], fraction: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * fraction) - 1] ?? 0;
}

async function measure(url: string): Promise<number> {
  const started = performance.now();
  const response = await fetch(url, { headers: { Accept: "text/html", "Sec-Fetch-Dest": "document" } });
  expect(response.status).toBe(200);
  await response.arrayBuffer();
  return performance.now() - started;
}

describe("Phase 3 proxy performance", () => {
  it("P3-14 records direct/proxy navigation p50/p95 overhead and gzipped browser-client payload", async () => {
    const upstream = createServer((_request, response) => response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end("<!doctype html><body><main>performance</main></body>"));
    await new Promise<void>((resolve, reject) => {
      upstream.once("error", reject);
      upstream.listen(0, "127.0.0.1", () => { upstream.off("error", reject); resolve(); });
    });
    const address = upstream.address();
    if (!address || typeof address === "string") throw new Error("upstream has no address");
    const directUrl = `http://127.0.0.1:${address.port}/`;
    const proxy = createProjectProxy(directUrl);
    const proxyUrl = (await proxy.listen()).url;
    const direct: number[] = [];
    const proxied: number[] = [];
    try {
      await measure(directUrl);
      await measure(proxyUrl);
      for (let sample = 0; sample < 50; sample += 1) {
        if (sample % 2 === 0) {
          direct.push(await measure(directUrl));
          proxied.push(await measure(proxyUrl));
        } else {
          proxied.push(await measure(proxyUrl));
          direct.push(await measure(directUrl));
        }
      }
      const metrics = {
        samples: direct.length,
        directP50Ms: Number(percentile(direct, 0.5).toFixed(2)),
        directP95Ms: Number(percentile(direct, 0.95).toFixed(2)),
        proxyP50Ms: Number(percentile(proxied, 0.5).toFixed(2)),
        proxyP95Ms: Number(percentile(proxied, 0.95).toFixed(2)),
        overheadP50Ms: Number((percentile(proxied, 0.5) - percentile(direct, 0.5)).toFixed(2)),
        overheadP95Ms: Number((percentile(proxied, 0.95) - percentile(direct, 0.95)).toFixed(2)),
        clientGzipBytes: gzipSync(BROWSER_CLIENT_SOURCE).byteLength,
        overheadBudgetMs: 100,
        clientBudgetBytes: 50 * 1024,
        gate: "observability-only",
        platform: `${process.platform}-${process.arch}`,
        node: process.versions.node,
      };
      process.stdout.write(`P3-14_METRICS ${JSON.stringify(metrics)}\n`);
      expect(metrics.samples).toBe(50);
      expect(metrics.clientGzipBytes).toBeGreaterThan(0);
    } finally {
      await proxy.close();
      upstream.closeAllConnections();
      await new Promise<void>((resolve) => upstream.close(() => resolve()));
    }
  });
});
