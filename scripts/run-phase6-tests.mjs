import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readFile, readdir, readlink } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("npm_execpath is required; run through `npm run test:phase6`");

async function digest(directories) {
  const hash = createHash("sha256");
  async function visit(base, current) {
    const entries = await readdir(current, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      hash.update(path.relative(base, absolute).split(path.sep).join("/")).update("\0");
      const info = await lstat(absolute);
      if (info.isDirectory()) await visit(base, absolute);
      else if (info.isSymbolicLink()) hash.update(`symlink:${await readlink(absolute)}`);
      else hash.update(await readFile(absolute));
      hash.update("\0");
    }
  }
  for (const directory of directories) await visit(directory, directory);
  return hash.digest("hex");
}

async function run(script) {
  const started = performance.now();
  const child = spawn(process.execPath, [npmCli, "run", script], { cwd: root, shell: false, stdio: "inherit", windowsHide: true });
  const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", (value) => resolve(value ?? 1)); });
  process.stdout.write(`PHASE6_COMMAND ${JSON.stringify({ script, exitCode: code, runtimeMs: Number((performance.now() - started).toFixed(2)) })}\n`);
  return code;
}

const protectedTrees = [path.join(root, "demo"), path.join(root, "tests", "fixtures", "templates")];
const before = await digest(protectedTrees);
for (const script of ["build", "test:phase6:integration", "test:phase6:e2e", "test:phase6:performance", "test:phase6:regression"]) {
  if (await run(script)) process.exit(1);
}
const after = await digest(protectedTrees);
process.stdout.write(`PHASE6_FIXTURE_DIGEST ${JSON.stringify({ before, after, unchanged: before === after })}\n`);
if (before !== after) process.exit(1);

