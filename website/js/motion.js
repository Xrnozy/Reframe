export function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function initMotion(reducedMotion) {
  if (typeof gsap === "undefined" || typeof ScrollTrigger === "undefined") return;

  gsap.registerPlugin(ScrollTrigger);

  if (reducedMotion) {
    document.documentElement.classList.add("reduced-motion");
    return;
  }

  initHero();
  initWhy();
  initWorkflow();
  initFeatures();
  initTech();
  initBenefits();
  initCta();
}

function initHero() {
  const lines = document.querySelectorAll(".hero h1 .line-inner");
  gsap.from(lines, {
    y: "110%",
    duration: 1,
    stagger: 0.12,
    ease: "power3.out",
    delay: 0.2,
  });

  gsap.from(".hero-eyebrow, .hero-sub, .hero-actions", {
    opacity: 0,
    y: 24,
    duration: 0.8,
    stagger: 0.1,
    ease: "power2.out",
    delay: 0.5,
  });

  const grid = document.querySelector(".hero-grid-bg");
  if (grid) {
    gsap.to(grid, {
      y: 80,
      ease: "none",
      scrollTrigger: {
        trigger: ".hero",
        start: "top top",
        end: "bottom top",
        scrub: 1,
      },
    });
  }
}

function initWhy() {
  gsap.from(".why [data-reveal]", {
    opacity: 0,
    x: 40,
    duration: 0.8,
    stagger: 0.15,
    ease: "power2.out",
    scrollTrigger: {
      trigger: ".why",
      start: "top 75%",
    },
  });

  const rule = document.querySelector("[data-rule]");
  if (rule) {
    gsap.from(rule, {
      scaleX: 0,
      duration: 1,
      ease: "power2.inOut",
      scrollTrigger: {
        trigger: rule,
        start: "top 85%",
      },
    });
  }
}

function initWorkflow() {
  const steps = document.querySelectorAll("[data-reveal-step]");
  steps.forEach((step, i) => {
    gsap.from(step, {
      opacity: 0,
      x: i % 2 === 0 ? -40 : 40,
      duration: 0.7,
      ease: "power2.out",
      scrollTrigger: {
        trigger: step,
        start: "top 85%",
      },
    });
  });
}

function initFeatures() {
  ScrollTrigger.batch("[data-reveal-batch]", {
    start: "top 90%",
    onEnter: (batch) => {
      gsap.from(batch, {
        opacity: 0,
        y: 30,
        duration: 0.6,
        stagger: 0.08,
        ease: "power2.out",
      });
    },
    once: true,
  });
}

function initTech() {
  const header = document.querySelector(".tech-header");
  if (header) {
    gsap.from(header.children, {
      opacity: 0,
      y: 28,
      duration: 0.7,
      stagger: 0.1,
      ease: "power2.out",
      scrollTrigger: {
        trigger: "#tech",
        start: "top 80%",
      },
    });
  }

  ScrollTrigger.batch("[data-tech-reveal]", {
    start: "top 88%",
    onEnter: (batch) => {
      gsap.from(batch, {
        opacity: 0,
        y: 36,
        duration: 0.55,
        stagger: 0.06,
        ease: "power2.out",
      });
    },
    once: true,
  });
}

function initBenefits() {
  const heading = document.querySelector("#benefits h2");
  if (heading) {
    gsap.from("#benefits .section-label, #benefits h2", {
      opacity: 0,
      y: 24,
      duration: 0.65,
      stagger: 0.08,
      ease: "power2.out",
      scrollTrigger: {
        trigger: "#benefits",
        start: "top 82%",
      },
    });
  }

  ScrollTrigger.batch("[data-reveal-benefit]", {
    start: "top 85%",
    onEnter: (batch) => {
      gsap.from(batch, {
        opacity: 0,
        y: 40,
        duration: 0.65,
        stagger: 0.12,
        ease: "power2.out",
      });
    },
    once: true,
  });
}

function initCta() {
  const cta = document.querySelector("[data-cta-reveal]");
  if (!cta) return;
  gsap.from(cta.children, {
    opacity: 0,
    scale: 0.95,
    duration: 0.7,
    stagger: 0.1,
    ease: "power2.out",
    scrollTrigger: {
      trigger: cta,
      start: "top 85%",
    },
  });
}
