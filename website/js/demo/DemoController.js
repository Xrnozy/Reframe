import {
  mountScenes,
  getScenes,
  SCENE_TITLES,
  SCENE_HINTS,
} from "./mockups.js";
import { buildSceneTimelines, resetScene, stopLiveSegment, playLiveSegment, seekLiveSegment, preloadShowcase } from "./scenes.js";

export class DemoController {
  constructor(options) {
    this.stage = options.stage;
    this.cursor = options.cursor;
    this.dotsContainer = options.dotsContainer;
    this.labelEl = options.labelEl;
    this.prevBtn = options.prevBtn;
    this.nextBtn = options.nextBtn;
    this.replayBtn = options.replayBtn;
    this.pinContainer = options.pinContainer;
    this.scrollSpacer = options.scrollSpacer;
    this.hintBar = options.hintBar ?? null;
    this.reducedMotion = options.reducedMotion ?? false;
    this.manualScrub = options.manualScrub ?? false;
    this.initialScene = options.initialScene ?? 0;

    this.currentScene = 0;
    this.scenes = [];
    this.timelines = [];
    this.liveMaster = null;
    this.scrollTrigger = null;
    this.stageWrap = null;
    this._showcaseReady = false;
    this._ignoreScrollUpdate = false;
    this._manualProgress = this.initialScene / SCENE_TITLES.length;
  }

  _sceneFromProgress(progress) {
    const total = SCENE_TITLES.length;
    return Math.min(total - 1, Math.max(0, Math.floor(progress * total)));
  }

  _scrollYForScene(index) {
    const st = this.scrollTrigger;
    if (!st) return 0;
    const total = SCENE_TITLES.length;
    const progress = (index + 0.04) / total;
    return st.start + progress * (st.end - st.start);
  }

  _syncScrollToScene(index) {
    if (!this.scrollTrigger) {
      if (this.manualScrub) this.scrubTo((index + 0.01) / SCENE_TITLES.length);
      return;
    }
    this._ignoreScrollUpdate = true;
    scrollTo({ top: this._scrollYForScene(index), behavior: "auto" });
    requestAnimationFrame(() => { this._ignoreScrollUpdate = false; });
  }

  _playLiveScene(index) {
    if (index < 2 || !this.liveMaster) return;
    const run = () => {
      if (this.cursor) gsap.set(this.cursor, { scale: 1 });
      playLiveSegment(gsap, this.liveMaster, index, this.cursor);
    };
    if (this._showcaseReady) {
      run();
      return;
    }
    preloadShowcase(this.scenes[2]).then(() => {
      this._showcaseReady = true;
      if (this.currentScene === index) run();
    });
  }

  init() {
    mountScenes(this.stage);
    this.scenes = getScenes(this.stage);
    this.stageWrap = this.stage.closest(".demo-stage-wrap");
    this.hintBar ??= document.getElementById("demo-hint-bar");

    const built = buildSceneTimelines(gsap, this.scenes, this.cursor, {
      setHint: (i) => this.setHint(i),
    });
    this.timelines = built.timelines;
    this.liveMaster = built.liveMaster;
    preloadShowcase(this.scenes[2]).then(() => { this._showcaseReady = true; });

    this.renderDots();
    this.bindControls();

    if (!this.reducedMotion && this.pinContainer) {
      this.setupScrollPin();
    }
    if (this.manualScrub) this.bindManualScrub();
    this.goToScene(this.initialScene, false, { play: !this.scrollTrigger && !this.manualScrub });
    if (this.manualScrub) this.scrubTo(this._manualProgress);
  }

  setHint(index) {
    const text = index >= 0 ? SCENE_HINTS[index] : null;
    if (!this.hintBar) return;
    if (!text) {
      this.hintBar.hidden = true;
    } else {
      this.hintBar.hidden = false;
      this.hintBar.textContent = text;
    }
  }

  renderDots() {
    if (!this.dotsContainer) return;
    this.dotsContainer.innerHTML = "";
    SCENE_TITLES.forEach((_, i) => {
      const dot = document.createElement("span");
      dot.className = "demo-progress-dot" + (i === 0 ? " active" : "");
      this.dotsContainer.appendChild(dot);
    });
  }

