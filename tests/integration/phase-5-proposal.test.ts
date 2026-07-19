import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { REFRAME_PROTOCOL_NAME, REFRAME_PROTOCOL_VERSION, type EditApplyMessage } from "../../packages/shared/src/index.js";
import { createProjectProxy, type ProjectProxy } from "../../packages/dev-server/src/index.js";
import { projectRoot } from "../helpers/paths.js";
import { rawWebSocketHandshake, type RawWebSocketClient } from "../helpers/raw-websocket.js";

const SESSION = "phase5_session";
const TOKEN = "phase5_canary_token_0123456789_ABCDEFG";
const PROJECT = "phase5_project";
let upstream: Server;
let proxy: ProjectProxy;
let origin: string;
let accepted: Readonly<EditApplyMessage>[];
const clients: RawWebSocketClient[] = [];

const message = (type: string, correlationId: string, extra: Record<string, unknown> = {}) => ({ type, protocol: REFRAME_PROTOCOL_VERSION, correlationId, sessionId: SESSION, ...extra });
const selection = (generation = 1) => message("selection:changed", `selection_${generation}`, { selectionId: "selected_1", generation });
const proposal = (overrides: Record<string, unknown> = {}) => message("edit:apply", "apply_1", {
  selectionId: "selected_1",
  proposalId: "proposal_1",
  tabId: "tab_1",
  generation: 1,
  width: 420,
  height: 180,
  previewText: null,
  fingerprint: { tag: "article", id: "card-annual", classes: ["pricing-card"], text: "Annual", parent: { tag: "section", id: "pricing-grid", classes: [] }, route: "/pricing", viewport: { width: 1280, height: 720 } },
  original: { inlineWidthPresent: false, inlineWidth: "", inlineWidthPriority: "", computedWidth: 320, inlineHeightPresent: false, inlineHeight: "", inlineHeightPriority: "", computedHeight: 180, text: "Annual", boxSizing: "border-box", rect: { x: 100, y: 200, width: 320, height: 180 } },
  breakpoint: null,
  sharedImpactAccepted: false,
  overlapAccepted: false,
  ...overrides,
});

async function connectReady(): Promise<RawWebSocketClient> {
  const ws = `${origin.replace("http", "ws")}${proxy.webSocketPath}`;
  const result = await rawWebSocketHandshake(ws, { origin, protocols: [REFRAME_PROTOCOL_NAME, `reframe.token.${TOKEN}`, `reframe.session.${SESSION}`, `reframe.project.${PROJECT}`] });
  expect(result.status).toBe(101);
  const client = result.client!;
  clients.push(client);
  client.sendJson(message("client:ready", "ready_1", { projectId: PROJECT, url: `${origin}/pricing`, route: "/pricing", viewport: { width: 1280, height: 720 } }));
  expect(await client.nextJson()).toMatchObject({ type: "server:ready" });
  return client;
}

beforeEach(async () => {
  accepted = [];
  upstream = createServer((_request, response) => response.writeHead(200, { "Content-Type": "text/html" }).end("<!doctype html><body>Phase 5</body>"));
  await new Promise<void>((resolve, reject) => { upstream.once("error", reject); upstream.listen(0, "127.0.0.1", () => resolve()); });
  const address = upstream.address();
  if (!address || typeof address === "string") throw new Error("upstream has no address");
  proxy = createProjectProxy(`http://127.0.0.1:${address.port}`, {
    session: SESSION,
    connectionToken: TOKEN,
    heartbeatIntervalMs: 60_000,
    project: { id: PROJECT, name: "Phase 5 fixture", framework: "react", capabilities: { canExplore: true, canWriteSource: false } },
    onEditProposal: (value) => accepted.push(value),
  });
  origin = new URL((await proxy.listen()).url).origin;
});

afterEach(async () => {
  for (const client of clients.splice(0)) client.close();
  await proxy.close();
  upstream.closeAllConnections();
  await new Promise<void>((resolve) => upstream.close(() => resolve()));
});

describe("Phase 5 proposal boundary", () => {
  it("P5-03 accepts one immutable complete proposal, acknowledges it, and writes no source file", async () => {
    const watched = path.join(projectRoot, "demo", "react-demo", "src", "styles.css");
    const before = createHash("sha256").update(await readFile(watched)).digest("hex");
    const client = await connectReady();
    client.sendJson(selection());
    client.sendJson(proposal());
    expect(await client.nextJson()).toMatchObject({ type: "edit:accepted", selectionId: "selected_1", proposalId: "proposal_1", tabId: "tab_1", generation: 1 });
    expect(accepted).toHaveLength(1);
    expect(accepted[0]).toMatchObject({ width: 420, fingerprint: { id: "card-annual", route: "/pricing" }, original: { computedWidth: 320 } });
    expect(Object.isFrozen(accepted[0])).toBe(true);
    expect(Object.isFrozen(accepted[0]!.fingerprint)).toBe(true);
    expect(proxy.connectionDiagnostics().acceptedProposals).toBe(1);
    expect(createHash("sha256").update(await readFile(watched)).digest("hex")).toBe(before);
  });

  it("P5-08 rejects non-finite, non-positive, extreme, or malformed proposal widths without acceptance", async () => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, -1, 0, 10_001]) {
      const client = await connectReady();
      client.sendJson(selection());
      client.sendJson(proposal({ correlationId: `invalid_${String(value).replace(/\W/g, "_")}`, width: value }));
      expect(await client.nextJson()).toMatchObject({ type: "server:error", code: "MESSAGE_SCHEMA_INVALID" });
      await client.waitForClose();
    }
    expect(accepted).toHaveLength(0);
    expect(proxy.connectionDiagnostics().acceptedProposals).toBe(0);
  });

  it("P5-10 rejects a proposal after the selection generation changes", async () => {
    const client = await connectReady();
    client.sendJson(selection(2));
    client.sendJson(proposal());
    expect(await client.nextJson()).toMatchObject({ type: "server:error", code: "SELECTION_STALE" });
    expect((await client.waitForClose()).reason).toBe("SELECTION_STALE");
    expect(accepted).toHaveLength(0);
  });
});
