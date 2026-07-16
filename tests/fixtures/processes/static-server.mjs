import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";

const [rootArgument, portArgument] = process.argv.slice(2);
const root = path.resolve(rootArgument);
const port = Number(portArgument);
const contentTypes = new Map([[".html", "text/html; charset=utf-8"], [".css", "text/css; charset=utf-8"], [".js", "text/javascript; charset=utf-8"]]);

createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const relativeRequest = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname).replace(/^\/+/, "");
    const candidate = path.resolve(root, relativeRequest);
    const relative = path.relative(root, candidate);
    if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      response.writeHead(403); response.end("forbidden"); return;
    }
    const body = await readFile(candidate);
    response.writeHead(200, { "content-type": contentTypes.get(path.extname(candidate)) ?? "application/octet-stream" });
    response.end(body);
  } catch {
    response.writeHead(404); response.end("not found");
  }
}).listen(port, "127.0.0.1", () => process.stdout.write(`static-ready:${port}:${root}\n`));
