import { describe, expect, it } from "vitest";
import {
  isFigmaCssExport,
  parseFigmaCssExport,
  sanitizeFigmaLayerClass,
  splitFigmaCssBlocks,
} from "../../packages/browser-client/src/figma-css.js";

const SAMPLE = `/* Wellness */

position: relative;
width: 1280px;
height: 857px;
background: linear-gradient(180deg, #0f172a 0%, #1e293b 100%);

/* Main Content */
position: absolute;
height: 818px;
left: 243px;
top: 24px;
display: flex;
flex-direction: column;
gap: 16px;

/* Inside auto layout */

/* Badges */
position: absolute;
width: 120px;
height: 32px;
left: 12px;
top: 8px;
background: #7c3aed;
border-radius: 999px;
flex: none;
order: 0;
`;

const AUTO_LAYOUT_SAMPLE = `/* Wellness */

position: relative;
width: 1280px;
height: 857px;

background: linear-gradient(0deg, #F8FAF9, #F8FAF9), #FFFFFF;

/* Main Content */

position: absolute;
height: 818px;
left: 243px;
right: 28px;
top: 32px;
overflow-y: scroll;

/* Badges Earned Section */

/* Auto layout */
display: flex;
flex-direction: column;
align-items: flex-start;
padding: 0px;
gap: 16px;

position: absolute;
height: 216px;
left: 33px;
right: 95px;
top: 361px;

/* Container */

/* Auto layout */
display: flex;
flex-direction: row;
justify-content: space-between;
align-items: center;
padding: 0px;
gap: 580.06px;

width: 881px;
height: 32px;

/* Inside auto layout */
flex: none;
order: 0;
align-self: stretch;
flex-grow: 0;

/* Icon */

width: 22px;
height: 21px;

background: #006D37;

/* Inside auto layout */
flex: none;
order: 0;
flex-grow: 0;
`;

describe("parseFigmaCssExport", () => {
  it("detects multi-layer Figma CSS exports", () => {
    expect(isFigmaCssExport(SAMPLE)).toBe(true);
    expect(isFigmaCssExport(AUTO_LAYOUT_SAMPLE)).toBe(true);
    expect(isFigmaCssExport("<div>not figma</div>")).toBe(false);
    expect(isFigmaCssExport("/* Only one */\nposition: absolute;")).toBe(false);
  });

  it("merges auto-layout noise into the preceding layer block", () => {
    const blocks = splitFigmaCssBlocks(AUTO_LAYOUT_SAMPLE);
    expect(blocks.map((block) => block.name)).toEqual([
      "Wellness",
      "Main Content",
      "Badges Earned Section",
      "Container",
      "Icon",
    ]);
    expect(blocks[2]?.css).toContain("display: flex");
    expect(blocks[2]?.css).toContain("position: absolute");
    expect(blocks[3]?.css).toContain("width: 881px");
    expect(blocks[4]?.css).toContain("background: #006D37");
  });

  it("parses comment blocks into layered HTML and CSS", () => {
    const blocks = splitFigmaCssBlocks(SAMPLE);
    expect(blocks.map((block) => block.name)).toEqual(["Wellness", "Main Content", "Badges"]);

    const parsed = parseFigmaCssExport(SAMPLE);
    expect(parsed.layerCount).toBe(3);
    expect(parsed.html).toContain('data-figma-layer="Wellness"');
    expect(parsed.html).toContain('data-figma-layer="Main Content"');
    expect(parsed.html).toContain('data-figma-layer="Badges"');
    expect(parsed.css).toContain(".figma-layer--wellness");
    expect(parsed.css).toContain("linear-gradient(180deg, #0f172a 0%, #1e293b 100%)");
    expect(parsed.css).not.toContain("flex: none");
    expect(parsed.css).not.toContain("order: 0");
  });

  it("sanitizes duplicate layer names into unique class slugs", () => {
    const duplicate = `/* Card */
position: absolute;
width: 10px;
height: 10px;

/* Card */
position: absolute;
width: 20px;
height: 20px;
`;
    const parsed = parseFigmaCssExport(duplicate);
    expect(parsed.layerCount).toBe(2);
    expect(parsed.css).toContain(".figma-layer--card {");
    expect(parsed.css).toContain(".figma-layer--card-2 {");
    expect(sanitizeFigmaLayerClass("Side Nav!", 0)).toBe("side-nav");
  });
});
