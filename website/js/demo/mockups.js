/** DOM builders — terminal scenes + real Reframe client in iframe */

export const SCENE_TITLES = [
  "Start Reframe",
  "Connect the local app",
  "Inspect the live page",
  "Select one real element",
  "Preview a safer CTA change",
  "Ask Codex to refine the CTA",
  "Review the Codex proposal",
  "Write source and hot reload",
  "Leave a source-linked note",
  "Review or restore the result",
];

export const SCENE_HINTS = [
  "1. Run npx reframe inside an existing project. Nothing is copied into a separate editor.",
  "2. Reframe detects the framework and connects to the project's real local dev server.",
  "3. Open Layers to inspect the DOM rendered by the running app.",
  "4. Select Start building. The outline and demo/style.css:75 show the element and its source.",
  "5. Drag the handle, then adjust fill and corners. The button changes as a preview; no file is written yet.",
  "6. Ask Codex to refine the same CTA. Reframe includes its element, source, and project design context.",
  "7. Codex returns a review for demo/style.css. Compare, refine, or reject it; Accept approves the result.",
  "8. After Accept, Reframe writes the mapped CSS file and the real dev server hot reloads the button.",
  "9. Attach a note to that CTA. It stays in .reframe/annotations and can travel through Git.",
  "10. Every accepted change becomes a local checkpoint. Review it or restore the previous result.",
];

export function createTerminalScene() {
  const el = document.createElement("div");
  el.className = "demo-scene demo-scene-terminal";
  el.dataset.scene = "terminal";
  el.innerHTML = `
    <div class="demo-terminal">
      <div class="demo-terminal-bar">
        <span class="demo-terminal-dot red"></span>
        <span class="demo-terminal-dot yellow"></span>
        <span class="demo-terminal-dot green"></span>
        <span class="rf-path">~/projects/my-app</span>
      </div>
      <div class="demo-terminal-body">
        <div class="demo-terminal-line prompt" id="term-prompt-1"></div>
        <div class="demo-terminal-line output" id="term-out-1" style="opacity:0"></div>
        <div class="demo-terminal-line output" id="term-out-2" style="opacity:0"></div>
        <div class="demo-terminal-line output" id="term-out-3" style="opacity:0"></div>
      </div>
    </div>`;
  return el;
}

export function createDetectScene() {
  const el = document.createElement("div");
  el.className = "demo-scene demo-scene-detect";
  el.dataset.scene = "detect";
  el.innerHTML = `
    <div class="demo-terminal">
      <div class="demo-terminal-bar">
        <span class="demo-terminal-dot red"></span>
        <span class="demo-terminal-dot yellow"></span>
        <span class="demo-terminal-dot green"></span>
      </div>
      <div class="demo-terminal-body">
        <div class="demo-terminal-line output">$ npx reframe</div>
        <div class="demo-terminal-line output" id="det-1" style="opacity:0">◆ Reframe v0.0.0</div>
        <div class="demo-terminal-line output" id="det-2" style="opacity:0">◆ Scanning project…</div>
        <div class="demo-terminal-line highlight" id="det-3" style="opacity:0">✓ Detected: Vite + vanilla HTML/CSS</div>
        <div class="demo-terminal-line output" id="det-4" style="opacity:0">✓ Dev server: npm run dev → :5173</div>
        <div class="demo-terminal-line output" id="det-5" style="opacity:0">✓ Proxy ready → http://127.0.0.1:4400</div>
        <div class="demo-terminal-line highlight" id="det-6" style="opacity:0">→ Opening browser…</div>
      </div>
    </div>`;
  return el;
}

/** Real Reframe browser-client loaded in iframe — product UI 1:1 */
export function createReframeShowcaseScene() {
  const el = document.createElement("div");
  el.className = "demo-scene demo-scene-reframe";
  el.dataset.scene = "reframe";
  el.innerHTML = `
    <div class="demo-browser demo-showcase-wrap">
      <div class="demo-browser-chrome">
        <div class="demo-browser-dots"><span></span><span></span><span></span></div>
        <div class="demo-browser-url">http://127.0.0.1:4400</div>
      </div>
      <div class="demo-browser-viewport demo-showcase-viewport">
        <iframe
          class="demo-showcase-iframe"
          title="Reframe visual editor"
          src="demo/showcase.html"
          loading="eager"
          tabindex="-1"
        ></iframe>
      </div>
    </div>`;
  return el;
}

export function mountScenes(container) {
  container.innerHTML = "";
  [createTerminalScene, createDetectScene, createReframeShowcaseScene].forEach((builder, i) => {
    const scene = builder();
    if (i === 0) scene.classList.add("is-active");
    container.appendChild(scene);
  });
}

export function getScenes(container) {
  return [...container.querySelectorAll(".demo-scene")];
}

export function getShowcaseIframe(scene) {
  return scene?.querySelector(".demo-showcase-iframe") ?? null;
}
