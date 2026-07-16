import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fixtureTemplatesRoot } from "./paths.js";

export interface FixtureManifest {
  id: string;
  framework: string;
  styling: string;
  packageManager: string | null;
  devCommand: string[];
  expectedPath: string;
  requiredFiles: string[];
  allowedChangePaths: string[];
  editableElementFingerprints: string[];
}

export class FixtureValidationError extends Error {
  constructor(message: string) { super(message); this.name = "FixtureValidationError"; }
}

function assertRelative(value: string, field: string): void {
  if (!value || path.isAbsolute(value) || value.includes("\0")) throw new FixtureValidationError(`${field} contains unsafe path: ${value}`);
  const normalized = path.normalize(value);
  if (normalized === ".." || normalized.startsWith(`..${path.sep}`)) throw new FixtureValidationError(`${field} escapes fixture root: ${value}`);
}

function rejectMutableTimestamps(value: unknown, location = "manifest"): void {
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (/^(createdAt|updatedAt|timestamp)$/i.test(key)) throw new FixtureValidationError(`${location} contains mutable timestamp field ${key}`);
    rejectMutableTimestamps(nested, `${location}.${key}`);
  }
}

async function htmlFiles(root: string): Promise<string[]> {
  const found: string[] = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile() && entry.name.endsWith(".html")) found.push(absolute);
    }
  }
  await visit(root);
  return found;
}

export async function validateFixture(root: string): Promise<FixtureManifest> {
  const manifestPath = path.join(root, "reframe.fixture.json");
  let raw: string;
  try { raw = await readFile(manifestPath, "utf8"); }
  catch { throw new FixtureValidationError(`missing required manifest: reframe.fixture.json`); }
  let manifest: FixtureManifest;
  try { manifest = JSON.parse(raw) as FixtureManifest; }
  catch (error) { throw new FixtureValidationError(`invalid fixture manifest JSON: ${String(error)}`); }
  rejectMutableTimestamps(manifest);
  if (!manifest.id || !Array.isArray(manifest.requiredFiles) || !Array.isArray(manifest.allowedChangePaths)) throw new FixtureValidationError("manifest is missing required schema fields");
  for (const relative of [...manifest.requiredFiles, ...manifest.allowedChangePaths]) assertRelative(relative, "manifest path");
  for (const relative of manifest.requiredFiles) {
    try { if (!(await stat(path.join(root, relative))).isFile()) throw new Error("not a file"); }
    catch { throw new FixtureValidationError(`missing required file: ${relative}`); }
  }
  const seen = new Map<string, string>();
  for (const file of await htmlFiles(root)) {
    const html = await readFile(file, "utf8");
    for (const match of html.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)) {
      const id = match[1]!;
      const prior = seen.get(id);
      if (prior) throw new FixtureValidationError(`duplicate id "${id}" in ${path.relative(root, prior)} and ${path.relative(root, file)}`);
      seen.set(id, file);
    }
  }
  return manifest;
}

export async function listFixtureRoots(): Promise<string[]> {
  const roots: string[] = [];
  for (const entry of await readdir(fixtureTemplatesRoot, { withFileTypes: true })) {
    if (entry.isDirectory()) roots.push(path.join(fixtureTemplatesRoot, entry.name));
  }
  return roots.sort();
}

export async function validateAllFixtureTemplates(): Promise<FixtureManifest[]> {
  const manifests: FixtureManifest[] = [];
  const ids = new Set<string>();
  for (const root of await listFixtureRoots()) {
    const manifest = await validateFixture(root);
    if (ids.has(manifest.id)) throw new FixtureValidationError(`duplicate fixture id: ${manifest.id}`);
    ids.add(manifest.id);
    manifests.push(manifest);
  }
  return manifests;
}
