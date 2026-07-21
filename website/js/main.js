import { initNav, initCopyButtons } from "./nav.js";
import { initMotion, prefersReducedMotion } from "./motion.js";
import { DemoController, initFullscreenDemo } from "./demo/DemoController.js";

function initDemo() {
  const stage = document.getElementById("demo-stage");
  const cursor = document.getElementById("demo-cursor");
  const pinContainer = document.getElementById("demo-pin");
  const scrollSpacer = document.getElementById("demo-scroll-spacer");
  const reducedMotion = prefersReducedMotion();

  if (!stage) return null;

  const controller = new DemoController({
    stage,
    cursor,
    dotsContainer: document.getElementById("demo-dots"),
    labelEl: document.getElementById("demo-scene-label"),
    prevBtn: document.getElementById("demo-prev"),
    nextBtn: document.getElementById("demo-next"),
    replayBtn: document.getElementById("demo-replay"),
    pinContainer,
    scrollSpacer,
    reducedMotion,
  });

  initFullscreenDemo(controller);

  controller.init();
  return controller;
}

document.addEventListener("DOMContentLoaded", () => {
  initNav();
  initCopyButtons();
  initDemo();
  initMotion(prefersReducedMotion());
  ScrollTrigger?.refresh();

  window.addEventListener("load", () => {
    ScrollTrigger?.refresh();
  });
});
