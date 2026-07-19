import { mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AiEditError, analyzeDesignDna, buildElementContextPacket, createAiEditRunner, createFakeCodexProvider, designDnaStatus, persistDesignDna, readDesignDna, reviewDesignDna, selectDesignDnaContext, updateAgentsDesignSection, type ContextPacketInput, type DesignDnaContext } from "../../packages/dev-server/src/index.js";
import { runDesignDnaCommand } from "../../packages/cli/src/design-dna-command.js";
import { projectRoot } from "../helpers/paths.js";

let root: string; const owned: string[] = [];
const fingerprint = { tag: "article", id: "card-annual", classes: ["card"], text: "Annual", parent: { tag: "section", id: "pricing", classes: [] }, route: "/", viewport: { width: 1280, height: 720 } };
const put = async (relative: string, value: string) => { const file = path.join(root, relative); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, value); };
const vanilla = `:root { --brand: #5b45d6; }\n.a { color: var(--brand); font-family: Inter, sans-serif; font-size: 16px; padding: 16px; border-radius: 12px; }\n.b { color: var(--brand); font-family: Inter, sans-serif; font-size: 16px; margin: 16px; border-radius: 12px; }\n.c { background: #ffffff; gap: 8px; }\n.d { background: #ffffff; gap: 8px; }\n`;

beforeEach(async () => { const base = path.join(projectRoot, "test-results", "phase9-fixtures"); await mkdir(base, { recursive: true }); root = await mkdtemp(path.join(base, "case-")); owned.push(root); });
afterEach(async () => { await Promise.all(owned.splice(0).map((item) => rm(item, { recursive: true, force: true, maxRetries: 20, retryDelay: 20 }))); });

