import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const sourceExtensions = new Set([".css", ".html", ".js", ".jsx"]);
const ignoredDirectories = new Set([".git", "node_modules", "dist", "build", ".next", ".reframe"]);

export interface SnapshotStoreOptions {
  readonly projectRoot: string;
}

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function within(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

async function sourceFiles(root: string): Promise<string[]> {
  const output: string[] = [];
  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (entry.isSymbolicLink()) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name)) await visit(absolute);
      } else if (sourceExtensions.has(path.extname(entry.name).toLowerCase())) {
        output.push(absolute);
      }
      if (output.length > 2_000) throw new Error("SNAPSHOT_SOURCE_LIMIT");
    }
  }
  await visit(root);
  return output;
}

export function createSnapshotStore(options: SnapshotStoreOptions) {
  const root = path.resolve(options.projectRoot);
  const snapshotRoot = path.join(root, ".reframe", "snapshots", "session");
  const manifestPath = path.join(snapshotRoot, "manifest.json");

  async function ensureSessionSnapshot(): Promise<{ readonly created: boolean; readonly files: readonly string[] }> {
    try {
      const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { files?: string[] };
      if (Array.isArray(manifest.files) && manifest.files.length) return { created: false, files: manifest.files };
    } catch { /* ponytail: first snapshot */ }
    await mkdir(snapshotRoot, { recursive: true });
    const files: string[] = [];
    for (const absolute of await sourceFiles(root)) {
      const relative = path.relative(root, absolute).split(path.sep).join("/");
      const target = path.join(snapshotRoot, relative);
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(absolute, target);
      files.push(relative);
    }
    await writeFile(manifestPath, `${JSON.stringify({ createdAt: new Date().toISOString(), files }, null, 2)}\n`);
    return { created: true, files };
  }

  async function readSnapshot(relativePath: string): Promise<Buffer | null> {
    const normalized = relativePath.replaceAll("\\", "/").replace(/^\/+/, "");
    if (!normalized || normalized.includes("..") || path.isAbsolute(normalized)) return null;
    const target = path.join(snapshotRoot, normalized);
    if (!within(snapshotRoot, target)) return null;
    try {
      const info = await stat(target);
      if (!info.isFile()) return null;
      return readFile(target);
    } catch {
      return null;
    }
  }

  async function hasSnapshot(): Promise<boolean> {
    try {
      const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { files?: string[] };
      return Array.isArray(manifest.files) && manifest.files.length > 0;
    } catch {
      return false;
    }
  }

  return { ensureSessionSnapshot, readSnapshot, hasSnapshot, snapshotRoot, manifestHash: async () => sha256(await readFile(manifestPath).catch(() => Buffer.alloc(0))) };
}
