import { spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rename, rm, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const destination = path.resolve(process.argv[2] ?? root);
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("npm_execpath is required; run through npm");

const AV_WORKAROUND =
  "The .tgz may be locked by antivirus or another process. " +
  "Exclude this project folder from real-time scanning, close tools holding the file, wait a few seconds, and retry.";

async function removeIfExists(filePath) {
  try {
    await unlink(filePath);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

function isUnknownOpenError(stderr) {
  return /UNKNOWN|errno -4094|unknown error,\s*open/i.test(stderr);
}

async function runNpmPack(stageDir, packDestination) {
  const args = [
    npmCli,
    "pack",
    stageDir,
    "--pack-destination",
    packDestination,
    "--json",
    "--cache",
    path.join(root, ".npm-cache"),
  ];
  const child = spawn(process.execPath, args, {
    cwd: root,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += String(chunk);
  });
  child.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (exitCode) => resolve(exitCode ?? 1));
  });
  return { code, stdout, stderr };
}

const cliManifest = JSON.parse(await readFile(path.join(root, "packages", "cli", "package.json"), "utf8"));
const tgzName = `${cliManifest.name}-${cliManifest.version}.tgz`;

const stage = await mkdtemp(path.join(os.tmpdir(), "reframe-pack-"));
const packDest = await mkdtemp(path.join(os.tmpdir(), "reframe-pack-out-"));
try {
  await mkdir(destination, { recursive: true });
  await removeIfExists(path.join(destination, tgzName));

  await cp(path.join(root, "packages", "cli", "dist"), path.join(stage, "dist"), { recursive: true });
  await writeFile(path.join(stage, "package.json"), await readFile(path.join(root, "packages", "cli", "package.json")));
  const bundled = path.join(stage, "node_modules", "@reframe", "dev-server");
  await mkdir(bundled, { recursive: true });
  await cp(path.join(root, "packages", "dev-server", "dist"), path.join(bundled, "dist"), { recursive: true });
  await writeFile(path.join(bundled, "package.json"), await readFile(path.join(root, "packages", "dev-server", "package.json")));
  const browserClient = path.join(stage, "node_modules", "@reframe", "browser-client");
  await mkdir(browserClient, { recursive: true });
  await cp(path.join(root, "packages", "browser-client", "dist"), path.join(browserClient, "dist"), { recursive: true });
  await writeFile(path.join(browserClient, "package.json"), await readFile(path.join(root, "packages", "browser-client", "package.json")));
  const shared = path.join(stage, "node_modules", "@reframe", "shared");
  await mkdir(shared, { recursive: true });
  await cp(path.join(root, "packages", "shared", "dist"), path.join(shared, "dist"), { recursive: true });
  await writeFile(path.join(shared, "package.json"), await readFile(path.join(root, "packages", "shared", "package.json")));
  await cp(path.join(root, "node_modules", "playwright-core"), path.join(stage, "node_modules", "playwright-core"), { recursive: true });

  let packResult;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) {
      await removeIfExists(path.join(packDest, tgzName));
      await removeIfExists(path.join(destination, tgzName));
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    await removeIfExists(path.join(packDest, tgzName));

    const { code, stdout, stderr } = await runNpmPack(stage, packDest);
    if (code === 0) {
      packResult = JSON.parse(stdout)[0];
      break;
    }
    if (attempt === 1 || !isUnknownOpenError(stderr)) {
      const detail = stderr.trim() || `exit code ${code}`;
      const hint = isUnknownOpenError(stderr) ? `\n${AV_WORKAROUND}` : "";
      throw new Error(`npm pack failed: ${detail}${hint}`);
    }
  }

  const packedPath = path.join(packDest, packResult.filename);
  const finalPath = path.join(destination, packResult.filename);
  await removeIfExists(finalPath);
  await rename(packedPath, finalPath);
  process.stdout.write(`${finalPath}\n`);
} finally {
  await rm(stage, { recursive: true, force: true });
  await rm(packDest, { recursive: true, force: true });
}
