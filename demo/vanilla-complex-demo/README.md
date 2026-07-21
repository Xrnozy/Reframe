# Vanilla Complex Demo

A richer Reframe test page with **mapped** elements (traceable to `index.html` + `style.css`) and **unmapped** elements (runtime-injected, edits go to `.reframe/overrides.css`).

## Mapped (source-editable)

Elements defined in `index.html` and styled in `style.css`:

| Selector | Description |
|----------|-------------|
| `#site-header`, `.site-header` | Sticky header with nav |
| `#brand-logo`, `#primary-nav`, `.nav-link` | Brand and navigation links |
| `#primary-cta`, `#secondary-cta` | Header action buttons |
| `#sticky-subnav`, `.subnav-link` | Sticky section subnav |
| `#hero`, `#hero-eyebrow`, `#hero-title`, `#hero-subtitle` | Hero section |
| `#hero-actions`, `#hero-primary-cta`, `#hero-secondary-cta` | Hero CTAs |
| `#hero-badges`, `.badge-pill--mapped` | Mapped badge pills |
| `#hero-sidebar`, `.hero-sidebar__card` | Overlapping sidebar cards |
| `#pricing`, `#pricing-grid`, `.pricing-card` | Pricing section |
| `#card-starter`, `#card-annual`, `#card-enterprise` | Pricing cards |
| `#pricing-cta-annual` | Featured plan CTA |
| `#stats`, `#stats-row`, `.stat-card` | Dark stats row |
| `#stat-users`, `#stat-edits`, `#stat-uptime`, `#stat-teams` | Individual stat cards |
| `#features`, `#features-sidebar`, `#feature-table` | Feature matrix + zebra table |
| `#testimonials`, `#testimonial-carousel`, `.testimonial-card` | Testimonial carousel |
| `#testimonial-1`, `#testimonial-2`, `#testimonial-3` | Individual testimonials |
| `#carousel-dots`, `.carousel-dot` | Carousel navigation dots |
| `#cta-banner`, `#cta-banner-title`, `#cta-banner-btn` | Bottom CTA banner |
| `#site-footer`, `.site-footer__nav` | Footer |

## Unmapped (override-only)

Injected by `script.js` at runtime — **no styles in `style.css`**:

| Selector / attribute | Description |
|---------------------|-------------|
| `.rf-x7k2m9-promo` | Floating promo banner (fixed bottom-right) |
| `.rf-x7k2m9-promo__text`, `__dismiss`, `__icon` | Promo banner children |
| `.rf-x7k2m9-hero-badge` | "Unmapped" badge overlay on hero |
| `.reframe-figma-import` | Simulated Figma paste block after pricing |
| `[data-reframe-unmapped]` | All unmapped elements carry this attribute |

## Run

From repo root (after `npm run build`):

```bash
cd demo/vanilla-complex-demo
node ../../packages/cli/dist/bin.js
```

Or with Vite directly:

```bash
cd demo/vanilla-complex-demo
npm run dev
```
