import { access } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { createFixtureCopy } from "../helpers/fixture-copy.js";
import { listFixtureRoots } from "../helpers/fixture-manifest.js";
import { canBind } from "../helpers/port-probe.js";

function percentile(samples: number[], fraction: number): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)]!;
}

describe("Phase 0 fixture performance observations", () => {
  test("P0-11 records p50/p95 for 20 setup-plus-cleanup samples and leaves no fixture or reserved port", async () => {
    const template = (await listFixtureRoots()).find((root) => path.basename(root) === "vanilla")!;
    const samples: number[] = [];
    for (let index = 0; index < 20; index += 1) {
      const started = performance.now();
      const copy = await createFixtureCopy(template);
      const { root, port } = copy;
      await copy.cleanup();
      samples.push(performance.now() - started);
      await expect(access(root)).rejects.toThrow();
      expect(await canBind(port)).toBe(true);
    }
    const result = {
      testId: "P0-11",
      samples: samples.length,
      unit: "ms",
      p50: Number(percentile(samples, 0.5).toFixed(2)),
      p95: Number(percentile(samples, 0.95).toFixed(2)),
      maximum: Number(Math.max(...samples).toFixed(2)),
      budgetP95: 2000,
      gate: "observability-only",
    };
    process.stdout.write(`PHASE0_PERFORMANCE ${JSON.stringify(result)}\n`);
    expect(samples).toHaveLength(20);
    expect(samples.every(Number.isFinite)).toBe(true);
  });
});
