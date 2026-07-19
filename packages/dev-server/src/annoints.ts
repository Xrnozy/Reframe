import { createHash, randomUUID } from "node:crypto";
import { watch, type FSWatcher } from "node:fs";
import { link, lstat, mkdir, open, readFile, readdir, realpath, rename, rm, unlink } from "node:fs/promises";
import path from "node:path";

const schemaVersion = 1 as const;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const isAnnointId = (value: string): boolean => uuidPattern.test(value);
const inside = (root: string, target: string) => { const relative = path.relative(root, target); return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)); };
const route = (value: unknown): value is string => typeof value === "string" && value.startsWith("/") && value.length <= 2_048 && !value.includes("\\") && !value.includes("\0") && !value.split(/[/?#]/).includes("..");
const viewport = (value: unknown): value is { width: number; height: number } => typeof value === "object" && value !== null && "width" in value && "height" in value && typeof value.width === "number" && typeof value.height === "number" && value.width > 0 && value.height > 0;

export interface AnnointStroke { readonly tool: "pen" | "circle"; readonly color: string; readonly width: number; readonly points?: readonly (readonly [number, number])[]; readonly cx?: number; readonly cy?: number; readonly r?: number }
export interface AnnointText { readonly x: number; readonly y: number; readonly text: string; readonly color: string; readonly fontSize: number }
export interface Annoint {
  readonly schemaVersion: typeof schemaVersion;
  readonly id: string;
  readonly route: string;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly strokes: readonly AnnointStroke[];
  readonly texts: readonly AnnointText[];
  readonly updatedAt: string;
}

export interface AnnointStoreOptions { readonly createId?: () => string; readonly now?: () => string; readonly watcherDebounceMs?: number }

function validateAnnoint(value: unknown): Annoint {
  if (typeof value !== "object" || value === null) throw new Error("ANNOINT_SCHEMA_INVALID");
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== schemaVersion || !uuidPattern.test(String(record.id)) || !route(record.route) || !viewport(record.viewport) || !Array.isArray(record.strokes) || !Array.isArray(record.texts) || typeof record.updatedAt !== "string") throw new Error("ANNOINT_SCHEMA_INVALID");
  return record as unknown as Annoint;
}

export function createAnnointStore(projectRoot: string, options: AnnointStoreOptions = {}) {
  const annointDirectory = path.join(projectRoot, ".reframe", "annoints");
  const watchers = new Set<FSWatcher>();
  let rootPromise: Promise<string> | undefined;
  let directoryPromise: Promise<string> | undefined;

  const project = () => rootPromise ??= realpath(projectRoot);
  const directory = async () => {
    if (!directoryPromise) directoryPromise = (async () => {
      const root = await project();
      await mkdir(annointDirectory, { recursive: true });
      const gitignore = path.join(root, ".reframe", ".gitignore");
      const current = await readFile(gitignore, "utf8").catch(() => null);
      if (current && current.includes("*") && !current.includes("!annoints/")) await atomicReplace(gitignore, `${current.endsWith("\n") ? current : current + "\n"}!annoints/\n!annoints/**\n`);
      const resolved = await realpath(annointDirectory);
      if (!inside(root, resolved)) throw new Error("ANNOINT_PATH_ESCAPE");
      return resolved;
    })();
    return directoryPromise;
  };

  const durable = async (file: string, contents: string) => { const handle = await open(file, "wx"); try { await handle.writeFile(contents, "utf8"); await handle.sync(); } finally { await handle.close(); } };
  const atomicFolder = async (file: string) => { const root = await project(); const folder = await realpath(path.dirname(file)); if (!inside(root, folder)) throw new Error("ANNOINT_PATH_ESCAPE"); return folder; };
  const atomicCreate = async (file: string, contents: string) => { const folder = await atomicFolder(file); const temporary = path.join(folder, `.${path.basename(file)}.${randomUUID()}.tmp`); try { await durable(temporary, contents); await link(temporary, file); } finally { await unlink(temporary).catch(() => undefined); } };
  const atomicReplace = async (file: string, contents: string) => { const folder = await atomicFolder(file); const temporary = path.join(folder, `.${path.basename(file)}.${randomUUID()}.tmp`); try { await durable(temporary, contents); await rename(temporary, file); } finally { await rm(temporary, { force: true }).catch(() => undefined); } };
  const annointFile = async (id: string) => { if (!uuidPattern.test(id)) throw new Error("ANNOINT_ID_INVALID"); return path.join(await directory(), `${id.toLowerCase()}.json`); };

  async function load(filter: { route?: string } = {}): Promise<Annoint[]> {
    const folder = await directory();
    const entries = await readdir(folder, { withFileTypes: true });
    const results: Annoint[] = [];
    for (const entry of entries.filter((item) => item.name.endsWith(".json") && !item.name.startsWith("."))) {
      try {
        if (!entry.isFile() || entry.isSymbolicLink()) continue;
        const raw = String(await readFile(path.join(folder, entry.name), "utf8"));
        if (/^(?:<<<<<<<|=======|>>>>>>>)/m.test(raw)) continue;
        const annoint = validateAnnoint(JSON.parse(raw));
        if (!filter.route || annoint.route === filter.route) results.push(annoint);
      } catch { /* ponytail: skip corrupt annoint files */ }
    }
    return results.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async function save(draft: Omit<Annoint, "schemaVersion" | "updatedAt" | "id"> & { id?: string }): Promise<Annoint> {
    const now = options.now?.() ?? new Date().toISOString();
    const id = (draft.id && uuidPattern.test(draft.id) ? draft.id : options.createId?.() ?? randomUUID()).toLowerCase();
    const annoint: Annoint = { schemaVersion, id, route: draft.route, viewport: draft.viewport, strokes: draft.strokes, texts: draft.texts, updatedAt: now };
    validateAnnoint(annoint);
    const file = await annointFile(id);
    const exists = await lstat(file).then(() => true).catch(() => false);
    const contents = `${JSON.stringify(annoint, null, 2)}\n`;
    if (exists) await atomicReplace(file, contents);
    else await atomicCreate(file, contents);
    return annoint;
  }

  async function subscribe(listener: (annoints: Annoint[]) => void | Promise<void>, filter: { route?: string } = {}): Promise<() => void> {
    const folder = await directory();
    let timer: NodeJS.Timeout | undefined;
    let closed = false;
    const watcher = watch(folder, () => { clearTimeout(timer); timer = setTimeout(() => { if (!closed) void load(filter).then(listener); }, options.watcherDebounceMs ?? 75); });
    watchers.add(watcher);
    return () => { closed = true; clearTimeout(timer); watcher.close(); watchers.delete(watcher); };
  }

  async function close() { for (const watcher of watchers) watcher.close(); watchers.clear(); }

  return { load, save, subscribe, close, directory: annointDirectory };
}
