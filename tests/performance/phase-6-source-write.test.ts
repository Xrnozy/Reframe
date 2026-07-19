import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createSourceEditor } from "../../packages/dev-server/src/index.js";
import { projectRoot } from "../helpers/paths.js";

const owned: string[] = [];
const samples = 40;
const percentile = (values: number[], value: number) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.ceil(values.length * value) - 1)]!;
const request = { fingerprint: { tag: "article", id: "pricing-card", classes: [], text: "Annual", parent: null, route: "/", viewport: { width: 1280, height: 720 } }, currentWidth: 320, width: 420 } as const;

async function fixture(): Promise<string> {
  const base = path.join(projectRoot, "test-results", "phase6-performance");
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(path.join(base, "sample-"));
  owned.push(root);
  await writeFile(path.join(root, "style.css"), "#pricing-card { width: 320px; }\n");
  return root;
}

afterAll(async () => Promise.all(owned.map((root) => rm(root, { recursive: true, force: true }))));

describe("Phase 6 performance observations", () => {
  it("P6-24 records mapping/planning and atomic-write p50/p95 without inventing a hard gate", async () => {
    const mapping: number[] = [];
    const writing: number[] = [];
    for (let index = 0; index < samples; index += 1) {
      const root = await fixture();
      const editor = createSourceEditor({ projectRoot: root, framework: "vanilla", verify: () => true });
      const mappingStarted = performance.now();
      const plan = (await editor.mapWidth(request)).plan;
      mapping.push(performance.now() - mappingStarted);
      expect(plan).toBeDefined();
      const writingStarted = performance.now();
      expect((await editor.applyPlan(plan!)).status).toBe("applied");
      writing.push(performance.now() - writingStarted);
    }
    const metrics = {
      samples,
      environment: `${process.platform} ${process.arch} Node ${process.version}`,
      mappingPlanningMs: { p50: percentile(mapping, .5), p95: percentile(mapping, .95), budgetP95: 500, gate: "observability-only" },
      atomicWriteMs: { p50: percentile(writing, .5), p95: percentile(writing, .95), budgetP95: 100, gate: "observability-only" },
      verificationDeadlineMs: { value: 10_000, gate: "functional rollback deadline", evidence: "P6-18" },
    };
    console.log(`PHASE6_PERFORMANCE ${JSON.stringify(metrics)}`);
    expect(metrics.mappingPlanningMs.p95).toBeGreaterThanOrEqual(0);
    expect(metrics.atomicWriteMs.p95).toBeGreaterThanOrEqual(0);
  });
});

