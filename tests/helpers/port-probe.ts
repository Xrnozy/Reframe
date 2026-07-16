import { createServer, type Server } from "node:net";

export interface PortReservation {
  readonly port: number;
  release(): Promise<void>;
}

export async function reservePort(host = "127.0.0.1"): Promise<PortReservation> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, host, () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("failed to reserve TCP port");
  let released = false;
  return {
    port: address.port,
    async release() {
      if (released) return;
      released = true;
      await closeServer(server);
    },
  };
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
