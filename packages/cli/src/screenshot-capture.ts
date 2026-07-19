import type { HistoryStoreOptions } from "@reframe/dev-server";
import { chromium, type Browser, type Page } from "playwright-core";

export function createBrowserScreenshotCapture(upstream: string): { capture: NonNullable<HistoryStoreOptions["captureScreenshot"]>; verifyResponsive(route: string, viewports: readonly number[]): Promise<readonly { width: number; passed: boolean; findings: readonly string[] }[]>; close(): Promise<void> } {
  let browser: Promise<Browser> | undefined; let page: Promise<Page> | undefined; let queue = Promise.resolve();
  const getPage = () => page ??= (browser ??= chromium.launch({ channel: "chrome", headless: true })).then((value) => value.newPage());
  return {
    capture(_stage, context, kind) {
      const result = queue.catch(() => undefined).then(async () => {
        const current = await getPage(); const viewport = context.request.fingerprint.viewport; await current.setViewportSize({ width: Math.max(1, viewport.width), height: Math.max(1, viewport.height) }); await current.goto(new URL(context.request.fingerprint.route, upstream).href, { waitUntil: "domcontentloaded", timeout: 10_000 }); await current.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
        if (kind === "page") return current.screenshot({ fullPage: true, type: "png" });
        const handle = await current.evaluateHandle((fingerprint) => { if (fingerprint.id) return document.getElementById(fingerprint.id); const candidates = [...document.querySelectorAll(fingerprint.tag)].filter((element) => fingerprint.classes.every((name) => element.classList.contains(name))); return candidates.find((element) => (element.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 256) === fingerprint.text) ?? (candidates.length === 1 ? candidates[0] : null); }, context.request.fingerprint);
        const element = handle.asElement(); if (!element) { await handle.dispose(); throw new Error("SCREENSHOT_COMPONENT_NOT_FOUND"); }
        try { return await element.screenshot({ type: "png" }); } finally { await element.dispose(); }
      });
      queue = result.then(() => undefined, () => undefined); return result;
    },
    verifyResponsive(route, viewports) {
      const result = queue.catch(() => undefined).then(async () => {
        const current = await getPage(); const results = [];
        for (const width of viewports) {
          await current.setViewportSize({ width, height: 900 }); await current.goto(new URL(route, upstream).href, { waitUntil: "domcontentloaded", timeout: 10_000 }); await current.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
          const findings = await current.evaluate(() => { const issues: string[] = []; if (document.documentElement.scrollWidth > innerWidth + 1) issues.push(`horizontal overflow ${document.documentElement.scrollWidth - innerWidth}px`); for (const element of document.querySelectorAll("img")) if (!element.hasAttribute("alt")) issues.push("image missing alt"); for (const element of document.querySelectorAll("button,a[href],input,select,textarea")) { const label = element.getAttribute("aria-label") || element.getAttribute("title") || (element.textContent ?? "").trim() || (element instanceof HTMLInputElement ? element.labels?.[0]?.textContent?.trim() : ""); if (!label) issues.push(`${element.tagName.toLowerCase()} missing accessible name`); } return [...new Set(issues)].slice(0, 32); });
          results.push({ width, passed: findings.length === 0, findings });
        }
        return results;
      }); queue = result.then(() => undefined, () => undefined); return result;
    },
    async close() { await queue.catch(() => undefined); const current = await browser?.catch(() => undefined); browser = undefined; page = undefined; await current?.close(); },
  };
}
