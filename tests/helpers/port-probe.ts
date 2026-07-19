import { createServer, type Server } from "node:net";
import { randomInt } from "node:crypto";

export interface PortReservation {
  readonly port: number;
  release(): Promise<void>;
}

export async function reservePort(host = "127.0.0.1"): Promise<PortReservation> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const server = createServer();
    const opened = await new Promise<boolean>((resolve) => { server.once("error", () => resolve(false)); server.listen(randomInt(10_000, 60_000), host, () => resolve(true)); });
    if (!opened) { if (server.listening) await closeServer(server); continue; }
    const address = server.address();
    if (!address || typeof address === "string") { await closeServer(server); continue; }
    let released = false;
    return { port: address.port, async release() { if (released) return; released = true; await closeServer(server); } };
  }
  throw new Error("failed to reserve a non-well-known TCP port");
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

export async function canBind(port: number, host = "127.0.0.1"): Promise<boolean> {
  const server = createServer();
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, host, resolve);
    });
    return true;
  } catch { return false; }
  finally { if (server.listening) await closeServer(server); }
}

export async function waitForPortRelease(port: number, deadlineMs = 5000): Promise<void> {
  const deadline = performance.now() + deadlineMs;
  while (performance.now() < deadline) {
    if (await canBind(port)) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`port ${port} was not released within ${deadlineMs}ms`);
}
