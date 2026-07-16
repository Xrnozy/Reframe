import { createHash } from "node:crypto";
import { lstat, readFile, readdir, readlink } from "node:fs/promises";
import path from "node:path";

export type TreeSnapshot = Readonly<Record<string, string>>;

export async function hashFile(file: string): Promise<string> {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

export async function snapshotTree(root: string): Promise<TreeSnapshot> {
  const entries: Array<[string, string]> = [];
  async function visit(directory: string): Promise<void> {
    const children = await readdir(directory, { withFileTypes: true });
    children.sort((a, b) => a.name.localeCompare(b.name));
    for (const child of children) {
      const absolute = path.join(directory, child.name);
      const relative = path.relative(root, absolute).split(path.sep).join("/");
      const info = await lstat(absolute);
      if (info.isDirectory()) await visit(absolute);
      else if (info.isSymbolicLink()) entries.push([relative, `symlink:${await readlink(absolute)}`]);
      else entries.push([relative, await hashFile(absolute)]);
    }
  }
  await visit(root);
  return Object.freeze(Object.fromEntries(entries));
}
