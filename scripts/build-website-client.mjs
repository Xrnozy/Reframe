#!/usr/bin/env node
/** Copy built browser-client IIFE into website/assets for standalone demo embed. */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const clientModule = pathToFileURL(join(root, "packages/browser-client/dist/index.js")).href;
const { BROWSER_CLIENT_SOURCE } = await import(clientModule);

const outDir = join(root, "website", "assets");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "reframe-client.js"), BROWSER_CLIENT_SOURCE, "utf8");
console.log("Wrote website/assets/reframe-client.js");
