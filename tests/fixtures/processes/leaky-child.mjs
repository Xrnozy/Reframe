import { writeFileSync } from "node:fs";
import { createServer } from "node:http";

const [portText, pidFile] = process.argv.slice(2);
const port = Number(portText);
writeFileSync(pidFile, String(process.pid));
createServer((_request, response) => { response.writeHead(200); response.end("child-ready"); }).listen(port, "127.0.0.1", () => process.stdout.write(`child-ready:${port}\n`));
