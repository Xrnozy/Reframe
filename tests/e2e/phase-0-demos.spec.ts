import { readdir } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { reservePort } from "../helpers/port-probe.js";
import { startViteDemo, type ManagedProcess } from "../helpers/process-harness.js";
import { projectRoot } from "../helpers/paths.js";

let vanillaServer: ManagedProcess | undefined;
let reactServer: ManagedProcess | undefined;
let vanillaUrl = "";
let reactUrl = "";

test.beforeAll(async () => {
  const vanillaPort = await reservePort();
  const reactPort = await reservePort();
  await Promise.all([vanillaPort.release(), reactPort.release()]);
  vanillaUrl = `http://127.0.0.1:${vanillaPort.port}/`;
  reactUrl = `http://127.0.0.1:${reactPort.port}/`;
  try {
    vanillaServer = await startViteDemo(path.join(projectRoot, "demo", "vanilla-demo"), vanillaPort.port);
    reactServer = await startViteDemo(path.join(projectRoot, "demo", "react-demo"), reactPort.port);
  } catch (error) {
    await vanillaServer?.stop();
    throw error;
  }
});

test.afterAll(async () => {
  await Promise.all([vanillaServer?.stop(), reactServer?.stop()]);
});

test("P0-01 Vanilla renders the exact stable demo surface once without page errors", async ({ page }) => {
  const errors: string[] = [];
  const nonLoopbackRequests: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (new URL(request.url()).hostname !== "127.0.0.1") nonLoopbackRequests.push(request.url());
  });
  await page.goto(vanillaUrl, { waitUntil: "networkidle" });
  await expect(page.locator("#site-header")).toHaveCount(1);
  await expect(page.locator("#hero")).toHaveCount(1);
  await expect(page.locator("#primary-cta")).toHaveCount(1);
  await expect(page.locator("#pricing-grid article")).toHaveCount(3);
  await expect(page.locator("#site-footer")).toHaveCount(1);
  const ids = await page.locator("[id]").evaluateAll((elements) => elements.map((element) => element.id));
  expect(new Set(ids).size).toBe(ids.length);
  expect(errors).toEqual([]);
  expect(nonLoopbackRequests).toEqual([]);
});

test("P0-02 React Vite renders Navbar, Hero, three PricingCards, and one unambiguous annual target with no TypeScript", async ({ page }) => {
  const errors: string[] = [];
  const nonLoopbackRequests: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (new URL(request.url()).hostname !== "127.0.0.1") nonLoopbackRequests.push(request.url());
  });
  try {
    await page.goto(reactUrl, { waitUntil: "networkidle" });
  } catch (error) {
    throw new Error(`${String(error)}\nserver stdout=${reactServer?.stdout.join("")}\nserver stderr=${reactServer?.stderr.join("")}`);
  }
  await expect(page.locator("#site-header")).toHaveCount(1);
  await expect(page.locator("#hero")).toHaveCount(1);
  await expect(page.locator(".pricing-card")).toHaveCount(3);
  await expect(page.locator('[data-reframe-edit-target="annual-plan"]')).toHaveCount(1);
  await expect(page.locator('[data-reframe-edit-target="annual-plan"]')).toHaveAttribute("data-plan", "annual");
  const sourceRoot = path.resolve("demo", "react-demo", "src");
  const sourceFiles = await readdir(sourceRoot, { recursive: true });
  expect(sourceFiles.filter((file) => /\.tsx?$/i.test(String(file)))).toEqual([]);
  expect(errors).toEqual([]);
  expect(nonLoopbackRequests).toEqual([]);
});
