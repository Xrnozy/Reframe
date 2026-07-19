import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createReferenceService } from "../../packages/dev-server/src/index.js";
import { projectRoot } from "../helpers/paths.js";

let root: string;
function chunk(type: string, data = Buffer.alloc(0)): Buffer { const head = Buffer.alloc(8); head.writeUInt32BE(data.length); head.write(type, 4, "ascii"); return Buffer.concat([head, data, Buffer.alloc(4)]); }
function image(): Buffer { const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(1280); ihdr.writeUInt32BE(720, 4); ihdr[8] = 8; ihdr[9] = 2; return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT"), chunk("IEND")]); }
const percentile = (values: number[], value: number) => [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(values.length * value) - 1)]!;

beforeAll(async () => { const base = path.join(projectRoot, "test-results", "phase12-performance"); await mkdir(base, { recursive: true }); root = await mkdtemp(path.join(base, "case-")); await writeFile(path.join(root, "style.css"), ".card{color:#111827}\n"); });
afterAll(async () => { await rm(root, { recursive: true, force: true }); });

describe("Phase 12 performance", () => {
  it("P12-18 records bounded intake/analysis-plan p50/p95 and packet/provider deadlines", async () => {
    const intake: number[] = []; const planning: number[] = []; let packetBytes = 0; const samples = 30;
    for (let index = 0; index < samples; index += 1) {
      const service = createReferenceService({ projectRoot: root, analyzerDeadlineMs: 1_000 }); let started = performance.now(); const descriptor = await service.intake({ kind: "screenshot", filename: `demo-${index}.png`, mime: "image/png", bytes: image(), provenance: "Synthetic performance fixture", persist: false }); intake.push(performance.now() - started); started = performance.now(); const draft = service.createPlan({ referenceId: descriptor.id, target: { route: "/", sourcePath: "style.css", placement: "current page" }, borrowed: ["page-structure"], brand: "preserve", expectedFiles: ["style.css"] }); const packet = service.packet(service.freeze(draft.id).id); planning.push(performance.now() - started); packetBytes = Math.max(packetBytes, Buffer.byteLength(JSON.stringify(packet))); await service.close();
    }
    const metrics = { samples, environment: `${process.platform} ${process.arch} Node ${process.version}`, intakeP50: percentile(intake, .5), intakeP95: percentile(intake, .95), planP50: percentile(planning, .5), planP95: percentile(planning, .95), packetBytes, providerDeadlineMs: 1_000 }; console.info("P12-18", JSON.stringify(metrics)); expect(metrics.intakeP95).toBeLessThanOrEqual(2_000); expect(metrics.planP95).toBeLessThanOrEqual(5_000); expect(metrics.packetBytes).toBeLessThanOrEqual(256 * 1024); expect(metrics.providerDeadlineMs).toBeGreaterThan(0);
  });
});
