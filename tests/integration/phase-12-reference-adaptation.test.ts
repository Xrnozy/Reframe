import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AiEditError, ReferenceError, buildElementContextPacket, createAiEditRunner, createFakeCodexProvider, createHistoryStore, createReferenceService, type AdaptationPlan, type ContextPacket, type ContextPacketInput, type DesignDnaContext, type ReferencePacketContext } from "../../packages/dev-server/src/index.js";
import { projectRoot } from "../helpers/paths.js";

const owned: string[] = [];
const fingerprint = { tag: "article", id: "card-annual", classes: ["card", "annual"], text: "Annual", parent: { tag: "section", id: "pricing", classes: ["cards"] }, route: "/", viewport: { width: 1280, height: 720 } };
const dna: DesignDnaContext = { version: "dna-v1", fingerprint: "dna-hash", findings: [{ category: "color", value: "#111827", evidence: [{ path: "style.css", line: 1, snippet: "#111827" }] }], components: [{ name: "Card", path: "index.html" }] };
let root: string;
let before: string;

function chunk(type: string, data = Buffer.alloc(0)): Buffer { const head = Buffer.alloc(8); head.writeUInt32BE(data.length); head.write(type, 4, "ascii"); return Buffer.concat([head, data, Buffer.alloc(4)]); }
function image(width = 1280, height = 720, metadata?: string): Buffer { const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2; return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), ...(metadata ? [chunk("tEXt", Buffer.from(metadata))] : []), chunk("IDAT"), chunk("IEND")]); }
const digest = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex");
const input = (extra: Partial<ContextPacketInput> = {}): ContextPacketInput => ({ projectRoot: root, fingerprint, sourcePath: "style.css", framework: "vanilla", stylingMethod: "vanilla-css", instruction: "Adapt only the approved structure while preserving the project brand.", classes: fingerprint.classes, designDna: dna, ...extra });

async function screenshotReference(service = createReferenceService({ projectRoot: root }), options: { kind?: "screenshot" | "hand-drawn" | "site-screenshot"; bytes?: Buffer; persist?: boolean } = {}) {
  const descriptor = await service.intake({ kind: options.kind ?? "screenshot", filename: "dashboard.png", mime: "image/png", bytes: options.bytes ?? image(), provenance: "Synthetic licensed dashboard fixture", persist: options.persist ?? false });
  return { service, descriptor };
}

function draft(service: ReturnType<typeof createReferenceService>, referenceId: string, extra: Partial<Parameters<typeof service.createPlan>[0]> = {}): AdaptationPlan {
  return service.createPlan({ referenceId, target: { route: "/", sourcePath: "style.css", placement: "Current page pricing region" }, borrowed: ["page-structure", "component-arrangement"], brand: "preserve", reuse: ["Card"], newComponents: [], expectedFiles: ["style.css"], designDna: dna, ...extra });
}

async function frozenReference(options: { borrowed?: Parameters<ReturnType<typeof createReferenceService>["createPlan"]>[0]["borrowed"]; confirmUnknown?: boolean } = {}): Promise<{ service: ReturnType<typeof createReferenceService>; context: ReferencePacketContext }> {
  const { service, descriptor } = await screenshotReference(); const plan = draft(service, descriptor.id, { borrowed: options.borrowed ?? ["page-structure", "component-arrangement"], confirmUnknown: options.confirmUnknown }); return { service, context: service.packet(service.freeze(plan.id).id) };
}

beforeEach(async () => { const base = path.join(projectRoot, "test-results", "phase12-fixtures"); await mkdir(base, { recursive: true }); root = await mkdtemp(path.join(base, "case-")); owned.push(root); before = ".card { color: #111827; border: 1px solid #111827; border-radius: var(--radius); }\n"; await writeFile(path.join(root, "style.css"), before); });
afterEach(async () => { await Promise.all(owned.splice(0).map((directory) => rm(directory, { recursive: true, force: true, maxRetries: 20, retryDelay: 20 }))); });

