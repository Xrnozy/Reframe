import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSourceEditor, injectReactViteSourceMetadata, resolveProjectPath, type EditPlan, type WidthEditRequest } from "../../packages/dev-server/src/index.js";
import { projectRoot } from "../helpers/paths.js";

let root: string;
const owned: string[] = [];

const fingerprint = (id: string | null, classes: string[] = []) => ({ tag: "article", id, classes, text: "Annual", parent: { tag: "section", id: "cards", classes: [] }, route: "/", viewport: { width: 1280, height: 720 } });
const request = (id: string | null, classes: string[] = [], width = 420, extra: Partial<WidthEditRequest> = {}): WidthEditRequest => ({ fingerprint: fingerprint(id, classes), currentWidth: 320, width, ...extra });

async function put(relative: string, contents: string | Uint8Array): Promise<void> {
  const target = path.join(root, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, contents);
}

beforeEach(async () => {
  const base = path.join(projectRoot, "test-results", "phase6-fixtures");
  await mkdir(base, { recursive: true });
  root = await mkdtemp(path.join(base, "case-"));
  owned.push(root);
});

afterEach(async () => {
  await Promise.all(owned.splice(0).map((directory) => rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 20 })));
});

describe("Phase 6 source mapper and transaction", () => {
  it("P6-01 changes one unique Vanilla ID width and no metadata on disk", async () => {
    await put("index.html", '<article id="pricing-card">Annual</article>');
    await put("style.css", "#pricing-card { width: 320px; color: red; }\n");
    const result = await createSourceEditor({ projectRoot: root, framework: "vanilla" }).applyWidth(request("pricing-card"));
    expect(result.status).toBe("applied");
    expect(await readFile(path.join(root, "style.css"), "utf8")).toBe("#pricing-card { width: 420px; color: red; }\n");
    expect(await readFile(path.join(root, "index.html"), "utf8")).not.toContain("data-reframe");
  });

  it("P6-02 changes one class declaration without touching comments, EOL, or duplicate string text", async () => {
    const source = '.card { /* width: 1px */\r\n  width: 320px; content: "width: 320px";\r\n}\r\n';
    await put("style.css", source);
    const result = await createSourceEditor({ projectRoot: root, framework: "vanilla" }).applyWidth(request(null, ["card"]));
    expect(result.status).toBe("applied");
    expect(await readFile(path.join(root, "style.css"), "utf8")).toBe(source.replace("width: 320px;", "width: 420px;"));
  });

  it("SUP-P6-02 adds a width to one existing inline Vanilla style owner only after shared-impact approval", async () => {
    const source = '<style>\n.left-panel {\n  color: red;\n}\n.left-panel h2 { font-size: 14px; }\n</style>\n<div class="left-panel"><h2>Errors</h2></div>';
    await put("index.html", source);
    const editor = createSourceEditor({ projectRoot: root, framework: "vanilla" });
    const blocked = await editor.mapWidth(request(null, ["left-panel"]));
    expect(blocked).toMatchObject({ confidence: "probable", requiresImpactApproval: true });
    const result = await editor.applyWidth(request(null, ["left-panel"], 420, { sharedImpactAccepted: true }));
    expect(result.status).toBe("applied");
    expect(await readFile(path.join(root, "index.html"), "utf8")).toBe(source.replace("  color: red;", "  color: red;\n  width: 420px;"));
  });

  it("P6-03 reports duplicate and responsive owners as ambiguous without writing", async () => {
    await put("a.css", "#pricing-card { width: 320px; }");
    await put("b.css", "#pricing-card { width: 320px; } @media(min-width:800px){#pricing-card{width:400px;}}");
    const before = await readFile(path.join(root, "a.css"), "utf8");
    const mapping = await createSourceEditor({ projectRoot: root, framework: "vanilla" }).mapWidth(request("pricing-card"));
    expect(mapping.confidence).toBe("ambiguous");
    expect(mapping.candidates.length).toBeGreaterThan(1);
    expect(await readFile(path.join(root, "a.css"), "utf8")).toBe(before);
  });

  it("P6-04 rejects negative, fractional, nonfinite, zero, and out-of-bounds widths before write", async () => {
    await put("style.css", "#pricing-card { width: 320px; }");
    const editor = createSourceEditor({ projectRoot: root, framework: "vanilla" });
    for (const width of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 0, 10_001]) expect((await editor.applyWidth(request("pricing-card", [], width))).status).toBe("rejected");
    expect(await readFile(path.join(root, "style.css"), "utf8")).toBe("#pricing-card { width: 320px; }");
  });

  it("P6-05 maps a React node to its existing plain-CSS rule and changes only that rule", async () => {
    await put("src/App.jsx", 'import "./style.css"; export function AnnualCard(){ return <article id="card-annual">Annual</article>; }');
    await put("src/style.css", "#card-annual { width: 320px; }\n.other { width: 320px; }");
    const result = await createSourceEditor({ projectRoot: root, framework: "react" }).applyWidth(request("card-annual"));
    expect(result.plan?.stylingMode).toBe("react-css");
    expect(result.plan?.component).toEqual({ name: "AnnualCard", path: "src/App.jsx", line: 1 });
    expect(result.mapping.evidence).toContain("AnnualCard");
    expect(await readFile(path.join(root, "src/style.css"), "utf8")).toBe("#card-annual { width: 420px; }\n.other { width: 320px; }");
  });

  it("P6-06 changes only the imported CSS Module rule", async () => {
    await put("src/App.jsx", 'import styles from "./Card.module.css"; export default()=> <article id="card-annual" className={styles.card}>Annual</article>;');
    await put("src/Card.module.css", ".card { width: 320px; }");
    await put("src/global.css", ".card { width: 320px; }");
    const result = await createSourceEditor({ projectRoot: root, framework: "react" }).applyWidth(request("card-annual", ["hashed-card"]));
    expect(result.plan?.stylingMode).toBe("css-module");
    expect(await readFile(path.join(root, "src/Card.module.css"), "utf8")).toContain("420px");
    expect(await readFile(path.join(root, "src/global.css"), "utf8")).toContain("320px");
  });

  it("P6-07 replaces Tailwind w-80 with w-96 and preserves every other token", async () => {
    await put("src/App.jsx", 'export default()=> <article id="card-annual" className="rounded w-80 text-white">Annual</article>;');
    const result = await createSourceEditor({ projectRoot: root, framework: "react" }).applyWidth(request("card-annual", ["w-80"], 384));
    expect(result.plan?.stylingMode).toBe("tailwind");
    expect(await readFile(path.join(root, "src/App.jsx"), "utf8")).toContain('className="rounded w-96 text-white"');
  });

  it("SUP-P6-07 edits Tailwind width tokens in TSX source files", async () => {
    await put("src/App.tsx", 'export function App(): JSX.Element { return <article id="card-annual" className="rounded w-80">Annual</article>; }');
    const result = await createSourceEditor({ projectRoot: root, framework: "react" }).applyWidth(request("card-annual", ["w-80"], 384));
    expect(result.status).toBe("applied");
    expect(await readFile(path.join(root, "src/App.tsx"), "utf8")).toContain('className="rounded w-96"');
  });

  it("SUP-P6-07b edits Tailwind class attributes in Blade templates", async () => {
    await put("resources/views/welcome.blade.php", '<article id="card-annual" class="rounded w-80">Annual</article>');
    const result = await createSourceEditor({ projectRoot: root, framework: "vanilla" }).applyWidth(request("card-annual", ["w-80"], 384));
    expect(result.status).toBe("applied");
    expect(await readFile(path.join(root, "resources/views/welcome.blade.php"), "utf8")).toContain('class="rounded w-96"');
  });

  it("P6-08 uses one arbitrary Tailwind width when no exact utility exists", async () => {
    await put("src/App.jsx", 'export default()=> <article id="card-annual" className="w-80">Annual</article>;');
    await createSourceEditor({ projectRoot: root, framework: "react" }).applyWidth(request("card-annual", ["w-80"], 420));
    const source = await readFile(path.join(root, "src/App.jsx"), "utf8");
    expect(source).toContain('className="w-[420px]"');
    expect(source).not.toContain("style=");
  });

  it("P6-09 requires breakpoint intent and changes only md width", async () => {
    await put("src/App.jsx", 'export default()=> <article id="card-annual" className="w-full md:w-80">Annual</article>;');
    const editor = createSourceEditor({ projectRoot: root, framework: "react" });
    expect((await editor.mapWidth(request("card-annual", ["w-full", "md:w-80"], 384))).confidence).toBe("ambiguous");
    const result = await editor.applyWidth(request("card-annual", ["w-full", "md:w-80"], 384, { breakpoint: "md" }));
    expect(result.status).toBe("applied");
    expect(await readFile(path.join(root, "src/App.jsx"), "utf8")).toContain('className="w-full md:w-96"');
  });

  it("P6-10 rejects computed and conditional className expressions", async () => {
    await put("src/App.jsx", 'export default({wide})=> <article id="card-annual" className={wide ? "w-80" : `w-${size}`}>Annual</article>;');
    const result = await createSourceEditor({ projectRoot: root, framework: "react" }).applyWidth(request("card-annual", ["w-80"], 384));
    expect(result.status).toBe("rejected");
    expect(result.mapping.evidence).toContain("Dynamic");
  });

  it("P6-11 blocks a component style reused across route files until shared impact is explicitly accepted", async () => {
    await put("src/Card.jsx", 'export function Card({id, children}) { return <article id={id} className="card">{children}</article>; }');
    await put("src/RouteA.jsx", 'import { Card } from "./Card.jsx"; export function RouteA(){ return <Card id="card-annual">A</Card>; }');
    await put("src/RouteB.jsx", 'import { Card } from "./Card.jsx"; export function RouteB(){ return <Card id="card-other">B</Card>; }');
    await put("src/style.css", ".card { width: 320px; }");
    const editor = createSourceEditor({ projectRoot: root, framework: "react" });
    const blocked = await editor.mapWidth(request("card-annual", ["card"]));
    expect(blocked.confidence).toBe("probable");
    expect(blocked.requiresImpactApproval).toBe(true);
    expect(blocked.evidence).toContain("Card component/style owner");
    const applied = await editor.applyWidth(request("card-annual", ["card"], 420, { sharedImpactAccepted: true }));
    expect(applied.status).toBe("applied");
    expect(applied.plan?.component).toEqual({ name: "Card", path: "src/Card.jsx", line: 1 });
    expect(applied.plan?.impact.locations).toEqual(["src/RouteA.jsx:1", "src/RouteB.jsx:1"]);
  });

  it("P6-12 returns FILE_STALE after an external change between mapping and apply", async () => {
    await put("style.css", "#pricing-card { width: 320px; color: red; }");
    const editor = createSourceEditor({ projectRoot: root, framework: "vanilla" });
    const mapping = await editor.mapWidth(request("pricing-card"));
    await put("style.css", "#pricing-card { width: 320px; color: blue; }");
    const result = await editor.applyPlan(mapping.plan!);
    expect(result.code).toBe("FILE_STALE");
    expect(await readFile(path.join(root, "style.css"), "utf8")).toContain("blue");
  });

  it("P6-13 serializes concurrent edits so the second applies or fails stale without corruption", async () => {
    await put("style.css", "#pricing-card { width: 320px; }");
    const editor = createSourceEditor({ projectRoot: root, framework: "vanilla" });
    const results = await Promise.all([editor.applyWidth(request("pricing-card", [], 420)), editor.applyWidth(request("pricing-card", [], 440))]);
    expect(results.filter(({ status }) => status === "applied")).toHaveLength(1);
    expect(results.some(({ code }) => code === "FILE_STALE" || statusIsRejected(code))).toBe(true);
    expect(await readFile(path.join(root, "style.css"), "utf8")).toMatch(/^#pricing-card \{ width: (420|440)px; \}$/);
  });

  it("P6-14 rejects absolute, traversal, alternate-drive, UNC, encoded, and NUL paths before read", async () => {
    await put("style.css", "x");
    for (const attack of [path.resolve(root, "style.css"), "../outside.css", "C:\\outside.css", "\\\\server\\share.css", "%2e%2e/outside.css", "bad\0.css"]) await expect(resolveProjectPath(root, attack)).rejects.toThrow("PATH_OUTSIDE_ROOT");
  });

  it("P6-15 rejects a target-relative junction escaping the root", async () => {
    const outside = await mkdtemp(path.join(path.dirname(root), "outside-"));
    owned.push(outside);
    await writeFile(path.join(outside, "secret.css"), ".card{width:320px}");
    await symlink(outside, path.join(root, "escape"), "junction");
    await expect(resolveProjectPath(root, "escape/secret.css")).rejects.toThrow("PATH_OUTSIDE_ROOT");
    expect(await readFile(path.join(outside, "secret.css"), "utf8")).toBe(".card{width:320px}");
  });

  it("P6-16 preserves the original and cleans temporary files on write, short-write, or rename failure", async () => {
    const source = "#pricing-card { width: 320px; }";
    const cases = [
      { writeFile: async () => { throw new Error("ENOSPC"); } },
      { writeFile: async (target: string, bytes: Uint8Array, options: object) => writeFile(target, bytes.subarray(0, 3), options) },
      { rename: async () => { throw new Error("EACCES"); } },
    ];
    for (const operations of cases) {
      await put("style.css", source);
      const result = await createSourceEditor({ projectRoot: root, framework: "vanilla", operations: operations as never }).applyWidth(request("pricing-card"));
      expect(result.status).toBe("rejected");
      expect(result.code).toContain("WRITE_FAILED");
      expect(await readFile(path.join(root, "style.css"), "utf8")).toBe(source);
      expect((await readdir(root)).filter((name) => name.includes(".reframe-") && name.endsWith(".tmp"))).toEqual([]);
    }
  });

  it("P6-17 rolls back exact bytes when a real route reports the edited project unhealthy", async () => {
    const source = "#pricing-card { width: 320px; }";
    await put("style.css", source);
    const server = createServer(async (_request, response) => {
      const healthy = (await readFile(path.join(root, "style.css"), "utf8")).includes("320px");
      response.writeHead(healthy ? 200 : 500).end(healthy ? "healthy" : "compile failure");
    });
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing test server address");
    const url = `http://127.0.0.1:${address.port}/`;
    try {
      const result = await createSourceEditor({ projectRoot: root, framework: "vanilla", verify: async () => (await fetch(url)).ok }).applyWidth(request("pricing-card"));
      expect(result.status).toBe("rolled-back");
      expect(await readFile(path.join(root, "style.css"), "utf8")).toBe(source);
      expect((await fetch(url)).status).toBe(200);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("P6-18 times out deterministically and rolls back rather than waiting forever", async () => {
    await put("style.css", "#pricing-card { width: 320px; }");
    const started = performance.now();
    const result = await createSourceEditor({ projectRoot: root, framework: "vanilla", verificationTimeoutMs: 25, verify: () => new Promise(() => undefined) }).applyWidth(request("pricing-card"));
    expect(result.status).toBe("rolled-back");
    expect(result.code).toContain("VERIFICATION_TIMEOUT");
    expect(performance.now() - started).toBeLessThan(1_000);
  });

  it("P6-19 reports critical recovery and retains backup evidence when rollback write fails", async () => {
    await put("style.css", "#pricing-card { width: 320px; }");
    const editor = createSourceEditor({ projectRoot: root, framework: "vanilla", verify: () => false, operations: { rollbackWriteFile: async () => { throw new Error("rollback denied"); } } as never });
    const result = await editor.applyWidth(request("pricing-card"));
    expect(result.status).toBe("critical");
    expect(result.backupHash).toMatch(/^[a-f0-9]{64}$/);
    expect(await readFile(result.backupPath!)).toBeTruthy();
  });

  it("P6-20 preserves UTF-8 BOM, CRLF, comments, duplicate strings, and file mode", async () => {
    const source = Buffer.from('\ufeff.card {\r\n  /* width: 320px */\r\n  width: 320px;\r\n  content: "width: 320px";\r\n}\r\n');
    await put("style.css", source);
    const mode = (await stat(path.join(root, "style.css"))).mode;
    await createSourceEditor({ projectRoot: root, framework: "vanilla" }).applyWidth(request(null, ["card"]));
    const after = await readFile(path.join(root, "style.css"));
    expect(after.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
    expect(after.toString("utf8")).toBe(source.toString("utf8").replace("  width: 320px;", "  width: 420px;"));
    expect((await stat(path.join(root, "style.css"))).mode).toBe(mode);
  });

  it("P6-22 repeats every supported edit family deterministically on 20 fresh copies", async () => {
    for (let index = 0; index < 20; index += 1) {
      const copy = await mkdtemp(path.join(path.dirname(root), "repeat-"));
      owned.push(copy);
      const vanilla = path.join(copy, "vanilla");
      const reactCss = path.join(copy, "react-css");
      const module = path.join(copy, "module");
      const tailwind = path.join(copy, "tailwind");
      await Promise.all([vanilla, reactCss, module, tailwind].map((directory) => mkdir(path.join(directory, "src"), { recursive: true })));
      await writeFile(path.join(vanilla, "style.css"), "#pricing-card { width: 320px; }\n");
      await writeFile(path.join(reactCss, "src", "App.jsx"), '<article id="pricing-card">Annual</article>');
      await writeFile(path.join(reactCss, "src", "style.css"), "#pricing-card { width: 320px; }\n");
      await writeFile(path.join(module, "src", "App.jsx"), 'import styles from "./Card.module.css"; export default()=> <article id="pricing-card" className={styles.card}>Annual</article>;');
      await writeFile(path.join(module, "src", "Card.module.css"), ".card { width: 320px; }\n");
      await writeFile(path.join(tailwind, "src", "App.jsx"), 'export default()=> <article id="pricing-card" className="rounded w-80">Annual</article>;');
      expect((await createSourceEditor({ projectRoot: vanilla, framework: "vanilla" }).applyWidth(request("pricing-card"))).status).toBe("applied");
      expect((await createSourceEditor({ projectRoot: reactCss, framework: "react" }).applyWidth(request("pricing-card"))).status).toBe("applied");
      expect((await createSourceEditor({ projectRoot: module, framework: "react" }).applyWidth(request("pricing-card", ["hashed-card"]))).status).toBe("applied");
      expect((await createSourceEditor({ projectRoot: tailwind, framework: "react" }).applyWidth(request("pricing-card", ["w-80"], 384))).status).toBe("applied");
      expect(await readFile(path.join(vanilla, "style.css"), "utf8")).toContain("420px");
      expect(await readFile(path.join(reactCss, "src", "style.css"), "utf8")).toContain("420px");
      expect(await readFile(path.join(module, "src", "Card.module.css"), "utf8")).toContain("420px");
      expect(await readFile(path.join(tailwind, "src", "App.jsx"), "utf8")).toContain("w-96");
    }
  });

  it("SUP-P6-01 injects complete React metadata into Vite output without touching source", () => {
    const source = 'export function PricingCard({ id, name }) {\n  return <article id={`card-${id}`}><h2>{name}</h2></article>;\n}\n';
    const transformed = 'export function PricingCard({ id, name }) { return jsxDEV("article", { id: `card-${id}`, children: jsxDEV("h2", { children: name }, void 0, false, {}, this) }, void 0, false, {}, this); }';
    const result = injectReactViteSourceMetadata(transformed, source, "src/PricingCard.jsx");
    expect(result.match(/"data-reframe-component":"PricingCard"/g)).toHaveLength(2);
    expect(result).toContain('"data-reframe-source":"src/PricingCard.jsx:2"');
    expect(result).toContain('"data-reframe-range":');
    expect(result).toContain('"data-reframe-instance":"PricingCard" + ":" + String(id)');
    expect(result).toContain('"data-reframe-props":"id,name"');
    expect(injectReactViteSourceMetadata(result, source, "src/PricingCard.jsx")).toBe(result);
    expect(source).not.toContain("data-reframe");
  });

  it("P6-13 inserts transform into the best matching class rule when moving layout elements", async () => {
    await put("src/styles.css", ".pricing-card { width: 280px; padding: 24px; border-radius: 16px; }\n.pricing-card--annual { width: 320px; border-color: #5b45d6; }\n");
    const editor = createSourceEditor({ projectRoot: root, framework: "react" });
    const mapping = await editor.mapEdit({
      fingerprint: fingerprint("card-annual", ["pricing-card", "pricing-card--annual"]),
      currentWidth: 320,
      width: 320,
      previewStyles: { transform: "translate(10px, 20px)" },
      originalStyles: { transform: "none" },
      sharedImpactAccepted: true,
    });
    expect(mapping.confidence).toBe("exact");
    const result = await editor.applyEdit({
      fingerprint: fingerprint("card-annual", ["pricing-card", "pricing-card--annual"]),
      currentWidth: 320,
      width: 320,
      previewStyles: { transform: "translate(10px, 20px)" },
      originalStyles: { transform: "none" },
      sharedImpactAccepted: true,
    });
    expect(result.status).toBe("applied");
    expect(await readFile(path.join(root, "src/styles.css"), "utf8")).toContain("transform: translate(10px, 20px)");
    expect(await readFile(path.join(root, "src/styles.css"), "utf8")).not.toMatch(/\.pricing-card \{[^}]*transform:/);
  });
});

function statusIsRejected(code: string): boolean {
  return code.includes("No existing") || code.includes("Multiple");
}
