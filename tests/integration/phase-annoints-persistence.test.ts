import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createAnnointStore } from "../../packages/dev-server/src/annoints.js";
import { createProjectProxy, type ProjectProxy } from "../../packages/dev-server/src/proxy.js";

const servers: Server[] = [];
const proxies: ProjectProxy[] = [];
const token = "a".repeat(32);

async function listen(handler: (request: IncomingMessage, response: ServerResponse) => void, port = 0): Promise<{ server: Server; url: string }> {
  const server = createServer(handler);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => { server.off("error", reject); resolve(); });
  });
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test server has no address");
  return { server, url: `http://127.0.0.1:${address.port}` };
}

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) return;
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

async function proxyFor(upstream: string, projectRoot: string): Promise<{ proxy: ProjectProxy; url: string; annointsPath: string; headers: HeadersInit }> {
  const proxy = createProjectProxy(upstream, { projectRoot, connectionToken: token, session: "phase-annoints-session" });
  proxies.push(proxy);
  const { url } = await proxy.listen();
  const base = url.replace(/\/$/, "");
  return {
    proxy,
    url: base,
    annointsPath: `${base}/.reframe/${proxy.session}/annoints`,
    headers: { Authorization: `Bearer ${token}`, Referer: `${base}/` },
  };
}

afterEach(async () => {
  await Promise.all(proxies.splice(0).map((proxy) => proxy.close()));
  await Promise.all(servers.splice(0).map(closeServer));
});

describe("Annoint persistence", () => {
  it("round-trips annoints through the proxy and reloads by pathname route", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "reframe-annoints-"));
    const upstream = await listen((_request, response) => {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end("<!doctype html><html><body><h1>Annoints</h1></body></html>");
    });
    const { annointsPath, headers } = await proxyFor(upstream.url, root);
    const id = "06ea3595-50eb-4567-a6e0-e1d9328d8570";

    const put = await fetch(`${annointsPath}/${id}`, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        route: "/",
        viewport: { width: 1280, height: 720 },
        strokes: [{ tool: "pen", color: "#f59e0b", width: 2, points: [[10, 10], [40, 40]] }],
        texts: [],
      }),
    });
    expect(put.status).toBe(200);
    expect(await put.json()).toMatchObject({ id, route: "/" });

    const loaded = await fetch(`${annointsPath}?route=${encodeURIComponent("/")}`, { headers });
    expect(loaded.status).toBe(200);
    const body = await loaded.json() as { annoints: Array<{ strokes: unknown[] }> };
    expect(body.annoints).toHaveLength(1);
    expect(body.annoints[0]?.strokes).toHaveLength(1);

    const mismatched = await fetch(`${annointsPath}?route=${encodeURIComponent("/index.html")}`, { headers });
    expect((await mismatched.json() as { annoints: unknown[] }).annoints).toEqual([]);

    const store = createAnnointStore(root);
    expect((await store.load({ route: "/" }))[0]?.strokes).toHaveLength(1);
    await store.close();
    await rm(root, { recursive: true, force: true });
  });
});