  bindControls() {
    this.prevBtn?.addEventListener("click", () => this._navigateByControl(this.currentScene - 1));
    this.nextBtn?.addEventListener("click", () => this._navigateByControl(this.currentScene + 1));
    this.replayBtn?.addEventListener("click", () => {
      this._pauseForControl();
      this.replay();
    });
    document.getElementById("demo-skip-btn")?.addEventListener("click", () => this._navigateByControl(2));

    this.stageWrap?.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") { e.preventDefault(); this._navigateByControl(this.currentScene - 1); }
      if (e.key === "ArrowRight") { e.preventDefault(); this._navigateByControl(this.currentScene + 1); }
    });
  }

  _pauseForControl() {
    stopLiveSegment(this.liveMaster);
    this.liveMaster?.pause();
  }

  _navigateByControl(index) {
    this._pauseForControl();
    this.goToScene(index, false, { syncScroll: true, play: false });
  }

  bindManualScrub() {
    this.stageWrap?.addEventListener("wheel", (event) => {
      event.preventDefault();
      this.scrubTo(this._manualProgress + event.deltaY / (SCENE_TITLES.length * 650));
    }, { passive: false });
  }

  setupScrollPin() {
    if (!this.pinContainer || !this.scrollSpacer) return;
    const wrapper = document.getElementById("demo-pin-wrapper");
    const navOffset = () => parseInt(getComputedStyle(document.documentElement).getPropertyValue("--nav-height"), 10) || 72;

    this.scrollTrigger = ScrollTrigger.create({
      trigger: wrapper,
      start: () => `top top+=${navOffset()}`,
      end: () => `+=${this.scrollSpacer.offsetHeight}`,
      pin: this.pinContainer,
      pinSpacing: false,
      anticipatePin: 1,
      invalidateOnRefresh: true,
      zIndex: 40,
      onToggle: (self) => {
        self.pin.style.top = self.isActive ? `${navOffset()}px` : "";
        self.pin.style.zIndex = self.isActive ? "40" : "";
        if (self.isActive) this.scrubTo(self.progress);
        else stopLiveSegment(this.liveMaster);
      },
      onUpdate: (self) => {
        if (this._ignoreScrollUpdate) return;
        this.scrubTo(self.progress);
      },
    });
  }

  scrubTo(progress) {
    progress = Math.max(0, Math.min(0.999999, progress));
    this._manualProgress = progress;
    const scaled = progress * SCENE_TITLES.length;
    const index = Math.floor(scaled);
    const local = scaled - index;
    if (index !== this.currentScene) this.goToScene(index, false, { play: false });
    if (index < 2) this.timelines[index]?.progress(local).pause();
    else seekLiveSegment(gsap, this.liveMaster, index, local);
  }

  goToScene(index, animate = true, { syncScroll = false, play = true } = {}) {
    index = Math.max(0, Math.min(SCENE_TITLES.length - 1, index));
    const prev = this.currentScene;
    if (index === prev && animate) {
      this.replay();
      return;
    }

    const isLive = index >= 2;

    stopLiveSegment(this.liveMaster);

    if (prev < 2) this.timelines[prev]?.pause(0);
    this.currentScene = index;
    const physical = index < 2 ? index : 2;
    this.scenes.forEach((s, i) => s.classList.toggle("is-active", i === physical));

    this.dotsContainer?.querySelectorAll(".demo-progress-dot").forEach((d, i) => {
      d.classList.toggle("active", i === index);
    });

    const title = this.labelEl?.querySelector(".demo-scene-title") || this.labelEl;
    if (title) title.textContent = `${index + 1}/${SCENE_TITLES.length} — ${SCENE_TITLES[index]}`;

    this.stageWrap?.classList.toggle("is-live-mode", isLive);
    this.stageWrap?.classList.toggle("is-terminal-mode", index < 2);

    if (!isLive && this.cursor) gsap.set(this.cursor, { opacity: 0, scale: 1 });

    this.setHint(index);

    if (isLive && play) {
      if (prev < 2 && index > 2) {
        resetScene(gsap, this.scenes[2], 2, this.liveMaster);
      }
      this._playLiveScene(index);
    } else if (play) {
      this.timelines[index]?.restart();
    }

    if (syncScroll) this._syncScrollToScene(index);
  }

  prev() { this._navigateByControl(this.currentScene - 1); }
  next() { this._navigateByControl(this.currentScene + 1); }

  replay() {
    if (this.scrollTrigger || this.manualScrub) {
      this._syncScrollToScene(this.currentScene);
      this.scrubTo((this.currentScene + 0.01) / SCENE_TITLES.length);
      return;
    }
    const physical = this.currentScene < 2 ? this.currentScene : 2;
    if (this.currentScene >= 2) {
      resetScene(gsap, this.scenes[physical], this.currentScene, this.liveMaster);
      this._playLiveScene(this.currentScene);
      return;
    }
    resetScene(gsap, this.scenes[physical], this.currentScene, this.liveMaster);
    if (this.cursor) gsap.set(this.cursor, { opacity: 0, scale: 1 });
    this.timelines[this.currentScene]?.restart();
  }

  destroy() {
    stopLiveSegment(this.liveMaster);
    this.scrollTrigger?.kill();
    this.timelines.forEach((t) => t.kill?.());
    this.liveMaster?.kill();
  }
}

export function initFullscreenDemo(mainController) {
  const overlay = document.getElementById("demo-fullscreen");
  const openBtn = document.getElementById("demo-fullscreen-btn");
  const closeBtn = document.getElementById("demo-fs-close");
  let fsController = null;

  openBtn?.addEventListener("click", () => {
    overlay?.classList.add("is-open");
    document.body.style.overflow = "hidden";
    if (!fsController) {
      fsController = new DemoController({
        stage: document.getElementById("demo-fs-stage"),
        cursor: document.getElementById("demo-fs-cursor"),
        dotsContainer: document.getElementById("demo-fs-dots"),
        labelEl: document.getElementById("demo-fs-title"),
        prevBtn: document.getElementById("demo-fs-prev"),
        nextBtn: document.getElementById("demo-fs-next"),
        replayBtn: document.getElementById("demo-fs-replay"),
        hintBar: document.getElementById("demo-fs-hint"),
        reducedMotion: true,
        manualScrub: true,
        initialScene: Math.max(2, mainController.currentScene),
      });
      fsController.init();
    } else {
      fsController.goToScene(Math.max(2, mainController.currentScene), false);
    }
  });

  closeBtn?.addEventListener("click", () => {
    overlay?.classList.remove("is-open");
    document.body.style.overflow = "";
  });

  overlay?.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      overlay.classList.remove("is-open");
      document.body.style.overflow = "";
    }
  });
}
