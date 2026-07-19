import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { REFRAME_MAX_MESSAGE_BYTES, REFRAME_PROTOCOL_NAME, REFRAME_PROTOCOL_VERSION } from "../../packages/shared/src/index.js";
import { createProjectProxy, isLoopbackAddress, type ProjectProxy } from "../../packages/dev-server/src/index.js";
import { projectRoot } from "../helpers/paths.js";
import { rawWebSocketHandshake, type RawHandshakeOptions, type RawWebSocketClient } from "../helpers/raw-websocket.js";

const SESSION = "phase4_session";
const TOKEN = "phase4_canary_token_0123456789_ABCDEFG";
const PROJECT = "phase4_project";
let upstream: Server;
let proxy: ProjectProxy;
let origin: string;
let wsUrl: string;
let logs: string[];
const clients: RawWebSocketClient[] = [];

function protocols(token = TOKEN, session = SESSION, project = PROJECT, version = REFRAME_PROTOCOL_NAME): string[] {
  return [version, `reframe.token.${token}`, `reframe.session.${session}`, `reframe.project.${project}`];
}

function message(type: string, correlationId: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { type, protocol: REFRAME_PROTOCOL_VERSION, correlationId, sessionId: SESSION, ...extra };
}

function ready(correlationId = "ready_1", targetOrigin = origin): Record<string, unknown> {
  return message("client:ready", correlationId, { projectId: PROJECT, url: `${targetOrigin}/route`, route: "/route", viewport: { width: 1280, height: 720 } });
}

async function handshake(options: RawHandshakeOptions = {}, target = wsUrl) {
  return rawWebSocketHandshake(target, { origin, protocols: protocols(), ...options });
}

async function connect(options: RawHandshakeOptions = {}, target = wsUrl): Promise<RawWebSocketClient> {
  const result = await handshake(options, target);
  expect(result.status).toBe(101);
  expect(result.headers["sec-websocket-protocol"]).toBe(REFRAME_PROTOCOL_NAME);
  expect(result.client).toBeDefined();
  clients.push(result.client!);
  return result.client!;
}

async function openReady(targetOrigin = origin, options: RawHandshakeOptions = {}, target = wsUrl): Promise<{ client: RawWebSocketClient; serverReady: Record<string, unknown> }> {
  const client = await connect(options, target);
  client.sendJson(ready("ready_1", targetOrigin));
  return { client, serverReady: await client.nextJson() };
}

beforeEach(async () => {
  logs = [];
  upstream = createServer((_request, response) => response.writeHead(200, { "Content-Type": "text/html" }).end("<!doctype html><body>Phase 4</body>"));
  await new Promise<void>((resolve, reject) => {
    upstream.once("error", reject);
    upstream.listen(0, "127.0.0.1", () => { upstream.off("error", reject); resolve(); });
  });
  const address = upstream.address();
  if (!address || typeof address === "string") throw new Error("upstream has no address");
  proxy = createProjectProxy(`http://127.0.0.1:${address.port}`, {
    session: SESSION,
    connectionToken: TOKEN,
    heartbeatIntervalMs: 60_000,
    project: { id: PROJECT, name: "Phase 4 fixture", framework: "vanilla", capabilities: { canExplore: true, canWriteSource: true } },
    logConnectionCode: (code) => logs.push(code),
  });
  const proxyAddress = await proxy.listen();
  origin = new URL(proxyAddress.url).origin;
  wsUrl = `${origin.replace("http", "ws")}${proxy.webSocketPath}`;
});

afterEach(async () => {
  for (const client of clients.splice(0)) client.close();
  await proxy.close();
  upstream.closeAllConnections();
  await new Promise<void>((resolve) => upstream.close(() => resolve()));
});

