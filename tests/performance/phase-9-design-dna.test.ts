import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, expect, it } from "vitest";
import { analyzeDesignDna } from "../../packages/dev-server/src/index.js";
import { projectRoot } from "../helpers/paths.js";

const owned: string[] = [];
afterAll(async () => { await Promise.all(owned.map((item) => rm(item, { recursive: true, force: true, maxRetries: 20, retryDelay: 20 }))); });
const percentile = (values: number[], ratio: number) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * ratio) - 1]!;

it("P9-15 records demo p50/p95 and keeps large analysis incremental and cancellable", async () => {
  const base = path.join(projectRoot, "test-results", "phase9-performance"); await mkdir(base, { recursive: true }); const demo = await mkdtemp(path.join(base, "demo-")); owned.push(demo); await cp(path.join(projectRoot, "demo", "vanilla-demo"), demo, { recursive: true });
  const samples: number[] = []; for (let index = 0; index < 10; index += 1) { const started = performance.now(); await analyzeDesignDna(demo); samples.push(performance.now() - started); }
  const large = await mkdtemp(path.join(base, "large-")); owned.push(large); for (let index = 0; index < 300; index += 1) await writeFile(path.join(large, `theme-${index}.css`), `.a${index}{color:#5b45d6;padding:16px;border-radius:12px}.b${index}{color:#5b45d6;padding:16px;border-radius:12px}`);
  let responsiveTicks = 0; const timer = setInterval(() => { responsiveTicks += 1; }, 0); const largeStarted = performance.now(); const preview = await analyzeDesignDna(large); const largeMs = performance.now() - largeStarted; clearInterval(timer);
  const controller = new AbortController(); controller.abort(); const cancelled = await analyzeDesignDna(large, { signal: controller.signal }).then(() => false, (error) => String(error).includes("ANALYSIS_CANCELLED"));
  const metrics = { samples: samples.length, p50: percentile(samples, .5), p95: percentile(samples, .95), largeMs, files: preview.analyzedFiles.length, responsiveTicks }; console.log(`P9-15 ${JSON.stringify(metrics)}`);
  expect(metrics.p95).toBeLessThan(30_000); expect(preview.analyzedFiles).toHaveLength(300); expect(responsiveTicks).toBeGreaterThan(0); expect(cancelled).toBe(true);
});
