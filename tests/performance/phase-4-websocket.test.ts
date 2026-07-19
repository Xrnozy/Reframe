import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, describe, expect, it } from "vitest";
import { createProjectProxy, type ProjectProxy } from "../../packages/dev-server/src/index.js";
import { rawWebSocketHandshake, type RawWebSocketClient } from "../helpers/raw-websocket.js";

const SESSION = "phase4_performance_session";
const TOKEN = "phase4_performance_token_0123456789_ABC";
const PROJECT = "phase4_performance_project";
let proxy: ProjectProxy;
let upstream = createServer();
let client: RawWebSocketClient | undefined;

function percentile(values: readonly number[], quantile: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1)]!;
}

function base(type: string, correlationId: string, extra: Record<string, unknown> = {}) {
  return { type, protocol: 1, correlationId, sessionId: SESSION, ...extra };
}

afterEach(async () => {
  client?.close();
  await proxy?.close();
  upstream.closeAllConnections();
  if (upstream.listening) await new Promise<void>((resolve) => upstream.close(() => resolve()));
  client = undefined;
});

describe("Phase 4 performance observations", () => {
  it("P4-14 records 1,000 sequential ping/pongs and preview-burst memory/control responsiveness", async () => {
    upstream = createServer((_request, response) => response.writeHead(200, { "Content-Type": "text/html" }).end("<body>performance</body>"));
    await new Promise<void>((resolve, reject) => {
      upstream.once("error", reject);
      upstream.listen(0, "127.0.0.1", () => { upstream.off("error", reject); resolve(); });
    });
    const upstreamAddress = upstream.address();
    if (!upstreamAddress || typeof upstreamAddress === "string") throw new Error("upstream has no address");
    proxy = createProjectProxy(`http://127.0.0.1:${upstreamAddress.port}`, {
      session: SESSION,
      connectionToken: TOKEN,
      heartbeatIntervalMs: 60_000,
      project: { id: PROJECT, name: "Performance fixture", framework: "vanilla", capabilities: { canExplore: true, canWriteSource: true } },
    });
    const address = await proxy.listen();
    const origin = new URL(address.url).origin;
    const result = await rawWebSocketHandshake(`${origin.replace("http", "ws")}${proxy.webSocketPath}`, {
      origin,
      protocols: ["reframe.v1", `reframe.token.${TOKEN}`, `reframe.session.${SESSION}`, `reframe.project.${PROJECT}`],
    });
    expect(result.status).toBe(101);
    client = result.client!;
    client.sendJson(base("client:ready", "ready_perf", { projectId: PROJECT, url: origin, route: "/", viewport: { width: 1280, height: 720 } }));
    expect(await client.nextJson()).toMatchObject({ type: "server:ready", correlationId: "ready_perf" });

    client.sendJson(base("ping", "warmup"));
    await client.nextJson();
    const samples: number[] = [];
    for (let index = 0; index < 1_000; index += 1) {
      const correlationId = `ping_${index}`;
      const started = performance.now();
      client.sendJson(base("ping", correlationId));
      expect(await client.nextJson()).toMatchObject({ type: "pong", correlationId });
      samples.push(performance.now() - started);
    }

    const previewCount = 10_000;
    const before = process.memoryUsage().heapUsed;
    await client.sendMany(Array.from({ length: previewCount }, (_, index) => base("preview:changed", `preview_${index}`, { selectionId: "selection_1", proposalId: `proposal_${index}`, generation: 1, width: 420 })));
    const controlStarted = performance.now();
    client.sendJson(base("ping", "control_after_burst"));
    expect(await client.nextJson(5_000)).toMatchObject({ type: "pong", correlationId: "control_after_burst" });
    const controlLatencyMs = performance.now() - controlStarted;
    const after = process.memoryUsage().heapUsed;
    await delay(100);
    const settled = process.memoryUsage().heapUsed;
    const output = {
      environment: `${process.platform}-${process.arch} node-${process.versions.node}`,
      samples: samples.length,
      p50Ms: Number(percentile(samples, 0.5).toFixed(3)),
      p95Ms: Number(percentile(samples, 0.95).toFixed(3)),
      previewCount,
      heapBeforeBytes: before,
      heapAfterBytes: after,
      heapSettledBytes: settled,
      controlLatencyMs: Number(controlLatencyMs.toFixed(3)),
      rateLimitedMessages: proxy.connectionDiagnostics().rateLimitedMessages,
    };
    process.stdout.write(`PHASE4_PERFORMANCE ${JSON.stringify(output)}\n`);
    expect(samples).toHaveLength(1_000);
    expect(Number.isFinite(output.p95Ms)).toBe(true);
    expect(output.rateLimitedMessages).toBeGreaterThanOrEqual(9_900);
    expect(controlLatencyMs).toBeLessThan(5_000);
  }, 30_000);
});