describe("Phase 4 strict WebSocket boundary", () => {
  it("P4-05 rejects malformed JSON, missing/wrong fields, unknown types, and wrong protocol before routing", async () => {
    const invalid: Array<{ body: string | Record<string, unknown>; reason: string }> = [
      { body: "{", reason: "MESSAGE_MALFORMED" },
      { body: message("client:ready", "missing_fields"), reason: "MESSAGE_SCHEMA_INVALID" },
      { body: { ...ready(), viewport: { width: "wide", height: 720 } }, reason: "MESSAGE_SCHEMA_INVALID" },
      { body: message("unknown:type", "unknown_1"), reason: "MESSAGE_UNKNOWN" },
      { body: { ...ready(), protocol: 999 }, reason: "PROTOCOL_VERSION_UNSUPPORTED" },
    ];
    for (const item of invalid) {
      const client = await connect();
      if (typeof item.body === "string") client.sendText(item.body); else client.sendJson(item.body);
      const error = await client.nextJson<{ code: string }>();
      const closed = await client.waitForClose();
      expect(error.code).toBe(item.reason);
      expect(closed.reason).toBe(item.reason);
    }
    expect(proxy.connectionDiagnostics().routedMessages).toBe(0);
    expect(proxy.connectionDiagnostics().rejectedMessages).toBe(invalid.length);
  });

  it("P4-06 rejects missing/invalid token, wrong origin/host/project without disclosing metadata", async () => {
    const attempts = [
      await handshake({ protocols: protocols("") }),
      await handshake({ protocols: protocols("invalid_token_0123456789_ABCDEFGHI") }),
      await handshake({ origin: "http://unrelated.example" }),
      await handshake({ host: "192.168.1.30:4400" }),
      await handshake({ protocols: protocols(TOKEN, SESSION, "wrong_project") }),
    ];
    for (const result of attempts) {
      expect(result.status).toBe(403);
      expect(result.body).not.toContain(TOKEN);
      expect(result.body).not.toContain("Phase 4 fixture");
      expect(result.body).not.toContain("vanilla");
      expect(result.client).toBeUndefined();
    }
    expect(proxy.connectionDiagnostics().acceptedConnections).toBe(0);
    expect(logs).toEqual(["AUTH_INVALID", "AUTH_INVALID", "ORIGIN_INVALID", "HOST_INVALID", "PROJECT_INVALID"]);
  });

  it("P4-07 rejects path-like strings before routing and the connection boundary has no filesystem import", async () => {
    const attacks = [
      { ...ready(), correlationId: "C:\\Users\\victim\\secret" },
      { ...ready(), projectId: "..\\outside" },
      { ...ready(), url: "file:///C:/Users/victim/secret" },
      { ...ready(), route: "/safe/../secret" },
      message("selection:changed", "selection_1", { selectionId: "/tmp/secret", generation: 1 }),
      message("edit:apply", "apply_1", { selectionId: "selection_1", proposalId: "../escape", generation: 1, width: 420 }),
    ];
    for (const attack of attacks) {
      const client = await connect();
      client.sendJson(attack);
      const error = await client.nextJson<{ code: string }>();
      expect(["MESSAGE_SCHEMA_INVALID", "PROJECT_INVALID"]).toContain(error.code);
      await client.waitForClose();
    }
    const implementation = await readFile(path.join(projectRoot, "packages", "dev-server", "src", "websocket-server.ts"), "utf8");
    expect(implementation).not.toMatch(/node:fs|readFile|writeFile/);
    expect(proxy.connectionDiagnostics().routedMessages).toBe(0);
  });

  it("P4-08 closes oversized frames and bounds 10,000 previews without starving ping", async () => {
    const oversized = await connect();
    oversized.sendOversizedDeclared(REFRAME_MAX_MESSAGE_BYTES + 1);
    expect((await oversized.nextJson<{ code: string }>()).code).toBe("MESSAGE_TOO_LARGE");
    expect((await oversized.waitForClose()).code).toBe(1009);

    const { client } = await openReady();
    const previews = Array.from({ length: 10_000 }, (_, index) => message("preview:changed", `preview_${index}`, { selectionId: "selection_1", proposalId: `proposal_${index}`, generation: 1, width: 420 }));
    const before = process.memoryUsage().heapUsed;
    await client.sendMany(previews);
    const started = performance.now();
    client.sendJson(message("ping", "control_ping"));
    const pong = await client.nextJson<{ type: string; correlationId: string }>(5_000);
    const latency = performance.now() - started;
    await delay(20);
    expect(pong).toMatchObject({ type: "pong", correlationId: "control_ping" });
    expect(latency).toBeLessThan(5_000);
    expect(proxy.connectionDiagnostics().rateLimitedMessages).toBeGreaterThanOrEqual(9_900);
    expect(process.memoryUsage().heapUsed - before).toBeLessThan(64 * 1024 * 1024);
  }, 15_000);

  it("P4-11 routes only direction-valid schema-valid initial message types and preserves IDs", async () => {
    const { client, serverReady } = await openReady();
    expect(serverReady).toMatchObject({ type: "server:ready", correlationId: "ready_1", sessionId: SESSION, project: { id: PROJECT } });
    client.sendJson(message("ping", "ping_1"));
    expect(await client.nextJson()).toMatchObject({ type: "pong", correlationId: "ping_1", sessionId: SESSION });
    for (const valid of [
      message("pong", "pong_1"),
      message("selection:changed", "selection_1", { selectionId: "selected_1", generation: 1 }),
      message("preview:changed", "preview_1", { selectionId: "selected_1", proposalId: "proposal_1", generation: 1, width: 420 }),
      message("edit:apply", "apply_1", { selectionId: "selected_1", proposalId: "proposal_1", generation: 1, width: 420 }),
      message("edit:cancel", "cancel_1", { proposalId: "proposal_1" }),
    ]) client.sendJson(valid);
    await delay(25);
    const stats = proxy.connectionDiagnostics();
    expect(stats.routedByType).toMatchObject({ "client:ready": 1, ping: 1, pong: 1, "selection:changed": 1, "preview:changed": 1, "edit:apply": 1, "edit:cancel": 1 });

    for (const type of ["server:ready", "server:error"]) {
      const invalid = await connect();
      invalid.sendJson(message(type, `bad_${type.replace(":", "_")}`));
      expect((await invalid.nextJson<{ code: string }>()).code).toBe("MESSAGE_DIRECTION_INVALID");
      await invalid.waitForClose();
    }
  });

  it("P4-12 logs stable safe codes without the canary token or authorization data", async () => {
    await handshake({ protocols: protocols("wrong_token_0123456789_ABCDEFGHIJK") });
    const client = await connect();
    client.sendText("not-json");
    await client.waitForClose();
    const output = logs.join("\n");
    expect(output).toContain("AUTH_INVALID");
    expect(output).toContain("MESSAGE_MALFORMED");
    expect(output).not.toContain(TOKEN);
    expect(output).not.toMatch(/authorization|reframe\.token\./i);
  });

  it("P4-13 accepts real IPv4 and IPv6 loopback sockets and rejects non-loopback host/address forms", async () => {
    expect(isLoopbackAddress("127.0.0.1")).toBe(true);
    expect(isLoopbackAddress("::1")).toBe(true);
    expect(isLoopbackAddress("::ffff:127.0.0.1")).toBe(true);
    expect(isLoopbackAddress("192.168.1.4")).toBe(false);
    const ipv4 = await openReady();
    expect(ipv4.serverReady.type).toBe("server:ready");
    expect(proxy.ipv6Available).toBe(true);
    const port = new URL(origin).port;
    const ipv6Origin = `http://[::1]:${port}`;
    const ipv6Url = `ws://[::1]:${port}${proxy.webSocketPath}`;
    const ipv6 = await openReady(ipv6Origin, { origin: ipv6Origin, protocols: protocols(), connectHost: "::1" }, ipv6Url);
    expect(ipv6.serverReady.type).toBe("server:ready");
    const rejected = await handshake({ host: `10.0.0.5:${port}` });
    expect(rejected.headers["x-reframe-error"]).toBe("HOST_INVALID");
  });
});
