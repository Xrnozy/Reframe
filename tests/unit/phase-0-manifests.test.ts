import { cp, mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { FixtureValidationError, validateAllFixtureTemplates, validateFixture } from "../helpers/fixture-manifest.js";
import { fixtureTemplatesRoot } from "../helpers/paths.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function copyTemplate(name: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "reframe manifest ü "));
  temporaryRoots.push(root);
  await cp(path.join(fixtureTemplatesRoot, name), root, { recursive: true });
  return root;
}

describe("Phase 0 fixture manifest safety", () => {
  test("P0-04 missing required file fails validation before any process starts", async () => {
    const all = await validateAllFixtureTemplates();
    expect(all.length).toBeGreaterThanOrEqual(10);
    const root = await copyTemplate("vanilla");
    await unlink(path.join(root, "style.css"));
    await expect(validateFixture(root)).rejects.toEqual(expect.objectContaining<Partial<FixtureValidationError>>({
      name: "FixtureValidationError",
      message: "missing required file: style.css",
    }));
  });

  test("P0-05 duplicate stable HTML IDs fail and identify the duplicate", async () => {
    const root = await copyTemplate("vanilla");
    const html = await import("node:fs/promises").then(({ readFile }) => readFile(path.join(root, "index.html"), "utf8"));
    await writeFile(path.join(root, "index.html"), html.replace("</body>", "<aside id=\"card-annual\">Duplicate</aside></body>"));
    await expect(validateFixture(root)).rejects.toThrow(/duplicate id "card-annual"/);
  });
});
