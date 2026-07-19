import { createSourceEditor } from "./packages/dev-server/dist/index.js";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const root = await mkdtemp(path.join(os.tmpdir(), "blade-"));
await mkdir(path.join(root, "resources", "views"), { recursive: true });
await writeFile(path.join(root, "resources", "views", "welcome.blade.php"), '<article id="card-annual" class="rounded w-80">Annual</article>');
const editor = createSourceEditor({ projectRoot: root, framework: "vanilla" });
const r = await editor.mapWidth({
  fingerprint: { tag: "article", id: "card-annual", classes: ["w-80"], text: "Annual", parent: { tag: "section", id: "cards", classes: [] }, route: "/", viewport: { width: 1280, height: 720 } },
  currentWidth: 320,
  width: 384,
});
console.log(JSON.stringify(r, null, 2));
await rm(root, { recursive: true, force: true });
