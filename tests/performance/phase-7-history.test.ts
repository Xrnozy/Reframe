import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, expect, it } from "vitest";
import { createHistoryStore, type CheckpointInput, type EditPlan, type WidthEditRequest } from "../../packages/dev-server/src/index.js";
import { projectRoot } from "../helpers/paths.js";

const owned: string[] = [];
const percentile = (values: number[], value: number) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.ceil(values.length * value) - 1)]!;
const hash = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");

afterAll(async () => Promise.all(owned.map((directory) => rm(directory, { recursive: true, force: true, maxRetries: 20, retryDelay: 20 }))));

it("P7-17 records checkpoint and restore p50/p95 for 1, 10, and 50 files", async () => {
  const observations: Array<{ files: number; createMs: number[]; restoreMs: number[] }> = [];
  for (const count of [1, 10, 50]) {
    const createMs: number[] = [];
    const restoreMs: number[] = [];
    for (let sample = 0; sample < 5; sample += 1) {
      const base = path.join(projectRoot, "test-results", "phase7-performance");
      await mkdir(base, { recursive: true });
      const root = await mkdtemp(path.join(base, `${count}-`));
      owned.push(root);
      const files = await Promise.all(Array.from({ length: count }, async (_, index) => {
        const relativePath = `src/file-${index}.css`;
        const beforeBytes = Buffer.from(`.item-${index} { width: 320px; }\n`);
        const afterBytes = Buffer.from(`.item-${index} { width: 420px; }\n`);
        const target = path.join(root, relativePath);
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, beforeBytes);
        return { relativePath, beforeBytes, afterBytes, mode: (await stat(target)).mode, range: { start: 0, end: beforeBytes.length } };
      }));
      const first = files[0]!;
      const plan: EditPlan = { relativePath: first.relativePath, range: first.range, sourceIdentity: `performance:${count}`, route: "/", expectedHash: hash(first.beforeBytes), before: first.beforeBytes.toString(), after: first.afterBytes.toString(), stylingMode: "vanilla-css", confidence: "exact", evidence: "Phase 7 performance fixture", impact: { shared: count > 1, locations: files.map((file) => file.relativePath) }, allowedChangedFiles: files.map((file) => file.relativePath) };
      const request: WidthEditRequest = { fingerprint: { tag: "article", id: "item", classes: [], text: "", parent: null, route: "/", viewport: { width: 1280, height: 720 } }, currentWidth: 320, width: 420 };
      const history = createHistoryStore({ projectRoot: root });
      const input: CheckpointInput = { files, plan, request, preflight: await history.prepareEdit(plan, request), verificationMs: 0 };
      const createStarted = performance.now();
      await history.createCheckpoint(input);
      createMs.push(performance.now() - createStarted);
      await Promise.all(files.map((file) => writeFile(path.join(root, file.relativePath), file.afterBytes)));
      const restoreStarted = performance.now();
      await history.restorePrevious();
      restoreMs.push(performance.now() - restoreStarted);
      expect(restoreMs.at(-1)).toBeLessThan(10_000);
    }
    observations.push({ files: count, createMs, restoreMs });
  }
  const report = observations.map((entry) => ({ files: entry.files, samples: entry.createMs.length, createP50Ms: Number(percentile(entry.createMs, .5).toFixed(2)), createP95Ms: Number(percentile(entry.createMs, .95).toFixed(2)), restoreP50Ms: Number(percentile(entry.restoreMs, .5).toFixed(2)), restoreP95Ms: Number(percentile(entry.restoreMs, .95).toFixed(2)) }));
  process.stdout.write(`PHASE7_PERFORMANCE ${JSON.stringify({ platform: process.platform, node: process.version, screenshotExcluded: true, results: report })}\n`);
  expect(report.every((entry) => Number.isFinite(entry.createP95Ms) && entry.restoreP95Ms < 10_000)).toBe(true);
}, 120_000);
