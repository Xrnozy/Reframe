import { access, chmod, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { createFixtureCopy, type FixtureCopy } from "../helpers/fixture-copy.js";
import { listFixtureRoots } from "../helpers/fixture-manifest.js";
import { snapshotTree } from "../helpers/file-snapshot.js";
import { startManagedProcess } from "../helpers/process-harness.js";
import { projectRoot } from "../helpers/paths.js";

describe("Phase 0 fixture isolation", () => {
  test("P0-03 every template can be copied twice in parallel without shared roots, ports, or mutations", async () => {
    const roots = await listFixtureRoots();
    const before = await Promise.all(roots.map(snapshotTree));
    const copies: FixtureCopy[] = [];
    try {
      for (const root of roots) {
        const pair = await Promise.all([createFixtureCopy(root), createFixtureCopy(root)]);
        copies.push(...pair);
        expect(pair[0].root).not.toBe(pair[1].root);
        expect(pair[0].port).not.toBe(pair[1].port);
        await writeFile(path.join(pair[0].root, ".copy-only"), "mutation");
        await expect(access(path.join(pair[1].root, ".copy-only"))).rejects.toThrow();
        await expect(access(path.join(root, ".copy-only"))).rejects.toThrow();
      }
    } finally {
      await Promise.all(copies.map((copy) => copy.cleanup()));
    }
    await expect(Promise.all(roots.map(snapshotTree))).resolves.toEqual(before);
  });

  test("P0-07 a read-only mid-setup failure is atomic and leaves the template exact", async () => {
    const template = (await listFixtureRoots()).find((root) => path.basename(root) === "vanilla")!;
    const before = await snapshotTree(template);
    let failedRoot = "";
    await expect(createFixtureCopy(template, {
      async beforeFinalize(root) {
        failedRoot = root;
        await chmod(path.join(root, "style.css"), 0o444);
        throw new Error("injected read-only setup failure");
      },
    })).rejects.toThrow("injected read-only setup failure");
    await expect(access(failedRoot)).rejects.toThrow();
    expect(await snapshotTree(template)).toEqual(before);
  });

  test("P0-08 paths with spaces and Unicode start and stop while LF and CRLF bytes remain exact", async () => {
    const template = (await listFixtureRoots()).find((root) => path.basename(root) === "vanilla")!;
    const copy = await createFixtureCopy(template);
    expect(copy.root).toMatch(/reframe phase0 ü-/u);
    await writeFile(path.join(copy.root, "style.css"), Buffer.from("#card-annual {\r\n  width: 320px;\r\n}\r\n"));
    await writeFile(path.join(copy.root, "script.js"), Buffer.from("document.documentElement.dataset.ready = \"true\";\n"));
    const cssBefore = await readFile(path.join(copy.root, "style.css"));
    const jsBefore = await readFile(path.join(copy.root, "script.js"));
    await copy.releasePort();
    const staticServer = path.join(projectRoot, "tests", "fixtures", "processes", "static-server.mjs");
    const server = await startManagedProcess({
      executable: process.execPath,
      args: [staticServer, copy.root, String(copy.port)],
      cwd: projectRoot,
      readyUrl: `http://127.0.0.1:${copy.port}/`,
      port: copy.port,
    });
    try {
      expect((await fetch(`http://127.0.0.1:${copy.port}/`)).status).toBe(200);
    } finally {
      await server.stop();
      expect(await readFile(path.join(copy.root, "style.css"))).toEqual(cssBefore);
      expect(await readFile(path.join(copy.root, "script.js"))).toEqual(jsBefore);
      await copy.cleanup();
    }
  });
});
