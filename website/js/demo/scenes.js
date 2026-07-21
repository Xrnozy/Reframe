/** GSAP scene timelines — terminal typing + continuous Reframe showcase */

import { getShowcaseIframe } from "./mockups.js";

const API_KEY = Symbol.for("reframe.browser-client");

function q(root, sel) {
  return root?.querySelector(sel);
}

function getShowcase(scene) {
  const iframe = getShowcaseIframe(scene);
  return iframe?.contentWindow?.[API_KEY]?.showcase ?? null;
}

let showcaseApiPromise = null;
let showcaseScene = null;

export function preloadShowcase(scene) {
  if (scene && scene !== showcaseScene) {
    showcaseScene = scene;
    showcaseApiPromise = null;
  }
  if (!showcaseApiPromise) {
    showcaseApiPromise = new Promise((resolve) => {
      const poll = () => {
        const api = getShowcase(scene || showcaseScene);
        if (api) { resolve(api); return; }
        requestAnimationFrame(poll);
      };
      poll();
    });
  }
  return showcaseApiPromise;
}

function runShowcase(scene, fn) {
  const api = getShowcase(scene);
  if (api && fn) {
    fn(api);
    return;
  }
  preloadShowcase(scene).then((ready) => { if (ready && fn) fn(ready); });
}

function moveCursorRel(tl, cursor, x, y, duration = 0.65) {
  if (!cursor) return;
  tl.to(cursor, { opacity: 1, left: `${x}%`, top: `${y}%`, duration, ease: "power2.inOut" });
}

function cursorPoint(scene, cursor, { page, shadow, fallback = [50, 50], dx = 0, dy = 0 }) {
  const iframe = getShowcaseIframe(scene);
  const target = page
    ? iframe?.contentDocument?.querySelector(page)
    : iframe?.contentDocument?.querySelector("#reframe-root")?.shadowRoot?.querySelector(shadow);
  const stage = cursor?.offsetParent;
  if (!target || !stage || !iframe) {
    return { left: `${fallback[0]}%`, top: `${fallback[1]}%` };
  }
  const targetRect = target.getBoundingClientRect();
  const iframeRect = iframe.getBoundingClientRect();
  const stageRect = stage.getBoundingClientRect();
  return {
    left: iframeRect.left - stageRect.left + targetRect.left + targetRect.width / 2 + dx,
    top: iframeRect.top - stageRect.top + targetRect.top + targetRect.height / 2 + dy,
  };
}

function moveCursorTo(tl, scene, cursor, target, duration = 0.65) {
  if (!cursor) return;
  tl.to(cursor, {
    opacity: 1,
    left: () => cursorPoint(scene, cursor, target).left,
    top: () => cursorPoint(scene, cursor, target).top,
    duration,
    ease: "power2.inOut",
  });
}

function clickAtRel(tl, cursor) {
  if (!cursor) return;
  tl.set(cursor, { "--cursor-ring-opacity": 0, "--cursor-ring-scale": 0.35 });
  tl.to(cursor, { scale: 0.82, "--cursor-ring-opacity": 0.9, "--cursor-ring-scale": 0.7, duration: 0.12, ease: "power2.in" });
  tl.to(cursor, { scale: 1, "--cursor-ring-opacity": 0, "--cursor-ring-scale": 1.2, duration: 0.22, ease: "power2.out" });
}

function endCursorRel(tl, cursor) {
  if (!cursor) return;
  tl.to(cursor, { opacity: 0, duration: 0.25 });
}

export function resetReframeShowcase(scene) {
  runShowcase(scene, (api) => { void api.reset(); });
}

function label(sceneIndex) {
  return `scene-${sceneIndex}`;
}

