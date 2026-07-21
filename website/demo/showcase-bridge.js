/** Automated Reframe UI showcase — animated interactions via postMessage */

(function () {
  const params = new URLSearchParams(location.search);
  if (!params.has("embed")) return;

  const API_KEY = Symbol.for("reframe.browser-client");

  function shadow() {
    return document.querySelector("#reframe-root")?.shadowRoot;
  }

  function api() {
    return window[API_KEY];
  }

  function wait(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function reportCursor(x, y) {
    window.parent.postMessage({
      type: "reframe-showcase-cursor",
      x: (x / innerWidth) * 100,
      y: (y / innerHeight) * 100,
    }, "*");
  }

  function reportCursorOn(el) {
    if (!el) return;
    const r = el.getBoundingClientRect();
    reportCursor(r.left + r.width / 2, r.top + r.height / 2);
  }

  async function waitForReframe(timeout = 10000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const root = shadow();
      if (root?.querySelector("[data-reframe-state-label]") && api()) return root;
      await wait(80);
    }
    throw new Error("Reframe client not ready");
  }

  function pointerOpts(x, y) {
    return { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window, pointerId: 1, pointerType: "mouse", button: 0, buttons: 1 };
  }

  async function animatePointer(fromX, fromY, toX, toY, duration = 700) {
    const start = performance.now();
    document.dispatchEvent(new PointerEvent("pointermove", pointerOpts(fromX, fromY)));
    reportCursor(fromX, fromY);
    await wait(80);
    return new Promise((resolve) => {
      const tick = (now) => {
        const t = Math.min(1, (now - start) / duration);
        const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        const x = fromX + (toX - fromX) * eased;
        const y = fromY + (toY - fromY) * eased;
        reportCursor(x, y);
        document.dispatchEvent(new PointerEvent("pointermove", pointerOpts(x, y)));
        if (t < 1) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
  }

  async function pointerClickAt(x, y, target) {
    const opts = pointerOpts(x, y);
    const path = [];
    let node = target;
    while (node) { path.push(node); node = node.parentElement || node.parentNode; }
    path.push(document, window);
    target?.dispatchEvent(new PointerEvent("pointerdown", opts));
    await wait(50);
    target?.dispatchEvent(new PointerEvent("pointerup", opts));
    const click = new MouseEvent("click", { ...opts, detail: 1 });
    if (target) {
      Object.defineProperty(click, "target", { value: target });
      Object.defineProperty(click, "composedPath", { value: () => path });
    }
    document.dispatchEvent(click);
    reportCursor(x, y);
    await wait(120);
  }

  async function dragHandle(handle, deltaX, deltaY = 0, duration = 900) {
    if (!handle) return;
    const r = handle.getBoundingClientRect();
    const fromX = r.left + r.width / 2;
    const fromY = r.top + r.height / 2;
    const toX = fromX + deltaX;
    const toY = fromY + deltaY;
    const fire = (type, x, y) => handle.dispatchEvent(new PointerEvent(type, pointerOpts(x, y)));
    await animatePointer(fromX - 20, fromY, fromX, fromY, 350);
    fire("pointerdown", fromX, fromY);
    reportCursor(fromX, fromY);
    await wait(80);
    const start = performance.now();
    await new Promise((resolve) => {
      const tick = (now) => {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        const x = fromX + (toX - fromX) * eased;
        const y = fromY + (toY - fromY) * eased;
        reportCursor(x, y);
        fire("pointermove", x, y);
        document.dispatchEvent(new PointerEvent("pointermove", pointerOpts(x, y)));
        if (t < 1) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
    fire("pointerup", toX, toY);
    await wait(200);
  }

  async function shadowClick(sel) {
    const el = shadow()?.querySelector(sel);
    if (!el) return false;
    const r = el.getBoundingClientRect();
    await pointerClickAt(r.left + r.width / 2, r.top + r.height / 2, el);
    return true;
  }

  async function pageClickAnimated(selector) {
    const el = document.querySelector(selector);
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    await animatePointer(innerWidth * 0.45, innerHeight * 0.45, x, y, 700);
    await pointerClickAt(x, y, el);
    await wait(500);
    return true;
  }

  async function dragFromTo(fromX, fromY, toX, toY, duration = 900) {
    const down = pointerOpts(fromX, fromY);
    document.dispatchEvent(new PointerEvent("pointerdown", down));
    reportCursor(fromX, fromY);
    await wait(100);
    const start = performance.now();
    await new Promise((resolve) => {
      const tick = (now) => {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        const x = fromX + (toX - fromX) * eased;
        const y = fromY + (toY - fromY) * eased;
        reportCursor(x, y);
        document.dispatchEvent(new PointerEvent("pointermove", pointerOpts(x, y)));
        if (t < 1) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
    document.dispatchEvent(new PointerEvent("pointerup", pointerOpts(toX, toY)));
    await wait(200);
  }

  async function typeText(input, text, speed = 38) {
    if (!input) return;
    input.focus?.();
    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    for (const ch of text) {
      input.value += ch;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await wait(speed);
    }
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  const actions = {
    async revealChrome() {
      const hit = shadow()?.querySelector("[data-reframe-chrome-hit]");
      if (!hit) return;
      const r = hit.getBoundingClientRect();
      await animatePointer(24, 24, r.left + r.width / 2, r.top + r.height / 2, 500);
      hit.dispatchEvent(new PointerEvent("pointerenter", { bubbles: true }));
      hit.dispatchEvent(new PointerEvent("pointermove", { bubbles: true }));
      await wait(500);
    },

    async selectTool() {
      await shadowClick('[data-reframe-tool="select"]');
      await wait(200);
    },

    async openLayers() {
      await shadowClick("[data-reframe-toolbar-layers]");
      await wait(400);
      reportCursorOn(shadow()?.querySelector("[data-reframe-layers-panel]"));
    },

    async openDesign() {
      await shadowClick("[data-reframe-toolbar-design]");
      await wait(500);
      reportCursorOn(shadow()?.querySelector("[data-reframe-design-fill]"));
    },

    async openGenerate() {
      await shadowClick("[data-reframe-generate]");
      await wait(500);
    },

    async openComments() {
      await shadowClick('[data-reframe-tool="comment"]');
      await wait(350);
    },

    async openHistory() {
      const apiRef = api();
      if (apiRef?.openHistory) {
        apiRef.openHistory();
      } else {
        await shadowClick("[data-reframe-history-btn]");
      }
      await wait(500);
    },

    async closePanels() {
      shadow()?.querySelector("[data-reframe-annotation-close]")?.click();
      shadow()?.querySelector("[data-reframe-history-close]")?.click();
      shadow()?.querySelector("[data-reframe-ai-close]")?.click();
      await wait(200);
    },

    async selectElement(selector) {
      await actions.selectTool();
      await wait(200);
      await pageClickAnimated(selector);
      await wait(600);
    },

    async resizeSelected(delta = 72) {
      const handle = shadow()?.querySelector("[data-reframe-handle]");
      if (handle && !handle.hidden) {
        await dragHandle(handle, delta, 0, 900);
        return;
      }
      const client = api();
      const sel = client?.selection;
      if (sel?.width) client.previewWidth(sel.width + delta);
      await wait(600);
    },

    async moveSelected(dx = 0, dy = 24) {
      const handle = shadow()?.querySelector("[data-reframe-handle-move]");
      if (!handle || handle.hidden) return;
      await dragHandle(handle, dx, dy, 800);
    },

    async designFill(hex = "#7c3aed") {
      const fill = shadow()?.querySelector("[data-reframe-design-fill]");
      const hexInput = shadow()?.querySelector("[data-reframe-design-fill-hex]");
      if (!fill) return;
      reportCursorOn(fill);
      await wait(200);
      fill.value = hex;
      fill.dispatchEvent(new Event("input", { bubbles: true }));
      if (hexInput) hexInput.value = hex;
      await wait(400);
    },

    async designRadius(value = 999) {
      const input = shadow()?.querySelector('[data-reframe-design-field="border-radius"] input') ||
        shadow()?.querySelector("[data-reframe-layout-radius]");
      if (input) {
        reportCursorOn(input);
        await typeText(input, String(value), 50);
        await wait(300);
        return;
      }
      const el = document.querySelector("#hero-primary-cta");
      if (el) el.style.setProperty("border-radius", value + "px", "important");
      await wait(300);
    },

    async typeGeneratePrompt(text = "Make this button more prominent with a subtle glow") {
      await actions.openGenerate();
      const prompt = shadow()?.querySelector("[data-reframe-ai-prompt]");
      reportCursorOn(prompt);
      await typeText(prompt, text, 32);
      await wait(400);
      await shadowClick("[data-reframe-ai-generate]");
      await wait(800);
    },

    async addComment(text = "Increase contrast on this CTA for accessibility") {
      const client = api();
      if (client?.openComments) client.openComments();
      else await actions.openComments();
      await wait(400);
      const comment = shadow()?.querySelector("[data-reframe-annotation-comment]");
      reportCursorOn(comment);
      await typeText(comment, text, 30);
      await wait(250);
      await shadowClick("[data-reframe-annotation-save]");
      await wait(600);
    },

    async styleSelected() {
      await actions.designRadius(999);
      const el = document.querySelector("#hero-primary-cta");
      if (el) el.style.setProperty("box-shadow", "0 12px 32px rgba(124, 58, 237, 0.35)", "important");
      await wait(400);
    },

    async reset() {
      await actions.closePanels();
      api()?.clearSelection?.();
      const el = document.querySelector("#hero-primary-cta");
      if (el) {
        el.style.removeProperty("border-radius");
        el.style.removeProperty("box-shadow");
        el.style.removeProperty("background-color");
        el.style.removeProperty("width");
      }
      const title = document.querySelector("#hero-title");
      title?.style.removeProperty("outline");
      await wait(200);
    },
  };

  window.addEventListener("message", async (event) => {
    const data = event.data;
    if (!data || data.type !== "reframe-showcase-cmd") return;
    const { id, action, args = [] } = data;
    try {
      await waitForReframe();
      const fn = actions[action];
      if (!fn) throw new Error(`Unknown action: ${action}`);
      await fn(...args);
      event.source?.postMessage({ type: "reframe-showcase-ack", id }, "*");
    } catch (err) {
      event.source?.postMessage({ type: "reframe-showcase-ack", id, error: String(err) }, "*");
    }
  });

  waitForReframe()
    .then(() => window.parent.postMessage({ type: "reframe-showcase-ready" }, "*"))
    .catch(() => {});
})();
