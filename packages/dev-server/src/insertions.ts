import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface InsertionRecord {
  readonly id: string;
  readonly route: string;
  readonly type: "html" | "image" | "svg";
  readonly html: string;
  readonly imagePath: string | null;
  readonly containerFingerprint: string | null;
  readonly createdAt: string;
}

export interface InsertionDraft {
  readonly id?: string;
  readonly route: string;
  readonly type: "html" | "image" | "svg";
  readonly html: string;
  readonly containerFingerprint?: string | null;
  readonly dataUrl?: string;
}

export function createInsertionStore(projectRoot: string) {
  const directory = path.join(projectRoot, ".reframe", "insertions");

  const ensureDir = async () => { await mkdir(directory, { recursive: true }); };

  const save = async (draft: InsertionDraft): Promise<InsertionRecord> => {
    await ensureDir();
    const id = draft.id && uuidPattern.test(draft.id) ? draft.id.toLowerCase() : randomUUID();
    let imagePath: string | null = null;
    if (draft.dataUrl && draft.type === "image") {
      const bytes = Buffer.from(String(draft.dataUrl).replace(/^data:image\/\w+;base64,/, ""), "base64");
      const file = path.join(directory, `${id}.png`);
      await writeFile(file, bytes);
      imagePath = `.reframe/insertions/${id}.png`;
    }
    const record: InsertionRecord = {
      id,
      route: draft.route,
      type: draft.type,
      html: draft.html,
      imagePath,
      containerFingerprint: draft.containerFingerprint ?? null,
      createdAt: new Date().toISOString(),
    };
    await writeFile(path.join(directory, `${id}.json`), `${JSON.stringify(record, null, 2)}\n`);
    return record;
  };

  const list = async (route?: string): Promise<InsertionRecord[]> => {
    await ensureDir();
    const entries = await readdir(directory).catch(() => [] as string[]);
    const records: InsertionRecord[] = [];
    for (const entry of entries) {
      if (!entry.endsWith(".json")) continue;
      try {
        const record = JSON.parse(await readFile(path.join(directory, entry), "utf8")) as InsertionRecord;
        if (!route || record.route === route) records.push(record);
      } catch { /* ponytail: skip corrupt insertion files */ }
    }
    return records;
  };

  const readImage = async (id: string): Promise<Buffer> => readFile(path.join(directory, `${id}.png`));

  const remove = async (id: string): Promise<void> => {
    await unlink(path.join(directory, `${id}.json`)).catch(() => undefined);
    await unlink(path.join(directory, `${id}.png`)).catch(() => undefined);
  };

  return { save, list, readImage, remove };
}
