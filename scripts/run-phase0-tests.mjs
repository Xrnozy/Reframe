import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { readdir, readFile, lstat, readlink } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const templates = path.join(root, "tests", "fixtures", "templates");
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("npm_execpath is required; run this orchestrator through `npm run test:phase0`");

async function digestTree(directory) {
  const hash = createHash("sha256");
  async function visit(current) {
    const entries = await readdir(current, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      const relative = path.relative(directory, absolute).split(path.sep).join("/");
      const info = await lstat(absolute);
      hash.update(relative).update("\0");
      if (info.isDirectory()) await visit(absolute);
      else if (info.isSymbolicLink()) hash.update(`symlink:${await readlink(absolute)}`);
      else hash.update(await readFile(absolute));
      hash.update("\0");
    }
  }
  await visit(directory);
  return hash.digest("hex");
}

async function run(script) {
  const started = performance.now();
  const args = [npmCli, "run", script];
  const child = spawn(process.execPath, args, { cwd: root, shell: false, stdio: "inherit", windowsHide: true });
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (exitCode) => resolve(exitCode ?? 1));
  });
  process.stdout.write(`PHASE0_COMMAND ${JSON.stringify({ command: `${process.execPath} ${npmCli} run ${script}`, exitCode: code, runtimeMs: Number((performance.now() - started).toFixed(2)) })}\n`);
  return code;
}

const before = await digestTree(templates);
let exitCode = 0;
for (const script of ["build", "test:unit", "test:phase0:integration", "test:phase0:performance", "test:e2e", "verify:leaks"]) {
  const code = await run(script);
  if (code !== 0) { exitCode = code; break; }
}
const after = await digestTree(templates);
if (before !== after) {
  process.stderr.write(`[P0-10] FAILED fixture template hash changed: ${before} -> ${after}\n`);
  exitCode = 1;
} else {
  process.stdout.write(`[P0-10] PASSED fixture templates remained byte-identical: ${after}\n`);
}
process.exitCode = exitCode;
