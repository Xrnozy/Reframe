/**
 * Injects UNMAPPED elements at runtime.
 * Styles live only in this file (inline / injected <style>) — NOT in style.css.
 * Reframe edits to these elements should go to .reframe/overrides.css.
 */

const RUNTIME_STYLE_ID = "reframe-runtime-unmapped-styles";
const PROMO_CLASS = "rf-x7k2m9-promo";
const BADGE_CLASS = "rf-x7k2m9-hero-badge";
const FIGMA_CLASS = "reframe-figma-import";

function injectRuntimeStyles() {
  if (document.getElementById(RUNTIME_STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = RUNTIME_STYLE_ID;
  style.textContent = `
    .${PROMO_CLASS} {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 9999;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 20px;
      background: linear-gradient(135deg, #ff6b35 0%, #f72585 100%);
      color: #fff;
      border-radius: 14px;
      box-shadow: 0 8px 32px rgba(247, 37, 133, 0.35), 0 2px 8px rgba(0,0,0,0.15);
      font-family: system-ui, sans-serif;
      font-size: 14px;
      font-weight: 600;
      animation: rf-promo-slide 0.5s ease-out;
    }
    .${PROMO_CLASS}__icon { font-size: 20px; }
    .${PROMO_CLASS}__text { max-width: 200px; line-height: 1.3; }
    .${PROMO_CLASS}__dismiss {
      background: rgba(255,255,255,0.2);
      border: none;
      color: #fff;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      cursor: pointer;
      font-size: 16px;
      line-height: 1;
    }
    @keyframes rf-promo-slide {
      from { transform: translateY(100px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    .${BADGE_CLASS} {
      position: absolute;
      top: 16px;
      right: 16px;
      z-index: 10;
      padding: 6px 14px;
      background: #ff4757;
      color: #fff;
      font-size: 12px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      border-radius: 6px;
      box-shadow: 0 4px 12px rgba(255, 71, 87, 0.4);
      transform: rotate(3deg);
    }
    .${FIGMA_CLASS} {
      margin: 24px;
      padding: 20px 24px;
      background: #fef3c7;
      border: 2px dashed #f59e0b;
      border-radius: 12px;
      font-family: Inter, system-ui, sans-serif;
    }
    .${FIGMA_CLASS} h3 {
      margin: 0 0 8px;
      font-size: 16px;
      color: #92400e;
    }
    .${FIGMA_CLASS} p {
      margin: 0;
      font-size: 14px;
      color: #b45309;
    }
  `;
  document.head.appendChild(style);
}

function injectPromoBanner() {
  const banner = document.createElement("div");
  banner.className = PROMO_CLASS;
  banner.setAttribute("data-reframe-unmapped", "promo-banner");
  banner.innerHTML = `
    <span class="${PROMO_CLASS}__icon">🎉</span>
    <span class="${PROMO_CLASS}__text">Limited offer: 20% off Annual plan!</span>
    <button class="${PROMO_CLASS}__dismiss" type="button" aria-label="Dismiss">×</button>
  `;
  banner.querySelector(`.${PROMO_CLASS}__dismiss`).addEventListener("click", () => {
    banner.remove();
  });
  document.body.appendChild(banner);
}

function injectHeroBadge() {
  const hero = document.getElementById("hero");
  if (!hero) return;

  const badge = document.createElement("span");
  badge.className = BADGE_CLASS;
  badge.setAttribute("data-reframe-unmapped", "hero-badge");
  badge.textContent = "Unmapped";
  hero.appendChild(badge);
}

function injectFigmaBlock() {
  const pricing = document.getElementById("pricing");
  if (!pricing) return;

  const block = document.createElement("div");
  block.className = FIGMA_CLASS;
  block.setAttribute("data-reframe-unmapped", "figma-paste");
  block.innerHTML = `
    <h3>Figma Import Block (unmapped)</h3>
    <p>Simulates a pasted Figma component with no source mapping. Edits go to overrides.css.</p>
  `;
  pricing.after(block);
}

function initCarousel() {
  const cards = document.querySelectorAll(".testimonial-card");
  const dots = document.querySelectorAll(".carousel-dot");
  if (!cards.length || !dots.length) return;

  dots.forEach((dot, index) => {
    dot.addEventListener("click", () => {
      cards.forEach((card, i) => {
        card.classList.toggle("testimonial-card--active", i === index);
      });
      dots.forEach((d, i) => {
        d.classList.toggle("carousel-dot--active", i === index);
        d.setAttribute("aria-selected", i === index ? "true" : "false");
      });
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  document.documentElement.dataset.demoReady = "true";
  injectRuntimeStyles();
  injectPromoBanner();
  injectHeroBadge();
  injectFigmaBlock();
  initCarousel();
});