function buildLiveMaster(gsap, rf, cursor, { setHint } = {}) {
  const master = gsap.timeline({ paused: true });
  const addLabel = (i) => master.addLabel(label(i), ">");

  addLabel(2);
  master.add(() => setHint?.(2));
  master.add(() => runShowcase(rf, (api) => { void api.reset(); }));
  master.add(() => runShowcase(rf, (api) => { void api.closeExclusiveForScene(2); }));
  master.to({}, { duration: 0.25 });
  moveCursorRel(master, cursor, 8, 8);
  master.add(() => runShowcase(rf, (api) => { void api.revealChrome(); }));
  master.to({}, { duration: 0.65 });
  moveCursorTo(master, rf, cursor, { shadow: "[data-reframe-toolbar-layers]", fallback: [6, 14] });
  clickAtRel(master, cursor);
  master.add(() => runShowcase(rf, (api) => { void api.openLayers(); }));
  master.to({}, { duration: 0.7 });
  moveCursorTo(master, rf, cursor, { shadow: "[data-reframe-layers-panel]", fallback: [14, 38] });
  master.to({}, { duration: 0.8 });
  master.to({}, { duration: 0.5 });

  addLabel(3);
  master.add(() => setHint?.(3));
  master.add(() => runShowcase(rf, (api) => { void api.closeExclusiveForScene(3); }));
  master.to({}, { duration: 0.75 });
  moveCursorTo(master, rf, cursor, { page: "#rf-cta", fallback: [50, 58] });
  clickAtRel(master, cursor);
  master.add(() => runShowcase(rf, (api) => { void api.select("#rf-cta"); }));
  master.to({}, { duration: 0.6 });
  moveCursorTo(master, rf, cursor, { shadow: ".context-pill", fallback: [50, 58] }, 0.5);
  master.to({}, { duration: 0.7 });
  master.to({}, { duration: 0.65 });

  addLabel(4);
  master.add(() => setHint?.(4));
  master.add(() => runShowcase(rf, (api) => { void api.closeExclusiveForScene(4); }));
  master.to({}, { duration: 0.2 });
  moveCursorTo(master, rf, cursor, { shadow: "[data-reframe-handle]", fallback: [72, 62] });
  clickAtRel(master, cursor);
  master.add(() => runShowcase(rf, (api) => { void api.resize(72); }));
  moveCursorTo(master, rf, cursor, { shadow: "[data-reframe-handle]", fallback: [80, 62], dx: 72 }, 0.75);
  master.to({}, { duration: 0.15 });
  moveCursorTo(master, rf, cursor, { shadow: "[data-reframe-toolbar-design]", fallback: [22, 10] });
  clickAtRel(master, cursor);
  master.add(() => runShowcase(rf, (api) => { void api.openDesign(); }));
  master.to({}, { duration: 0.7 });
  moveCursorTo(master, rf, cursor, { shadow: "[data-reframe-design-fill]", fallback: [88, 42] }, 0.45);
  clickAtRel(master, cursor);
  master.add(() => runShowcase(rf, (api) => { void api.fillColor("#6d28d9"); }));
  master.to({}, { duration: 0.35 });
  moveCursorTo(master, rf, cursor, { shadow: "[data-reframe-layout-radius]", fallback: [88, 52] }, 0.35);
  clickAtRel(master, cursor);
  master.add(() => runShowcase(rf, (api) => { void api.setRoundedCorners(); }));
  master.to({}, { duration: 0.7 });
  master.to({}, { duration: 0.5 });

  addLabel(5);
  master.add(() => setHint?.(5));
  master.add(() => runShowcase(rf, (api) => { void api.closeExclusiveForScene(5); }));
  master.to({}, { duration: 0.75 });
  moveCursorTo(master, rf, cursor, { shadow: "[data-reframe-generate]", fallback: [62, 72] });
  clickAtRel(master, cursor);
  master.add(() => runShowcase(rf, (api) => { void api.typeGenerate(); }));
  master.to({}, { duration: 0.65 });
  moveCursorTo(master, rf, cursor, { shadow: "[data-reframe-ai-prompt]", fallback: [88, 58] }, 0.35);
  master.to({}, { duration: 1.5 });
  moveCursorTo(master, rf, cursor, { shadow: "[data-reframe-ai-generate]", fallback: [88, 82] }, 0.4);
  clickAtRel(master, cursor);
  master.to({}, { duration: 0.8 });
  master.to({}, { duration: 0.5 });

  addLabel(6);
  master.add(() => setHint?.(6));
  master.add(() => runShowcase(rf, (api) => { void api.closeExclusiveForScene(6); }));
  master.to({}, { duration: 0.55 });
  master.add(() => runShowcase(rf, (api) => { void api.showReview(); }));
  master.to({}, { duration: 0.65 });
  moveCursorTo(master, rf, cursor, { shadow: "[data-reframe-ai-status]", fallback: [86, 65] }, 0.4);
  master.to({}, { duration: 0.8 });
  moveCursorTo(master, rf, cursor, { shadow: "[data-reframe-ai-accept]", fallback: [82, 72] }, 0.4);
  clickAtRel(master, cursor);
  master.add(() => runShowcase(rf, (api) => { void api.approveReview(); }));
  master.to({}, { duration: 0.9 });

  addLabel(7);
  master.add(() => setHint?.(7));
  master.add(() => runShowcase(rf, (api) => { void api.closeExclusiveForScene(7); }));
  master.to({}, { duration: 0.45 });
  moveCursorTo(master, rf, cursor, { page: "#rf-cta", fallback: [50, 58] }, 0.4);
  master.add(() => runShowcase(rf, (api) => { void api.hotReload(); }));
  master.to({}, { duration: 0.65 });
  moveCursorTo(master, rf, cursor, { shadow: "[data-reframe-diagnostic]", fallback: [65, 10] }, 0.35);
  master.to({}, { duration: 0.9 });
  master.to({}, { duration: 0.7 });

  addLabel(8);
  master.add(() => setHint?.(8));
  master.add(() => runShowcase(rf, (api) => { void api.closeExclusiveForScene(8); }));
  master.to({}, { duration: 0.35 });
  moveCursorTo(master, rf, cursor, { shadow: '[data-reframe-tool="comment"]', fallback: [4, 22] }, 0.45);
  clickAtRel(master, cursor);
  master.to({}, { duration: 0.25 });
  moveCursorTo(master, rf, cursor, { page: "#rf-cta", fallback: [50, 58] });
  clickAtRel(master, cursor);
  master.add(() => runShowcase(rf, (api) => { void api.openComments(); }));
  master.to({}, { duration: 1.1 });
  moveCursorTo(master, rf, cursor, { shadow: "[data-reframe-annotation-layer] .annotation-pin", fallback: [65, 58] }, 0.45);
  clickAtRel(master, cursor);
  master.to({}, { duration: 0.7 });
  moveCursorTo(master, rf, cursor, { shadow: ".annotation-card", fallback: [72, 68] }, 0.45);
  master.to({}, { duration: 0.8 });
  master.to({}, { duration: 0.6 });

  addLabel(9);
  master.add(() => setHint?.(9));
  master.add(() => runShowcase(rf, (api) => { void api.closeExclusiveForScene(9); }));
  master.to({}, { duration: 0.4 });
  moveCursorTo(master, rf, cursor, { shadow: "[data-reframe-history-btn]", fallback: [20, 10] }, 0.45);
  clickAtRel(master, cursor);
  master.add(() => runShowcase(rf, (api) => { void api.openHistory(); }));
  master.to({}, { duration: 0.75 });
  moveCursorTo(master, rf, cursor, { shadow: ".history-dialog", fallback: [72, 78] }, 0.55);
  master.to({}, { duration: 1.0 });
  endCursorRel(master, cursor);
  master.to({}, { duration: 0.7 });

  master.addLabel("live-end");
  return master;
}

