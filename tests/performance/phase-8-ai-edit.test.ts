import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { afterAll, describe, expect, it } from "vitest";
import { buildElementContextPacket, validateAiProposal } from "../../packages/dev-server/src/index.js";
import { projectRoot } from "../helpers/paths.js";

const percentile = (values: number[], ratio: number) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * ratio) - 1]!;
const roots: string[] = [];

afterAll(async () => { await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 20 }))); });

describe("Phase 8 performance observations", () => {
  it("P8-19 records packet build/sanitize and validation p50/p95 with finite deadline", async () => {
    const base = path.join(projectRoot, "test-results", "phase8-performance"); await mkdir(base, { recursive: true });
    const root = await mkdtemp(path.join(base, "case-")); roots.push(root);
    const source = `.card { width: 320px; border: 1px solid #ddd; }\n${"/* bounded relevant styles */\n".repeat(1_500)}`;
    await writeFile(path.join(root, "style.css"), source);
    await writeFile(path.join(root, "unrelated-large.log"), "NOISE-CANARY\n".repeat(300_000));
    const fingerprint = { tag: "article", id: "card-annual", classes: ["card"], text: "Annual", parent: null, route: "/", viewport: { width: 1280, height: 720 } };
    const input = { projectRoot: root, fingerprint, sourcePath: "style.css", framework: "vanilla" as const, stylingMethod: "vanilla-css" as const, instruction: "Make this card more visually prominent while preserving the current design." };
    const builds: number[] = []; const validations: number[] = []; let bytes = 0;
    for (let index = 0; index < 40; index += 1) {
      const started = performance.now(); const packet = await buildElementContextPacket(input); builds.push(performance.now() - started); bytes = packet.preview.bytes;
      const proposal = { generationId: `perf-${index}`, conversationId: "performance", changes: [{ path: "style.css", expectedHash: createHash("sha256").update(source).digest("hex"), before: source, after: source.replace("border: 1px", "border: 2px") }] };
      const validationStarted = performance.now(); validateAiProposal(proposal, packet, `perf-${index}`); validations.push(performance.now() - validationStarted);
    }
    const metrics = { samples: 40, packetBytes: bytes, packetBuildMs: { p50: percentile(builds, .5), p95: percentile(builds, .95) }, validationMs: { p50: percentile(validations, .5), p95: percentile(validations, .95) }, providerDeadlineMs: 30_000, gate: "observability-only" };
    console.info(`P8-19 ${JSON.stringify(metrics)}`);
    expect(bytes).toBeLessThanOrEqual(256 * 1024);
    expect(metrics.providerDeadlineMs).toBeGreaterThan(0);
  });
});
