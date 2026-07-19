import { afterAll, beforeAll, expect, it } from "vitest";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createAnnotationStore } from "../../packages/dev-server/src/annotations.js";

let root = "";
const percentile = (values: number[], ratio: number) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * ratio) - 1]!;

beforeAll(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "reframe-phase11-performance-"));
  await writeFile(path.join(root, "index.html"), '<article class="card annual"><h2>Annual</h2></article>\n');
  const annotations = createAnnotationStore(root, { createId: (() => { let index = 0; return () => `10000000-0000-4000-8000-${String(++index).padStart(12, "0")}`; })() });
  for (let index = 0; index < 1_000; index += 1) await annotations.create({ author: "Performance fixture", component: "AnnualCard", fingerprint: { tag: "article", id: null, classes: ["card", "annual"], text: "Annual", parent: null, route: `/route-${index % 20}`, viewport: { width: 1280, height: 720 } }, source: { path: "index.html", line: 1, evidence: "exact source metadata" }, route: `/route-${index % 20}`, viewport: { width: 1280, height: 720 }, comment: `Comment ${index}`, anchorConfidence: "exact" });
  await annotations.close();
}, 60_000);
afterAll(async () => { await rm(root, { recursive: true, force: true }); });

it("P11-17 parses and indexes 1,000 annotations within one second p95 and coalesces a 100-file burst", async () => {
  const annotations = createAnnotationStore(root, { watcherDebounceMs: 100 });
  await annotations.load({ route: "/route-0" });
  const samples: number[] = [];
  for (let sample = 0; sample < 7; sample += 1) { const started = performance.now(); const state = await annotations.load({ route: "/route-0" }); samples.push(performance.now() - started); expect(state).toMatchObject({ parsedFiles: 1_000, renderedForRoute: 50 }); expect(state.annotations).toHaveLength(50); }
  const p50 = percentile(samples, .5); const p95 = percentile(samples, .95); expect(p95).toBeLessThanOrEqual(1_000);
  let callbacks = 0; let resolveFinal!: () => void; const final = new Promise<void>((resolve) => { resolveFinal = resolve; }); const stop = await annotations.subscribe((state) => { callbacks += 1; if (state.annotations.filter((item) => item.annotation?.comment.startsWith("Burst ")).length === 100) resolveFinal(); });
  const folder = path.join(root, ".reframe", "annotations"); const files = (await readdir(folder)).filter((name) => name.endsWith(".json")).slice(0, 100); await Promise.all(files.map(async (name, index) => { const file = path.join(folder, name); const value = JSON.parse(await readFile(file, "utf8")); value.comment = `Burst ${index}`; value.updatedAt = "2026-07-17T13:00:00.000Z"; await writeFile(file, `${JSON.stringify(value, null, 2)}\n`); }));
  await Promise.race([final, new Promise((_, reject) => setTimeout(() => reject(new Error("WATCH_BURST_TIMEOUT")), 5_000))]); stop(); await annotations.close(); expect(callbacks).toBeLessThanOrEqual(2); console.log("P11-17", JSON.stringify({ samples: samples.length, p50Ms: Number(p50.toFixed(2)), p95Ms: Number(p95.toFixed(2)), parsed: 1_000, renderedForRoute: 50, watcherCallbacks: callbacks, burstFiles: 100 }));
}, 30_000);