function makeSegmentProxy(gsap, master, index, cursor, hooks) {
  return {
    restart() { playLiveSegment(gsap, master, index, cursor, hooks); },
    pause() { master.pause(); },
    kill() { stopLiveSegment(master); },
  };
}

const liveSegmentTweens = new Map();

export function playLiveSegment(gsap, master, index, cursor, { onComplete } = {}) {
  liveSegmentTweens.get(master)?.kill();
  if (cursor) {
    gsap.set(cursor, { scale: 1 });
  }
  const startLabel = label(index);
  const endLabel = index < 9 ? label(index + 1) : "live-end";
  const endPosition = index < 9 ? master.labels[endLabel] - 0.001 : endLabel;
  master.pause();
  master.invalidate();
  master.seek(startLabel, false);
  const tween = master.tweenTo(endPosition, {
    overwrite: "auto",
    immediateRender: true,
    onComplete: () => {
      liveSegmentTweens.delete(master);
      master.pause();
      onComplete?.();
    },
    onInterrupt: () => {
      liveSegmentTweens.delete(master);
      master.pause();
    },
  });
  liveSegmentTweens.set(master, tween);
  if (tween) tween.play(0);
  else master.play(startLabel);
  return tween;
}

export function seekLiveSegment(gsap, master, index, progress) {
  stopLiveSegment(master);
  const start = master.labels[label(index)];
  const end = master.labels[index < 9 ? label(index + 1) : "live-end"];
  const time = start + (end - start) * Math.max(0, Math.min(1, progress));
  if (master._scrubSegment !== index || time < master.time()) master.seek(start, true);
  master._scrubSegment = index;
  master.seek(time, false).pause();
}

