import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createInsertionStore } from "../../packages/dev-server/src/insertions.js";

let root = "";

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "reframe-insertions-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("Insertion store", () => {
  it("round-trips HTML, image, and SVG insertions by route", async () => {
    const store = createInsertionStore(root);
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    );
    const dataUrl = "data:image/png;base64," + png.toString("base64");
    const html = await store.save({
      route: "/",
      type: "html",
      html: '<div class="reframe-paste-root"><p>Pasted card</p></div>',
      containerFingerprint: "abc123",
    });
    const image = await store.save({
      route: "/",
      type: "image",
      html: '<div class="reframe-pasted-card" data-reframe-paste="card"><img alt="Pasted from Figma"></div>',
      dataUrl,
    });
    const svg = await store.save({
      route: "/pricing",
      type: "svg",
      html: '<div class="reframe-pasted-card" data-reframe-paste="card"><svg width="24" height="24" viewBox="0 0 24 24"></svg></div>',
    });

    const home = await store.list("/");
    expect(home).toHaveLength(2);
    expect(home.map((item) => item.id).sort()).toEqual([html.id, image.id].sort());
    expect(home.find((item) => item.id === html.id)).toMatchObject({
      type: "html",
      containerFingerprint: "abc123",
    });
    expect(home.find((item) => item.id === image.id)?.imagePath).toBe(`.reframe/insertions/${image.id}.png`);
    expect(await readFile(path.join(root, ".reframe", "insertions", `${image.id}.json`), "utf8")).toContain('"type": "image"');
    expect(await store.readImage(image.id)).toEqual(png);

    const pricing = await store.list("/pricing");
    expect(pricing).toHaveLength(1);
    expect(pricing[0]?.id).toBe(svg.id);
    expect(pricing[0]?.type).toBe("svg");
  });

  it("reuses a valid client-provided insertion id", async () => {
    const store = createInsertionStore(root);
    const id = "30000000-0000-4000-8000-000000000001";
    const saved = await store.save({
      id,
      route: "/",
      type: "html",
      html: '<div data-reframe-insertion-id="' + id + '">hello</div>',
    });
    expect(saved.id).toBe(id);
    expect((await store.list("/"))[0]?.html).toContain(id);
  });
});
