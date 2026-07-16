import { createServer } from "node:net";

async function canBind(port) {
  const server = createServer();
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, "127.0.0.1", resolve);
    });
    return true;
  } catch { return false; }
  finally {
    if (server.listening) await new Promise((resolve) => server.close(resolve));
  }
}

const ports = [4510, 4511];
const occupied = [];
for (const port of ports) if (!(await canBind(port))) occupied.push(port);
if (occupied.length) {
  process.stderr.write(`Phase 0 leak check failed; occupied test ports: ${occupied.join(", ")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Phase 0 leak check passed; ports ${ports.join(", ")} are bindable.\n`);
}
