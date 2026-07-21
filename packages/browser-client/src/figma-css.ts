export type FigmaCssParseResult = {
  html: string;
  css: string;
  layerCount: number;
};

const IGNORED_LAYER_COMMENTS = /^(?:inside\s+auto\s+layout|auto\s+layout|layout\s+mode)/i;
const FIGMA_CSS_PROP = /(?:^|\n)\s*[\w-]+\s*:/m;
const BOILERPLATE_PROPS = /^\s*(?:flex:\s*none|order:\s*0)\s*;?\s*$/i;

export function sanitizeFigmaLayerClass(name: string, index: number): string {
  const base = String(name || "layer")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 48) || "layer";
  return index > 0 ? `${base}-${index + 1}` : base;
}

export function cleanFigmaCssProperties(css: string): string {
  return String(css || "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("/*") && !BOILERPLATE_PROPS.test(line))
    .join("\n")
    .trim();
}

export function splitFigmaCssBlocks(text: string): Array<{ name: string; css: string }> {
  const source = String(text || "");
  const comments: Array<{ name: string; start: number; end: number }> = [];
  const re = /\/\*\s*([^*]+?)\s*\*\//g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    comments.push({ name: match[1]!.trim(), start: match.index, end: match.index + match[0].length });
  }
  const blocks: Array<{ name: string; css: string }> = [];
  for (let i = 0; i < comments.length; i += 1) {
    const comment = comments[i]!;
    if (IGNORED_LAYER_COMMENTS.test(comment.name)) continue;
    let end = source.length;
    for (let j = i + 1; j < comments.length; j += 1) {
      if (!IGNORED_LAYER_COMMENTS.test(comments[j]!.name)) {
        end = comments[j]!.start;
        break;
      }
    }
    const css = cleanFigmaCssProperties(source.slice(comment.end, end));
    if (!css || !FIGMA_CSS_PROP.test(css)) continue;
    blocks.push({ name: comment.name, css });
  }
  return blocks;
}

export function isFigmaCssExport(text: string): boolean {
  const trimmed = String(text || "").trim();
  if (!trimmed || /^<[a-z!?]/i.test(trimmed)) return false;
  if (splitFigmaCssBlocks(trimmed).length >= 2) return true;
  // ponytail: noisy Auto layout comments can leave <2 parsed blocks — fall back on comment/property heuristics
  const comments = [...trimmed.matchAll(/\/\*\s*([^*]+?)\s*\*\//g)];
  const layerComments = comments.filter((match) => !IGNORED_LAYER_COMMENTS.test(match[1]!.trim()));
  const propLines = (trimmed.match(/^\s*[\w-]+\s*:/gm) || []).length;
  const hasFigmaNoise = comments.some((match) => IGNORED_LAYER_COMMENTS.test(match[1]!.trim()));
  return layerComments.length >= 2 && propLines >= 4 && (hasFigmaNoise || /\bposition\s*:/i.test(trimmed));
}

function usedClassNames(blocks: Array<{ name: string }>): string[] {
  const seen = new Map<string, number>();
  return blocks.map((block) => {
    const count = seen.get(block.name) ?? 0;
    seen.set(block.name, count + 1);
    return sanitizeFigmaLayerClass(block.name, count);
  });
}

export function parseFigmaCssExport(text: string): FigmaCssParseResult {
  const blocks = splitFigmaCssBlocks(text);
  if (!blocks.length) {
    return { html: "", css: "", layerCount: 0 };
  }
  const classNames = usedClassNames(blocks);
  const rules: string[] = [];
  const layers: string[] = [];
  let rootWidth = "";
  let rootHeight = "";
  blocks.forEach((block, index) => {
    const className = `figma-layer--${classNames[index]}`;
    const safeName = block.name.replace(/"/g, "'");
    rules.push(`.${className} {\n${block.css}\n}`);
    layers.push(`<div class="figma-layer ${className}" data-figma-layer="${safeName}"></div>`);
    if (!index) {
      const width = block.css.match(/(?:^|\n)\s*width:\s*([^;]+)/i)?.[1]?.trim();
      const height = block.css.match(/(?:^|\n)\s*height:\s*([^;]+)/i)?.[1]?.trim();
      if (width) rootWidth = width;
      if (height) rootHeight = height;
    }
  });
  const rootStyle = [
    "position:relative",
    "box-sizing:border-box",
    rootWidth ? `width:${rootWidth}` : "width:100%",
    rootHeight ? `min-height:${rootHeight}` : "",
    "max-width:100%",
    "overflow:hidden",
  ].filter(Boolean).join(";");
  const html = `<div class="reframe-figma-import" style="${rootStyle}">${layers.join("")}</div>`;
  const css = [
    ".reframe-figma-import { position: relative; max-width: 100%; }",
    ".reframe-figma-import .figma-layer { box-sizing: border-box; }",
    ...rules,
  ].join("\n");
  return { html, css, layerCount: blocks.length };
}

export function buildFigmaCssRuntime(): string {
  return [
    sanitizeFigmaLayerClass,
    cleanFigmaCssProperties,
    splitFigmaCssBlocks,
    isFigmaCssExport,
    parseFigmaCssExport,
  ].map((fn) => `const ${fn.name} = ${fn};`).join("\n");
}