describe("Phase 12 reference adaptation", () => {
  it("P12-01 borrows only selected screenshot structure while Preserve DNA remains authoritative", async () => {
    const { service, descriptor } = await screenshotReference(); const plan = service.freeze(draft(service, descriptor.id).id); const packet = service.packet(plan.id);
    expect(plan).toMatchObject({ borrowed: ["page-structure", "component-arrangement"], brand: "preserve", reuse: ["Card"], designDnaVersion: "dna-v1" });
    expect(plan.preserved).toEqual(expect.arrayContaining(["colors", "typography", "content-density"])); expect(packet.evidence).toHaveProperty("page-structure"); expect(packet.evidence).not.toHaveProperty("colors"); expect(packet).not.toHaveProperty("rawBytes"); await service.close();
  });

  it("P12-02 sanitizes Markdown and sends only the selected density/navigation evidence", async () => {
    const service = createReferenceService({ projectRoot: root }); const raw = "# Navigation\r\nUse compact tabs.\r\n<!-- SECRET-COMMENT -->\r\nhttps://tracker.invalid/id\r\n# Content density\r\nDense rows.";
    const descriptor = await service.intake({ kind: "markdown", filename: "design.md", mime: "text/markdown", bytes: Buffer.from(raw), provenance: "Licensed written spec", persist: false }); const plan = service.freeze(draft(service, descriptor.id, { borrowed: ["content-density", "navigation-pattern"] }).id); const packet = service.packet(plan.id); const serialized = JSON.stringify(packet);
    expect(Object.keys(packet.evidence)).toEqual(["content-density", "navigation-pattern"]); expect(packet.selectedExcerpt).toContain("Dense rows"); expect(serialized).not.toContain("SECRET-COMMENT"); expect(serialized).not.toContain("tracker.invalid"); await service.close();
  });

  it("P12-03 uses an approved DNA reference by ID/version without duplicating an asset", async () => {
    const service = createReferenceService({ projectRoot: root }); const descriptor = await service.approvedDna({ id: "approved-dashboard", version: "dna-v1", provenance: "Approved project reference", designDna: dna }); const plan = service.freeze(draft(service, descriptor.id).id); const packet = service.packet(plan.id);
    expect(descriptor).toMatchObject({ format: "design-dna", retention: "approved-dna", approvedDna: { id: "approved-dashboard", version: "dna-v1" } }); expect(descriptor.localPath).toBeUndefined(); expect(packet.plan.designDnaVersion).toBe("dna-v1"); expect(packet).not.toHaveProperty("bytes"); await service.close();
  });

  it("P12-04 keeps hand-sketch interaction/responsive evidence Unknown and requires confirmation", async () => {
    const { service, descriptor } = await screenshotReference(createReferenceService({ projectRoot: root }), { kind: "hand-drawn", bytes: image(120, 80) });
    expect(descriptor.evidence["interaction-behavior"].confidence).toBe("unknown"); expect(descriptor.evidence["responsive-behavior"].confidence).toBe("unknown"); expect(descriptor.evidence["page-structure"].confidence).toBe("low");
    expect(() => draft(service, descriptor.id, { borrowed: ["responsive-behavior"] })).toThrowError("REFERENCE_UNCERTAINTY_CONFIRMATION_REQUIRED"); expect(draft(service, descriptor.id, { borrowed: ["responsive-behavior"], confirmUnknown: true }).uncertainties).toHaveLength(1); await service.close();
  });

  it("P12-05 bounds a large image, records metadata removal, and stays under packet budget", async () => {
    const { service, descriptor } = await screenshotReference(createReferenceService({ projectRoot: root }), { bytes: image(6_000, 6_000, "Author=CANARY; URL=https://tracker.invalid") }); const plan = service.freeze(draft(service, descriptor.id).id); const packet = service.packet(plan.id);
    expect(descriptor.dimensions).toEqual({ width: 6_000, height: 6_000 }); expect(descriptor.transformations).toContain("stripped ancillary PNG metadata"); expect(Buffer.byteLength(JSON.stringify(packet))).toBeLessThanOrEqual(256 * 1024); expect(JSON.stringify(packet)).not.toContain("tracker.invalid"); await service.close();
  });

  it.each([
    ["spoofed MIME", { kind: "screenshot", filename: "x.png", mime: "image/png", bytes: Buffer.from("not png") }, "REFERENCE_MIME_SPOOFED"],
    ["corrupt Figma", { kind: "figma-export", filename: "x.json", mime: "application/json", bytes: Buffer.from("{") }, "REFERENCE_FIGMA_CORRUPT"],
    ["password PDF", { kind: "screenshot", filename: "x.pdf", mime: "application/pdf", bytes: Buffer.from("%PDF-1.7 /Encrypt") }, "REFERENCE_DOCUMENT_PASSWORD_PROTECTED"],
    ["active SVG", { kind: "screenshot", filename: "x.svg", mime: "image/svg+xml", bytes: Buffer.from("<svg><script>alert(1)</script></svg>") }, "REFERENCE_ACTIVE_SVG"],
    ["archive", { kind: "screenshot", filename: "x.zip", mime: "application/zip", bytes: Buffer.from([0x50, 0x4b, 0x03, 0x04]) }, "REFERENCE_ARCHIVE_UNSUPPORTED"],
  ])("P12-06 rejects %s before persistence/provider/source mutation", async (_name, fixture, code) => {
    const service = createReferenceService({ projectRoot: root }); await expect(service.intake({ ...fixture, provenance: "Hostile fixture", persist: true } as Parameters<typeof service.intake>[0])).rejects.toThrowError(code); expect(await readFile(path.join(root, "style.css"), "utf8")).toBe(before); await expect(readFile(path.join(root, ".reframe", "references", "missing"))).rejects.toThrow(); await service.close();
  });

  it("P12-07 names missing decisions and forbids generation without a frozen approved plan", async () => {
    const { service, descriptor } = await screenshotReference(); expect(() => service.createPlan({ referenceId: descriptor.id, target: { route: "", sourcePath: "", placement: "" }, borrowed: [], brand: "" as "preserve", expectedFiles: [] })).toThrowError("REFERENCE_PLAN_MISSING:target/placement, borrowing choice, brand treatment, expected files"); const plan = draft(service, descriptor.id); expect(() => service.packet(plan.id)).toThrowError("REFERENCE_PLAN_NOT_FROZEN"); expect(await readFile(path.join(root, "style.css"), "utf8")).toBe(before); await service.close();
  });

  it("P12-08 omits copy canaries from packets and blocks literal provider transfer", async () => {
    const raw = "# Layout\nlogo: ORBIT-CANARY-LOGO\nbrand: ACME-CANARY\ntracking_id=TRACK-CANARY-77\nhttps://assets.invalid/private.png\nmarketing copy: BUY-CANARY-NOW"; const service = createReferenceService({ projectRoot: root }); const descriptor = await service.intake({ kind: "markdown", filename: "canary.md", mime: "text/markdown", bytes: Buffer.from(raw), provenance: "Security fixture", persist: false }); const plan = service.freeze(draft(service, descriptor.id, { borrowed: ["page-structure"] }).id); const serialized = JSON.stringify(service.packet(plan.id));
    for (const canary of ["ORBIT-CANARY-LOGO", "ACME-CANARY", "TRACK-CANARY-77", "assets.invalid", "BUY-CANARY-NOW"]) expect(serialized).not.toContain(canary); expect(() => service.copyGuard(plan.id, [".card{content:'brand: ACME-CANARY'}"])).toThrowError("REFERENCE_COPY_GUARD"); await service.close();
  });

  it("P12-09 strips private metadata, rejects traversal/symlink intake, and confines persistence", async () => {
    const service = createReferenceService({ projectRoot: root }); await expect(service.intake({ kind: "screenshot", filename: "../escape.png", mime: "image/png", bytes: image(), provenance: "x", persist: true })).rejects.toThrowError("REFERENCE_FILENAME_INVALID");
    const descriptor = await service.intake({ kind: "screenshot", filename: "safe.png", mime: "image/png", bytes: image(100, 100, "GPS=1,2 Author=PRIVATE-CANARY URL=https://private.invalid"), provenance: "User supplied", persist: true }); expect(descriptor.localPath).toMatch(/^\.reframe\/references\/[a-f\d-]+\.png$/); expect(JSON.stringify(descriptor)).not.toContain("PRIVATE-CANARY");
    const outside = path.join(root, "outside-dir"); const link = path.join(root, "outside-link"); await mkdir(outside); await writeFile(path.join(outside, "outside.png"), image()); await symlink(outside, link, "junction"); await expect(service.intakePath({ kind: "screenshot", sourcePath: link, filename: "link.png", mime: "image/png", provenance: "x", persist: false })).rejects.toThrowError("REFERENCE_PATH_UNSAFE"); await service.close();
  });

  it("P12-10 analyzer timeout leaves incomplete evidence, untouched source, and an unfreezable plan", async () => {
    const service = createReferenceService({ projectRoot: root, analyzerDeadlineMs: 10, analyzer: async () => new Promise(() => undefined) }); const descriptor = await service.intake({ kind: "screenshot", filename: "slow.png", mime: "image/png", bytes: image(), provenance: "Timeout fixture", persist: false }); expect(descriptor.analysis).toEqual({ status: "incomplete", code: "REFERENCE_ANALYZER_TIMEOUT" }); const plan = draft(service, descriptor.id, { confirmUnknown: true }); expect(() => service.freeze(plan.id)).toThrowError("REFERENCE_ANALYSIS_INCOMPLETE"); expect(await readFile(path.join(root, "style.css"), "utf8")).toBe(before); await service.close();
  });

  it("P12-11 provider failure, Stop, stale source, and verification failure preserve exact pre-adaptation source", async () => {
    const { service, context } = await frozenReference(); const failed = createAiEditRunner({ projectRoot: root, provider: createFakeCodexProvider(async () => { throw new AiEditError("PROVIDER_UNAVAILABLE"); }) }); expect(await failed.generate({ ...input({ reference: context }), generationId: "p12-11-fail" })).toMatchObject({ status: "failed", code: "PROVIDER_UNAVAILABLE" }); expect(await readFile(path.join(root, "style.css"), "utf8")).toBe(before);
    const provider = createFakeCodexProvider(async (packet, run) => ({ generationId: run.generationId, conversationId: run.conversationId, changes: [{ path: packet.source.path, expectedHash: packet.source.hash, before: packet.source.snippet, after: packet.source.snippet.replace("border: 1px", "border: 2px") }] })); const verifier = createAiEditRunner({ projectRoot: root, provider, verify: async (stage) => stage !== "temporary" }); expect(await verifier.generate({ ...input({ reference: context }), generationId: "p12-11-verify" })).toMatchObject({ status: "failed", code: "TEMPORARY_VERIFICATION_FAILED" }); expect(await readFile(path.join(root, "style.css"), "utf8")).toBe(before); await service.close();
  });

  it("P12-12 Preserve mode blocks new font/radius and never mutates Design DNA", async () => {
    const { service, context } = await frozenReference(); const provider = createFakeCodexProvider(async (packet, run) => ({ generationId: run.generationId, conversationId: run.conversationId, changes: [{ path: packet.source.path, expectedHash: packet.source.hash, before: packet.source.snippet, after: packet.source.snippet + "\n.card{font-family:ReferenceSans;border-radius:22px}" }] })); const history = createHistoryStore({ projectRoot: root }); const runner = createAiEditRunner({ projectRoot: root, provider, history, verify: async () => true, verifyResponsive: async (_route, widths) => widths.map((width) => ({ width, passed: true, findings: [] })) }); const review = await runner.generate({ ...input({ reference: context }), generationId: "p12-12" }); expect(review.code).toBe("DESIGN_DNA_CONFLICT"); await expect(runner.accept("p12-12")).resolves.toMatchObject({ status: "accepted" }); await expect(readFile(path.join(root, ".reframe", "design-dna", "tokens.json"))).rejects.toThrow(); await service.close();
  });

  it("P12-13 blocks acceptance on disclosed mobile/tablet/desktop overflow and never claims static responsive proof", async () => {
    const { service, context } = await frozenReference(); const provider = createFakeCodexProvider(async (packet, run) => ({ generationId: run.generationId, conversationId: run.conversationId, changes: [{ path: packet.source.path, expectedHash: packet.source.hash, before: packet.source.snippet, after: packet.source.snippet.replace("border: 1px", "border: 2px") }] })); const history = createHistoryStore({ projectRoot: root }); const runner = createAiEditRunner({ projectRoot: root, provider, history, verify: async () => true, verifyResponsive: async (_route, widths) => widths.map((width) => ({ width, passed: width !== 375, findings: width === 375 ? ["horizontal overflow 20px"] : [] })) }); const review = await runner.generate({ ...input({ reference: context }), generationId: "p12-13" }); expect(review.responsive?.map((item) => item.width)).toEqual([375, 768, 1280]); expect(review.code).toBe("RESPONSIVE_VERIFICATION_FAILED"); expect(context.evidence["responsive-behavior"]).toBeUndefined(); await expect(runner.accept("p12-13")).rejects.toThrowError("RESPONSIVE_VERIFICATION_FAILED"); await runner.reject("p12-13"); await service.close();
  });

  it("P12-14 supports Generate -> Compare -> Reject, then Accept with complete reference checkpoint metadata", async () => {
    const { service, context } = await frozenReference(); const provider = createFakeCodexProvider(async (packet, run) => ({ generationId: run.generationId, conversationId: run.conversationId, changes: [{ path: packet.source.path, expectedHash: packet.source.hash, before: packet.source.snippet, after: packet.source.snippet.replace("border: 1px", "border: 3px") }] })); const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.from("phase12-IEND-image")]); const history = createHistoryStore({ projectRoot: root, captureScreenshot: async () => png }); const runner = createAiEditRunner({ projectRoot: root, provider, history, verify: async () => true, verifyResponsive: async (_route, widths) => widths.map((width) => ({ width, passed: true, findings: [] })) });
    await runner.generate({ ...input({ reference: context }), generationId: "p12-14-reject" }); const temporary = await readFile(path.join(root, "style.css"), "utf8"); expect((await runner.compare("p12-14-reject")).sourceChanged).toBe(false); expect(await readFile(path.join(root, "style.css"), "utf8")).toBe(temporary); await runner.reject("p12-14-reject"); expect(await readFile(path.join(root, "style.css"), "utf8")).toBe(before);
    await runner.generate({ ...input({ reference: context }), generationId: "p12-14-accept" }); const accepted = await runner.accept("p12-14-accept"); const metadata = JSON.parse(await readFile(path.join(root, ".reframe", "history", accepted.checkpointId!, "metadata.json"), "utf8")); expect(metadata.ai.reference).toMatchObject({ referenceId: context.descriptor.id, hash: context.descriptor.hash, selectedTraits: ["page-structure", "component-arrangement"], brandTreatment: "preserve", planId: context.plan.id, planHash: context.plan.hash }); expect(metadata.ai.reference.responsive).toHaveLength(3); expect(metadata.files.map((file: { path: string }) => file.path)).toEqual(["style.css"]); await service.close();
  });

  it("P12-15 leaves the Phase 8 packet and edit pipeline dormant when no reference is attached", async () => {
    const packet = await buildElementContextPacket(input({ reference: undefined })); expect(packet.reference).toBeUndefined(); expect(packet.preview.categories).not.toContain("frozen adaptation plan"); expect(packet.preview.bytes).toBeGreaterThan(0);
  });

  it("P12-16 uses existing Vanilla/React/CSS Module/Tailwind source conventions and keeps TypeScript plan-only", async () => {
    const { service, context } = await frozenReference(); const cases = [["style.css", "vanilla", "vanilla-css", before], ["app.css", "react", "react-css", before], ["Card.module.css", "react", "css-module", before], ["Card.jsx", "react", "tailwind", "export default () => <div className=\"grid grid-cols-3\">Cards</div>;\n"]] as const;
    for (const [index, [file, framework, stylingMethod, source]] of cases.entries()) {
      await writeFile(path.join(root, file), source); const plan = { ...context.plan, expectedFiles: [file], target: { ...context.plan.target, sourcePath: file } }; const reference = { ...context, plan }; const packet = await buildElementContextPacket(input({ sourcePath: file, framework, stylingMethod, reference })); expect(packet.project).toMatchObject({ framework, stylingMethod }); expect(packet.allowedFiles).toEqual([file]);
      const provider = createFakeCodexProvider(async (bounded, run) => ({ generationId: run.generationId, conversationId: run.conversationId, changes: [{ path: bounded.source.path, expectedHash: bounded.source.hash, before: bounded.source.snippet, after: stylingMethod === "tailwind" ? bounded.source.snippet.replace("grid-cols-3", "grid-cols-2") : bounded.source.snippet + "\n.cards{grid-template-columns:repeat(2,minmax(0,1fr))}\n" }] })); const runner = createAiEditRunner({ projectRoot: root, provider, verifyResponsive: async (_route, widths) => widths.map((width) => ({ width, passed: true, findings: [] })) }); const review = await runner.generate({ ...input({ sourcePath: file, framework, stylingMethod, reference }), generationId: `p12-16-${index}` }); expect(review).toMatchObject({ status: "review", changedFiles: [file] }); expect(await readFile(path.join(root, file), "utf8")).not.toBe(source); await runner.reject(`p12-16-${index}`); expect(await readFile(path.join(root, file), "utf8")).toBe(source);
    }
    await writeFile(path.join(root, "Card.tsx"), before);
    const typescriptInput = input({
      sourcePath: "Card.tsx", framework: "react", stylingMethod: "tailwind",
      reference: { ...context, plan: { ...context.plan, expectedFiles: ["Card.tsx"], target: { ...context.plan.target, sourcePath: "Card.tsx" } } },
    });
    await expect(buildElementContextPacket(typescriptInput)).rejects.toThrowError("SCOPE_TYPESCRIPT_UNSUPPORTED"); await service.close();
  });

  it("P12-17 normalizes Unicode/space filenames and CRLF Markdown to stable semantic hashes on Windows", async () => {
    const a = createReferenceService({ projectRoot: root }); const b = createReferenceService({ projectRoot: root }); const bytes = Buffer.from("# Layout\r\nDense navigation\r\n"); const one = await a.intake({ kind: "markdown", filename: "Design 文档 one.md", mime: "text/markdown", bytes, provenance: "Windows path fixture", persist: false }); const two = await b.intake({ kind: "markdown", filename: "Design 文档 one.md", mime: "text/markdown", bytes: Buffer.from("# Layout\nDense navigation\n"), provenance: "Linux path fixture", persist: false }); expect(one.hash).toBe(two.hash); expect(one.filename).toBe("Design 文档 one.md"); expect(one.localPath).toContain("reframe-reference-"); await a.close(); await b.close();
  });
});
