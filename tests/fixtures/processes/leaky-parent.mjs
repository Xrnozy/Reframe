import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const [port, pidFile] = process.argv.slice(2);
const childScript = fileURLToPath(new URL("./leaky-child.mjs", import.meta.url));
const child = spawn(process.execPath, [childScript, port, pidFile], { stdio: "inherit", windowsHide: true });
process.stdout.write(`[reframe-owned-pid:${child.pid}]\n`);
setInterval(() => process.stdout.write("parent-alive\n"), 1000);
