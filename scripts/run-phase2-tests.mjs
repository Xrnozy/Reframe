import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readFile, readdir, readlink } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("npm_execpath is required; run through `npm run test:phase2`");

async function fixtureDigest(directory) {
  const hash = createHash("sha256");
  async function visit(current) {
    const entries = await readdir(current, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      hash.update(path.relative(directory, absolute).split(path.sep).join("/")).update("\0");
      const info = await lstat(absolute);
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
  const child = spawn(process.execPath, [npmCli, "run", script], { cwd: root, shell: false, stdio: "inherit", windowsHide: true });
  const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", (value) => resolve(value ?? 1)); });
  process.stdout.write(`PHASE2_COMMAND ${JSON.stringify({ script, exitCode: code, runtimeMs: Number((performance.now() - started).toFixed(2)) })}\n`);
  return code;
}

const templates = path.join(root, "tests", "fixtures", "templates");
const before = await fixtureDigest(templates);
for (const script of ["build", "test:phase2:integration", "test:phase2:performance", "test:phase1:integration", "test:phase1:performance", "test:unit", "test:phase0:integration", "test:phase0:performance", "test:e2e", "verify:phase1-leaks", "verify:phase2-leaks"]) {
  const code = await run(script);
  if (code !== 0) { process.exitCode = code; break; }
}
const after = await fixtureDigest(templates);
if (before !== after) {
  process.stderr.write(`[P0-10] FAILED fixture templates changed: ${before} -> ${after}\n`);
  process.exitCode = 1;
} else process.stdout.write(`[P0-10] PASSED fixture templates remained byte-identical: ${after}\n`);
