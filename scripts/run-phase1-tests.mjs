import { spawn } from "node:child_process";

const root = process.cwd();
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("npm_execpath is required; run through `npm run test:phase1`");

async function run(script) {
  const started = performance.now();
  const child = spawn(process.execPath, [npmCli, "run", script], { cwd: root, shell: false, stdio: "inherit", windowsHide: true });
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (exitCode) => resolve(exitCode ?? 1));
  });
  process.stdout.write(`PHASE1_COMMAND ${JSON.stringify({ script, exitCode: code, runtimeMs: Number((performance.now() - started).toFixed(2)) })}\n`);
  return code;
}

for (const script of ["build", "test:phase1:integration", "test:phase1:performance", "test:phase0", "verify:phase1-leaks"]) {
  const code = await run(script);
  if (code !== 0) {
    process.exitCode = code;
    break;
  }
}
