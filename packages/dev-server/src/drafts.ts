import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

export interface EditDraft {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly route: string;
  readonly updatedAt: string;
  readonly selectionId: string;
  readonly fingerprint: Record<string, unknown>;
  readonly previewWidth: number;
  readonly previewHeight: number;
  readonly previewText: string;
  readonly previewStyles: Record<string, string>;
  readonly previewTranslate: { readonly x: number; readonly y: number };
}

export interface DraftStoreOptions {
  readonly projectRoot: string;
  readonly now?: () => string;
  readonly createId?: () => string;
}

function routeKey(route: string): string {
  return createHash("sha256").update(route || "/").digest("hex").slice(0, 16);
}

function safeRoute(route: string): boolean {
  return typeof route === "string" && route.length <= 2_048 && !route.includes("\0");
}

export function createDraftStore(options: DraftStoreOptions) {
  const root = path.resolve(options.projectRoot);
  const draftRoot = path.join(root, ".reframe", "drafts");

  async function ensureRoot(): Promise<void> {
    await mkdir(draftRoot, { recursive: true });
    try { await writeFile(path.join(root, ".reframe", ".gitignore"), "history/\ndrafts/\nsnapshots/\n.gitignore\n", { flag: "wx" }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
  }

  async function save(input: Omit<EditDraft, "schemaVersion" | "id" | "updatedAt"> & { id?: string }): Promise<EditDraft> {
    if (!safeRoute(input.route)) throw new Error("DRAFT_ROUTE_INVALID");
    await ensureRoot();
    const draft: EditDraft = {
      schemaVersion: 1,
      id: input.id ?? options.createId?.() ?? randomUUID(),
      route: input.route,
      updatedAt: options.now?.() ?? new Date().toISOString(),
      selectionId: input.selectionId,
      fingerprint: input.fingerprint,
      previewWidth: input.previewWidth,
      previewHeight: input.previewHeight,
      previewText: input.previewText,
      previewStyles: input.previewStyles,
      previewTranslate: input.previewTranslate,
    };
    await writeFile(path.join(draftRoot, `${routeKey(input.route)}.json`), `${JSON.stringify(draft)}\n`);
    return draft;
  }

  async function load(route: string): Promise<EditDraft | null> {
    if (!safeRoute(route)) return null;
    try {
      const value = JSON.parse(await readFile(path.join(draftRoot, `${routeKey(route)}.json`), "utf8")) as EditDraft;
      return value?.schemaVersion === 1 ? value : null;
    } catch {
      return null;
    }
  }

  async function clear(route: string): Promise<void> {
    if (!safeRoute(route)) return;
    await unlink(path.join(draftRoot, `${routeKey(route)}.json`)).catch(() => undefined);
  }

  async function list(): Promise<readonly EditDraft[]> {
    await ensureRoot();
    const entries = await readdir(draftRoot, { withFileTypes: true });
    const drafts: EditDraft[] = [];
    for (const entry of entries.filter((item) => item.isFile() && item.name.endsWith(".json"))) {
      try {
        const value = JSON.parse(await readFile(path.join(draftRoot, entry.name), "utf8")) as EditDraft;
        if (value?.schemaVersion === 1) drafts.push(value);
      } catch { /* ponytail: skip corrupt drafts */ }
    }
    return drafts;
  }

  return { save, load, clear, list };
}
