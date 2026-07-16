import { fileURLToPath } from "node:url";
import path from "node:path";

export const projectRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
export const fixtureTemplatesRoot = path.join(projectRoot, "tests", "fixtures", "templates");
export const viteBin = path.join(projectRoot, "node_modules", "vite", "bin", "vite.js");
