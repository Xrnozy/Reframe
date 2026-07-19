import { afterAll, beforeAll, describe, expect, it } from "vitest";
import os from "node:os";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { installPackedCli, startCommand, type PackedInstall } from "../helpers/packed-cli.js";
import { canBind, reservePort } from "../helpers/port-probe.js";

function percentile(samples: number[], percentileValue: number): number {
  const sorted = [...samples].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * percentileValue) - 1]!;
}

describe("Phase 1 lifecycle performance", () => {
  let install: PackedInstall;

  beforeAll(async () => { install = await installPackedCli("p1-12"); }, 30_000);
  afterAll(async () => { await install.cleanup(); });

  it("P1-12 records warm packed-install health-ready and signal-to-exit p50/p95", async () => {
    const reservation = await reservePort();
    const port = reservation.port;
    await reservation.release();
    const browserSpy = path.join(install.root, "performance-browser-spy.mjs");
    await writeFile(browserSpy, "process.exitCode = 0;");
    const readySamples: number[] = [];
    const shutdownSamples: number[] = [];

    for (let iteration = 0; iteration < 21; iteration += 1) {
      const readyStarted = performance.now();
      const running = await startCommand(
        process.execPath,
        [path.join(install.packageRoot, "dist", "bin.js")],
        install.root,
        port,
        { REFRAME_BROWSER: process.execPath, REFRAME_BROWSER_ARGS: JSON.stringify([browserSpy]) },
      );
      const readyMs = performance.now() - readyStarted;
      const shutdownStarted = performance.now();
      await running.signalAndWait(port);
      const shutdownMs = performance.now() - shutdownStarted;
      expect(await canBind(port)).toBe(true);
      if (iteration > 0) {
        readySamples.push(readyMs);
        shutdownSamples.push(shutdownMs);
      }
    }

    const metrics = {
      samples: readySamples.length,
      readyP50Ms: Number(percentile(readySamples, 0.5).toFixed(2)),
      readyP95Ms: Number(percentile(readySamples, 0.95).toFixed(2)),
      shutdownP50Ms: Number(percentile(shutdownSamples, 0.5).toFixed(2)),
      shutdownP95Ms: Number(percentile(shutdownSamples, 0.95).toFixed(2)),
      budgetMs: 2_000,
      gate: "observability-only",
      platform: `${process.platform}-${process.arch}`,
      node: process.versions.node,
      cpus: os.cpus().length,
    };
    process.stdout.write(`P1-12_METRICS ${JSON.stringify(metrics)}\n`);
    expect(metrics.samples).toBe(20);
  }, 60_000);
});
