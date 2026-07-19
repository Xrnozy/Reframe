import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { detectProject } from "../../packages/dev-server/src/project.js";
import { DEFAULT_DEV_SERVER_DEADLINE_MS, startProject } from "../../packages/dev-server/src/project-runtime.js";
import { createFixtureCopy, type FixtureCopy } from "../helpers/fixture-copy.js";
import { fixtureTemplatesRoot } from "../helpers/paths.js";

function percentile(samples: number[], value: number): number {
  const sorted = [...samples].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * value) - 1]!;
}

describe("Phase 2 detection and readiness performance", () => {
  let vanilla: FixtureCopy;
  let react: FixtureCopy;

  beforeAll(async () => {
    vanilla = await createFixtureCopy(path.join(fixtureTemplatesRoot, "vanilla"));
    react = await createFixtureCopy(path.join(fixtureTemplatesRoot, "react-plain-css"), { beforeFinalize: (root) => writeFile(path.join(root, "package-lock.json"), "{}\n") });
    await vanilla.releasePort();
    await react.releasePort();
  });

  afterAll(async () => { await Promise.all([vanilla.cleanup(), react.cleanup()]); });

  it("P2-18 measures detection and readiness separately with p50/p95, finite ceiling, and progress", async () => {
    await detectProject(vanilla.root);
    const detection: number[] = [];
    for (let sample = 0; sample < 20; sample += 1) {
      const started = performance.now();
      await detectProject(sample % 2 === 0 ? vanilla.root : react.root);
      detection.push(performance.now() - started);
    }

    const descriptor = await detectProject(vanilla.root);
    const warm = await startProject(descriptor);
    await warm.stop();
    const readiness: number[] = [];
    const progress: string[] = [];
    for (let sample = 0; sample < 20; sample += 1) {
      const started = performance.now();
      const runtime = await startProject(descriptor, { onProgress: (message) => progress.push(message) });
      readiness.push(performance.now() - started);
      await runtime.stop();
    }

    const observation = {
      samples: 20,
      detectionP50Ms: Number(percentile(detection, 0.5).toFixed(2)),
      detectionP95Ms: Number(percentile(detection, 0.95).toFixed(2)),
      readinessP50Ms: Number(percentile(readiness, 0.5).toFixed(2)),
      readinessP95Ms: Number(percentile(readiness, 0.95).toFixed(2)),
      detectionBudgetMs: 500,
      readinessCeilingMs: DEFAULT_DEV_SERVER_DEADLINE_MS,
      platform: `${process.platform}-${process.arch}`,
      node: process.versions.node,
      cpus: os.cpus().length,
    };
    process.stdout.write(`PHASE2_PERFORMANCE ${JSON.stringify(observation)}\n`);
    expect(detection).toHaveLength(20);
    expect(readiness).toHaveLength(20);
    expect(DEFAULT_DEV_SERVER_DEADLINE_MS).toBe(30_000);
    expect(progress.filter((message) => message.startsWith("Development server ready at"))).toHaveLength(20);
    expect(Object.values(observation).every((value) => typeof value !== "number" || Number.isFinite(value))).toBe(true);
  });
});