describe("Phase 9 basic Design DNA", () => {
  it("P9-01 analyzes repeated Vanilla colors, fonts, sizes, spacing, and radii with evidence", async () => {
    await put("style.css", vanilla); const preview = await analyzeDesignDna(root);
    for (const category of ["color", "font-family", "font-size", "spacing", "radius"]) { const item = preview.findings.find((finding) => finding.category === category && finding.scope === "global"); expect(item).toMatchObject({ status: "needs-review" }); expect(item!.count).toBeGreaterThan(1); expect(item!.evidence[0]).toMatchObject({ path: "style.css" }); expect(item!.rawValues.length).toBeGreaterThan(0); }
  });

  it("P9-02 records Tailwind theme values and reusable React components while excluding output", async () => {
    await put("tailwind.config.js", `export default { theme: { extend: { colors: { brand: "#5b45d6" }, spacing: { card: "18px" } } } }`);
    await put("src/Card.jsx", `export function Card(){ return <div/> }\nexport function Grid(){ return <><Card/><Card/></> }`);
    await put("dist/Secret.jsx", `export function Generated(){ return <div/> }`); await put("node_modules/pkg/theme.css", `.x{color:#badbad}`);
    const preview = await analyzeDesignDna(root); expect(preview.findings.some((item) => item.category === "tailwind" && item.value.includes("brand=#5b45d6"))).toBe(true); expect(preview.components.find((item) => item.name === "Card")).toMatchObject({ usages: 2 }); expect(preview.analyzedFiles.some((file) => /dist|node_modules/.test(file))).toBe(false);
  });

  it("P9-03 writes four version-consistent files atomically after selected approvals", async () => {
    await put("style.css", vanilla); const preview = await analyzeDesignDna(root); const approved = reviewDesignDna(preview, Object.fromEntries(preview.findings.filter((item) => item.scope === "global").map((item) => [item.id, "correct"])));
    expect(await persistDesignDna(root, approved, { permission: true })).toMatchObject({ written: true, version: approved.version });
    const directory = path.join(root, ".reframe", "design-dna"); expect((await readdir(directory)).sort()).toEqual(["DESIGN.md", "components.json", "fingerprint.json", "tokens.json"]); const loaded = await readDesignDna(root); expect(loaded.version).toBe(approved.version); expect(await readFile(path.join(directory, "DESIGN.md"), "utf8")).toContain(approved.findings.find((item) => item.status === "correct")!.value);
  });

  it("P9-04 keeps a one-off bright color exceptional and exposes conflicting common radii", async () => {
    await put("style.css", `.a{color:#ff00ff;border-radius:8px}.b{border-radius:8px}.c{border-radius:16px}.d{border-radius:16px}`); const preview = await analyzeDesignDna(root);
    expect(preview.findings.find((item) => item.value === "#ff00ff")).toMatchObject({ count: 1, scope: "exception", confidence: "low", status: "needs-review" }); expect(preview.findings.filter((item) => item.category === "radius" && item.conflict)).toHaveLength(2);
  });

  it("P9-05 persists incorrect, exception, and deprecated evidence but excludes it from AI context", async () => {
    await put("style.css", vanilla); const preview = await analyzeDesignDna(root); const globals = preview.findings.filter((item) => item.scope === "global"); const reviewed = reviewDesignDna(preview, { [globals[0]!.id]: "correct", [globals[1]!.id]: "incorrect", [globals[2]!.id]: "intentional-exception", [globals[3]!.id]: "deprecated" }); await persistDesignDna(root, reviewed, { permission: true }); const loaded = await readDesignDna(root); expect(loaded.findings.map((item) => item.status)).toEqual(expect.arrayContaining(["correct", "incorrect", "intentional-exception", "deprecated"])); expect(selectDesignDnaContext(loaded, { sourcePath: "style.css" }).findings).toHaveLength(1);
  });

  it("P9-06 denial performs zero project writes and preview remains available", async () => {
    await put("style.css", vanilla); const before = (await readdir(root)).sort(); const preview = await analyzeDesignDna(root); expect(await persistDesignDna(root, preview, { permission: false, agentsPermission: false })).toMatchObject({ written: false }); expect((await readdir(root)).sort()).toEqual(before); expect(preview.findings.length).toBeGreaterThan(0); expect(await readdir(root)).not.toContain(".reframe");
  });

  it("P9-07 updates one delimited AGENTS section idempotently and preserves outside bytes", async () => {
    await put("style.css", vanilla); const original = "# Commands\r\n\r\n- npm test\r\n\r\nKeep this byte-exact.\r\n"; await put("AGENTS.md", original); const preview = await analyzeDesignDna(root); await persistDesignDna(root, preview, { permission: true, agentsPermission: true }); const once = await readFile(path.join(root, "AGENTS.md"), "utf8"); await persistDesignDna(root, preview, { permission: true, agentsPermission: true }); const twice = await readFile(path.join(root, "AGENTS.md"), "utf8"); expect(twice).toBe(once); expect((twice.match(/reframe:design-system:start/g) ?? [])).toHaveLength(1); expect(twice.replace(/<!-- reframe:design-system:start -->[\s\S]*?<!-- reframe:design-system:end -->\n?/, "")).toBe(original); expect(twice).toContain(".reframe/design-dna/DESIGN.md"); expect(updateAgentsDesignSection(twice)).toBe(twice);
  });

  it("P9-08 reports malformed source, continues safe files, and marks analysis incomplete", async () => {
    await put("broken.css", `.broken { color: #ff0000;`); await put("safe.css", vanilla); const preview = await analyzeDesignDna(root); expect(preview).toMatchObject({ incomplete: true }); expect(preview.errors).toContainEqual({ path: "broken.css", code: "CSS_MALFORMED" }); expect(preview.findings.some((item) => item.evidence.some((evidence) => evidence.path === "safe.css"))).toBe(true); expect(await readdir(root)).not.toContain(".reframe");
  });

  it("P9-09 excludes secrets and rejects an outside-root junction without reading canaries", async () => {
    const outside = await mkdtemp(path.join(path.dirname(root), "outside-")); owned.push(outside); await writeFile(path.join(outside, "theme.css"), `.x{color:#c0ffee}/* OUTSIDE-CANARY */`); await put(".env", "ENV-CANARY"); await put("private.key", "KEY-CANARY"); await put("safe.css", vanilla); await symlink(outside, path.join(root, "linked"), "junction"); const preview = await analyzeDesignDna(root); const serialized = JSON.stringify(preview); expect(serialized).not.toMatch(/CANARY|c0ffee/); expect(preview.errors).toContainEqual({ path: "linked", code: "SYMLINK_OUTSIDE_ROOT" });
  });

  it("P9-10 leaves the prior version current when a staged DNA write fails", async () => {
    await put("style.css", vanilla); const first = reviewDesignDna(await analyzeDesignDna(root), {}); await persistDesignDna(root, first, { permission: true }); const prior = await readFile(path.join(root, ".reframe", "design-dna", "tokens.json"), "utf8"); await put("extra.css", `.x{color:#123456}.y{color:#123456}`); const next = await analyzeDesignDna(root); const failingWrite: typeof writeFile = async (file, data, options) => { if (String(file).endsWith("components.json")) throw new Error("WRITE_FAILED"); return writeFile(file, data, options as never); }; await expect(persistDesignDna(root, next, { permission: true, operations: { writeFile: failingWrite } })).rejects.toThrow("WRITE_FAILED"); expect(await readFile(path.join(root, ".reframe", "design-dna", "tokens.json"), "utf8")).toBe(prior); expect((await readdir(path.join(root, ".reframe"))).filter((name) => name.endsWith(".tmp"))).toHaveLength(0);
    let transientFailures = 0; const flakyRename: typeof rename = async (from, to) => { if (String(from).endsWith(".tmp") && String(to).endsWith("design-dna") && transientFailures++ === 0) { const error = new Error("locked") as NodeJS.ErrnoException; error.code = "EPERM"; throw error; } return rename(from, to); }; await expect(persistDesignDna(root, next, { permission: true, operations: { rename: flakyRename } })).resolves.toMatchObject({ written: true }); expect(transientFailures).toBe(2); expect((await readDesignDna(root)).version).toBe(next.version);
  });

  it("P9-11 adds only approved relevant rules and version to a Phase 8 packet", async () => {
    await put("style.css", vanilla); const preview = await analyzeDesignDna(root); const candidates = preview.findings.filter((item) => item.scope === "global"); const reviewed = reviewDesignDna(preview, Object.fromEntries(candidates.map((item, index) => [item.id, index < 2 ? "correct" : "deprecated"]))); const context = selectDesignDnaContext(reviewed, { sourcePath: "style.css" }); const packet = await buildElementContextPacket({ projectRoot: root, fingerprint, sourcePath: "style.css", framework: "vanilla", stylingMethod: "vanilla-css", instruction: "Emphasize the card", designDna: context }); expect(packet.designDna?.version).toBe(preview.version); expect(packet.designDna?.findings).toHaveLength(2); expect(packet.designDna?.findings.every((item) => reviewed.findings.find((finding) => finding.value === item.value)?.status === "correct")).toBe(true);
  });

  it("P9-12 flags an unrelated provider color before Accept and never rewrites DNA", async () => {
    await put("style.css", `.card{color:#5b45d6}`); const context: DesignDnaContext = { version: "dna-approved", fingerprint: "f", findings: [{ category: "color", value: "#5b45d6", evidence: [{ path: "style.css", line: 1, raw: "#5b45d6" }] }], components: [] }; const provider = createFakeCodexProvider(async (packet, run) => ({ generationId: run.generationId, conversationId: run.conversationId, changes: [{ path: "style.css", expectedHash: packet.source.hash, before: packet.source.snippet, after: `.card{color:#ff0000}` }] })); const runner = createAiEditRunner({ projectRoot: root, provider }); const state = await runner.generate({ projectRoot: root, fingerprint, sourcePath: "style.css", framework: "vanilla", stylingMethod: "vanilla-css", instruction: "Preserve current design", designDna: context, generationId: "p9-12" }); expect(state).toMatchObject({ status: "review", code: "DESIGN_DNA_CONFLICT" }); await expect(runner.accept("p9-12")).rejects.not.toEqual(expect.objectContaining<Partial<AiEditError>>({ code: "DESIGN_DNA_CONFLICT" })); await runner.reject("p9-12"); expect(await readFile(path.join(root, "style.css"), "utf8")).toBe(`.card{color:#5b45d6}`); expect(await readdir(root)).not.toContain(".reframe/design-dna");
  });

  it("P9-13 reports May be outdated after external style change without rewriting or blocking", async () => {
    await put("style.css", vanilla); const preview = await analyzeDesignDna(root); await persistDesignDna(root, preview, { permission: true }); const tokens = await readFile(path.join(root, ".reframe", "design-dna", "tokens.json"), "utf8"); expect(await designDnaStatus(root)).toBe("Current"); await put("style.css", vanilla + `.new{color:#abcdef}`); expect(await designDnaStatus(root)).toBe("May be outdated"); expect(await readFile(path.join(root, ".reframe", "design-dna", "tokens.json"), "utf8")).toBe(tokens); expect((await analyzeDesignDna(root)).findings.length).toBeGreaterThan(preview.findings.length);
  });

  it("P9-14 analyzes CSS Modules, Tailwind, Vanilla, and JSX while marking TSX/Vue preview-only", async () => {
    await put("plain.css", vanilla); await put("Card.module.css", `.card{padding:8px}.other{padding:8px}`); await put("tailwind.config.ts", `export default { theme: { colors: { brand: "#5b45d6" } } }`); await put("Card.jsx", `export function Card(){return <div/>}`); await put("Typed.tsx", `export const Typed=()=> <div/>`); await put("Widget.vue", `<template><div/></template>`); const preview = await analyzeDesignDna(root); expect(preview.analyzedFiles).toEqual(expect.arrayContaining(["plain.css", "Card.module.css", "tailwind.config.ts", "Card.jsx", "Typed.tsx", "Widget.vue"])); expect(preview.errors.filter((error) => error.code === "ANALYSIS_PREVIEW_ONLY").map((error) => error.path).sort()).toEqual(["Typed.tsx", "Widget.vue"]); expect(preview.findings.some((item) => item.category === "tailwind")).toBe(true);
  });

  it("SUP-P9-01 previews without writing and requires an explicit write command to persist review", async () => {
    await put("style.css", vanilla); let output = ""; const sink = { write(value: string | Uint8Array) { output += String(value); return true; } };
    expect(await runDesignDnaCommand(["preview"], root, sink)).toBe(0); const preview = JSON.parse(output); expect(preview.findings.length).toBeGreaterThan(0); expect(await readdir(root)).not.toContain(".reframe");
    output = ""; expect(await runDesignDnaCommand(["write", `--correct=${preview.findings[0].id}`, "--agents"], root, sink)).toBe(0); expect(output).toMatch(/^Design DNA dna-/); expect(await designDnaStatus(root)).toBe("Current"); expect(await readFile(path.join(root, "AGENTS.md"), "utf8")).toContain("reframe:design-system:start");
  });
});
