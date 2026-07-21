import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto("http://localhost:4173/#tech", { waitUntil: "networkidle" });
await page.waitForTimeout(2000);
await page.click('a[href="#demo"]');
await page.waitForTimeout(2000);

const snap = await page.evaluate(() => {
  const techHeading = document.getElementById("tech-heading")?.getBoundingClientRect();
  const demoHeading = document.getElementById("demo-heading")?.getBoundingClientRect();
  const techItems = [...document.querySelectorAll(".tech-item")]
    .filter((el) => {
      const r = el.getBoundingClientRect();
      return r.top < 500 && r.bottom > 72;
    })
    .map((el) => el.querySelector(".name")?.textContent);
  return {
    scrollY: window.scrollY,
    techHeadingTop: techHeading ? Math.round(techHeading.top) : null,
    demoHeadingTop: demoHeading ? Math.round(demoHeading.top) : null,
    techItems,
    demoActive: ScrollTrigger.getAll().find((s) => s.trigger?.id === "demo-pin-wrapper")?.isActive,
    techActive: ScrollTrigger.getAll().find((s) => s.trigger?.id === "tech-pin")?.isActive,
    demoPos: getComputedStyle(document.getElementById("demo-pin")).position,
    techPos: getComputedStyle(document.getElementById("tech-pin")).position,
    overlap:
      techItems.length > 0 &&
      demoHeading &&
      demoHeading.top < 500 &&
      demoHeading.bottom > 72,
  };
});

console.log(JSON.stringify(snap, null, 2));
await page.screenshot({ path: "scripts/tech-to-demo.png" });
await browser.close();