export function stopLiveSegment(master) {
  if (master) {
    liveSegmentTweens.get(master)?.kill();
    liveSegmentTweens.delete(master);
    return;
  }
  liveSegmentTweens.forEach((tween) => tween.kill());
  liveSegmentTweens.clear();
}

export function buildSceneTimelines(gsap, scenes, cursor, { setHint, onSegmentComplete } = {}) {
  const timelines = [];
  const rf = scenes[2];
  preloadShowcase(rf);
  const segmentHooks = { onComplete: onSegmentComplete };

  const s0 = scenes[0];
  const t0 = gsap.timeline({ paused: true });
  const prompt1 = q(s0, "#term-prompt-1");
  const cmd = "$ npx reframe";
  t0.to({}, { duration: 0.3 });
  for (let i = 0; i <= cmd.length; i++) {
    t0.add(() => { if (prompt1) prompt1.textContent = cmd.slice(0, i); }, i * 0.06);
  }
  [["#term-out-1", "◆ Reframe v0.0.0"], ["#term-out-2", "◆ Starting…"], ["#term-out-3", "◆ Detecting framework…"]].forEach(([sel, text], i) => {
    t0.to(q(s0, sel), { opacity: 1, duration: 0.2 }, `+=${i === 0 ? 0.2 : 0.15}`);
    t0.add(() => { const el = q(s0, sel); if (el) el.textContent = text; });
  });
  timelines.push(t0);

  const s1 = scenes[1];
  const t1 = gsap.timeline({ paused: true });
  ["#det-1", "#det-2", "#det-3", "#det-4", "#det-5", "#det-6"].forEach((sel, i) => {
    t1.to(q(s1, sel), { opacity: 1, duration: 0.25 }, i * 0.35);
  });
  timelines.push(t1);

  const liveMaster = buildLiveMaster(gsap, rf, cursor, { setHint });
  for (let i = 2; i <= 9; i++) {
    timelines.push(makeSegmentProxy(gsap, liveMaster, i, cursor, segmentHooks));
  }

  return { timelines, liveMaster };
}

export function resetScene(gsap, sceneEl, index, liveMaster) {
  if (!sceneEl) return;
  if (index >= 2) {
    stopLiveSegment(liveMaster);
    resetReframeShowcase(sceneEl);
    return;
  }
  gsap.killTweensOf(sceneEl.querySelectorAll("*"));
  if (index === 0) {
    const prompt = sceneEl.querySelector("#term-prompt-1");
    if (prompt) prompt.textContent = "";
    sceneEl.querySelectorAll(".demo-terminal-line.output").forEach((l) => { l.style.opacity = "0"; });
  }
}
