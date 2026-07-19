import { createHash } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { createProjectProxy, type ProjectProxy } from "../../packages/dev-server/src/proxy.js";
import { reservePort } from "../helpers/port-probe.js";

const servers: Server[] = [];
const proxies: ProjectProxy[] = [];

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

async function proxyFor(upstream: string): Promise<{ proxy: ProjectProxy; url: string }> {
  const proxy = createProjectProxy(upstream, { session: "phase3-test-session" });
  proxies.push(proxy);
  return { proxy, url: (await proxy.listen()).url };
}

function htmlHeaders(): HeadersInit {
  return { Accept: "text/html", "Sec-Fetch-Dest": "document" };
}

afterEach(async () => {
  await Promise.all(proxies.splice(0).map((proxy) => proxy.close()));
  await Promise.all(servers.splice(0).map(closeServer));
});

describe("Phase 3 transparent proxy", () => {
  it("P3-03 injects compressed chunked HTML and HTML without a closing body exactly once", async () => {
    const compressed = gzipSync(Buffer.from("<!doctype html><html><body><h1>Compressed</h1></body></html>"));
    const upstream = await listen((request, response) => {
      if (request.url === "/compressed") {
        response.writeHead(200, { "Content-Encoding": "gzip", "Content-Type": "text/html; charset=utf-8", ETag: "stale" });
        response.write(compressed.subarray(0, 8));
        response.end(compressed.subarray(8));
      } else response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end("<main>no closing body</main>");
    });
    const { url } = await proxyFor(upstream.url);

    for (const path of ["compressed", "nobody"]) {
      const response = await fetch(`${url}${path}`, { headers: htmlHeaders() });
      const body = await response.text();
      expect(response.status).toBe(200);
      expect(response.headers.get("x-reframe-injected")).toBe("1");
      expect(response.headers.get("etag")).toBeNull();
      expect(body.match(/data-reframe-bootstrap/g)).toHaveLength(1);
      expect(body).toContain(path === "compressed" ? "Compressed" : "no closing body");
    }
  });

  it("P3-07 preserves malformed success HTML and a 500 error body without crashing or hiding it", async () => {
    const upstream = await listen((request, response) => {
      if (request.url === "/error") response.writeHead(500, { "Content-Type": "text/html" }).end("<h1>Vite compile error</h1>");
      else response.writeHead(200, { "Content-Type": "text/html" }).end("<html><body><p>unfinished");
    });
    const { url } = await proxyFor(upstream.url);
    const malformed = await fetch(`${url}malformed`, { headers: htmlHeaders() });
    const error = await fetch(`${url}error`, { headers: htmlHeaders() });
    expect(await malformed.text()).toMatch(/unfinished[\s\S]*data-reframe-bootstrap/);
    expect(error.status).toBe(500);
    const errorBody = await error.text();
    expect(errorBody).toContain("Vite compile error");
    expect(errorBody).not.toContain("data-reframe-bootstrap");
  });

  it("P3-08 leaves JS, JSON, SVG, image, font, range, and API responses byte-equivalent", async () => {
    const fixtures = new Map<string, { status: number; type: string; body: Buffer; extra?: Record<string, string> }>([
      ["/script.js", { status: 200, type: "text/javascript", body: Buffer.from("window.ok=true") }],
      ["/data.json", { status: 200, type: "application/json", body: Buffer.from('{"html":"</body>"}') }],
      ["/icon.svg", { status: 200, type: "image/svg+xml", body: Buffer.from("<svg><text>data-reframe-bootstrap</text></svg>") }],
      ["/image.png", { status: 200, type: "image/png", body: Buffer.from([0, 1, 2, 255, 3]) }],
      ["/font.woff2", { status: 200, type: "font/woff2", body: Buffer.from([119, 79, 70, 50, 0, 7]) }],
      ["/range", { status: 206, type: "application/octet-stream", body: Buffer.from("2345"), extra: { "Content-Range": "bytes 2-5/10" } }],
      ["/api", { status: 201, type: "application/octet-stream", body: Buffer.from("api-body") }],
    ]);
    const upstream = await listen((request, response) => {
      const fixture = fixtures.get(request.url ?? "");
      if (!fixture) return response.writeHead(404).end();
      response.writeHead(fixture.status, { "Content-Type": fixture.type, "X-Upstream": "kept", ...fixture.extra });
      response.end(fixture.body);
    });
    const { url } = await proxyFor(upstream.url);
    for (const [path, fixture] of fixtures) {
      const response = await fetch(new URL(path, url));
      expect(response.status).toBe(fixture.status);
      expect(response.headers.get("x-upstream")).toBe("kept");
      expect(Buffer.from(await response.arrayBuffer())).toEqual(fixture.body);
    }
  });

  it("P3-10 reports upstream disconnect, serves no stale editable HTML, and recovers on the same proxy", async () => {
    const reservation = await reservePort();
    const port = reservation.port;
    await reservation.release();
    const first = await listen((_request, response) => response.writeHead(200, { "Content-Type": "text/html" }).end("<body>first</body>"), port);
    const { url } = await proxyFor(first.url);
    expect(await (await fetch(url, { headers: htmlHeaders() })).text()).toContain("data-reframe-bootstrap");
    await closeServer(first.server);
    servers.splice(servers.indexOf(first.server), 1);
    const disconnected = await fetch(url, { headers: htmlHeaders() });
    expect(disconnected.status).toBe(502);
    expect(await disconnected.text()).toContain("UPSTREAM_UNAVAILABLE");
    const second = await listen((_request, response) => response.writeHead(200, { "Content-Type": "text/html" }).end("<body>second</body>"), port);
    const recovered = await fetch(url, { headers: htmlHeaders() });
    expect(recovered.status).toBe(200);
    expect(await recovered.text()).toMatch(/second[\s\S]*data-reframe-bootstrap/);
    expect(second.server.listening).toBe(true);
  });

  it("P3-11 forwards both Vite-HMR-like and application WebSocket upgrades without consuming frames", async () => {
    const upstream = await listen((_request, response) => response.writeHead(404).end());
    upstream.server.on("upgrade", (request, socket) => {
      const key = request.headers["sec-websocket-key"];
      const accept = createHash("sha1").update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64");
      socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
      socket.once("data", (frame) => {
        const length = frame[1]! & 0x7f;
        const mask = frame.subarray(2, 6);
        const body = frame.subarray(6, 6 + length).map((byte, index) => byte ^ mask[index % 4]!);
        const reply = Buffer.concat([Buffer.from([0x81, body.length]), body]);
        socket.end(reply);
      });
    });
    const { url } = await proxyFor(upstream.url);
    for (const path of ["vite-hmr", "app-socket"]) {
      const message = await new Promise<string>((resolve, reject) => {
        const socket = new WebSocket(`${url.replace("http", "ws")}${path}`);
        const timer = setTimeout(() => reject(new Error("WebSocket timeout")), 2_000);
        socket.addEventListener("open", () => socket.send(path));
        socket.addEventListener("message", (event) => { clearTimeout(timer); resolve(String(event.data)); socket.close(); });
        socket.addEventListener("error", () => { clearTimeout(timer); reject(new Error("WebSocket failed")); });
      });
      expect(message).toBe(path);
    }
  });

  it("SUP-P3-01 rewrites upstream redirects and strips incompatible cookie domains", async () => {
    const upstream = await listen((_request, response) => response.writeHead(302, { Location: "/next", "Set-Cookie": "mode=test; Domain=127.0.0.1; Path=/" }).end());
    const { url } = await proxyFor(upstream.url);
    const response = await fetch(url, { redirect: "manual" });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/next");
    expect(response.headers.get("set-cookie")).toBe("mode=test; Path=/");
  });
});
