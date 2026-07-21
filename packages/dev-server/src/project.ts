import { mkdir, readFile, readdir, realpath, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";
export type ProjectFramework =
  | "vanilla"
  | "react-vite"
  | "react-vite-typescript"
  | "next"
  | "nuxt"
  | "angular"
  | "astro"
  | "svelte"
  | "sveltekit"
  | "vue"
  | "laravel"
  | "unknown";
export type ProjectStyling = "plain-css" | "css-modules" | "tailwind" | "unknown";

const sourceEditableFrameworks = new Set<ProjectFramework>(["vanilla", "react-vite", "react-vite-typescript", "next", "laravel"]);
const previewableFrameworks = new Set<ProjectFramework>(["nuxt", "angular", "astro", "svelte", "sveltekit", "vue"]);

export function proxyFramework(framework: ProjectFramework): "react" | "vanilla" {
  return framework === "react-vite" || framework === "react-vite-typescript" || framework === "next" ? "react" : "vanilla";
}

export function frameworkLabel(framework: ProjectFramework): string {
  switch (framework) {
    case "react-vite": return "React + Vite";
    case "react-vite-typescript": return "React + Vite + TypeScript";
    case "next": return "Next.js";
    case "nuxt": return "Nuxt (preview)";
    case "angular": return "Angular (preview)";
    case "astro": return "Astro (preview)";
    case "svelte": return "Svelte (preview)";
    case "sveltekit": return "SvelteKit (preview)";
    case "vue": return "Vue (preview)";
    case "laravel": return "Laravel";
    case "vanilla": return "Vanilla HTML/CSS";
    default: return framework;
  }
}

export interface ProjectCommand {
  readonly executable: string;
  readonly args: readonly string[];
  readonly script: string;
}

export interface ProjectStack {
  readonly framework: ProjectFramework;
  readonly packageManager: PackageManager | null;
  readonly devCommand: readonly string[] | null;
  readonly defaultPort: number | null;
  readonly confidence: "high" | "medium" | "low";
}

export interface ProjectDescriptor {
  readonly version: 1;
  readonly root: string;
  readonly framework: ProjectFramework;
  readonly styling: ProjectStyling;
  readonly packageManager: PackageManager | null;
  readonly command: ProjectCommand | null;
  readonly capabilities: {
    readonly canProxy: boolean;
    readonly canExplore: boolean;
    readonly canWriteSource: boolean;
    readonly canStart: boolean;
  };
  readonly confidence: "high" | "medium" | "low";
  readonly evidence: readonly string[];
}

export interface DetectProjectOptions {
  packageManagerChoice?: PackageManager;
  commandChoice?: string;
  frameworkChoice?: ProjectFramework;
  devCommandOverride?: string;
  approveConfigWrite?: boolean;
}

const frameworkChoices: readonly ProjectFramework[] = ["react-vite", "react-vite-typescript", "next", "nuxt", "angular", "astro", "vue", "svelte", "sveltekit", "laravel", "vanilla"];

const frameworkDefaultPorts: Readonly<Partial<Record<ProjectFramework, number>>> = {
  "react-vite": 5173,
  "react-vite-typescript": 5173,
  next: 3000,
  nuxt: 3000,
  angular: 4200,
  astro: 4321,
  vue: 5173,
  svelte: 5173,
  sveltekit: 5173,
  laravel: 8000,
};

const configMarkers: ReadonlyArray<readonly [RegExp, string]> = [
  [/^next\.config\.(?:js|mjs|cjs|ts)$/, "framework:next-config"],
  [/^nuxt\.config\.(?:js|mjs|ts)$/, "framework:nuxt-config"],
  [/^vite\.config\.(?:js|mjs|ts)$/, "framework:vite-config"],
  [/^vue\.config\.(?:js|mjs|cjs|ts)$/, "framework:vue-config"],
  [/^svelte\.config\.(?:js|mjs|cjs|ts)$/, "framework:svelte-config"],
  [/^astro\.config\.(?:js|mjs|ts)$/, "framework:astro-config"],
  [/^angular\.json$/, "framework:angular-config"],
  [/^tailwind\.config\.(?:js|cjs|mjs|ts)$/, "framework:tailwind-config"],
  [/^postcss\.config\.(?:js|cjs|mjs|ts)$/, "styling:postcss-config"],
];

export class ProjectError extends Error {
  constructor(readonly code: string, message: string, readonly choices: readonly string[] = []) {
    super(`${code}: ${message}`);
    this.name = "ProjectError";
  }
}

interface PackageFile {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

interface SavedConfig {
  version: 1;
  root: string;
  packageManager: PackageManager;
  script: string;
}

const managerLocks: Readonly<Record<PackageManager, readonly string[]>> = {
  npm: ["package-lock.json"],
  pnpm: ["pnpm-lock.yaml"],
  yarn: ["yarn.lock"],
  bun: ["bun.lock", "bun.lockb"],
};

async function exists(file: string): Promise<boolean> {
  return stat(file).then(() => true, () => false);
}

async function canonicalRoot(root: string): Promise<string> {
  try {
    const canonical = await realpath(path.resolve(root));
    if (!(await stat(canonical)).isDirectory()) throw new Error("not a directory");
    return canonical;
  } catch {
    throw new ProjectError("PROJECT_ROOT_INVALID", `The selected project root is not an existing directory: ${path.resolve(root)}. Evidence checked: selected directory only; no parent folders were scanned.`);
  }
}

function jsonLine(raw: string, error: unknown): number | undefined {
  const match = String(error).match(/position\s+(\d+)/i);
  if (!match) return undefined;
  const position = Number(match[1]);
  return raw.slice(0, position).split(/\r?\n/).length;
}

async function packageFile(root: string): Promise<PackageFile | null> {
  const filename = path.join(root, "package.json");
  if (!(await exists(filename))) return null;
  const raw = await readFile(filename, "utf8");
  try {
    const parsed = JSON.parse(raw) as PackageFile;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("root must be an object");
    return parsed;
  } catch (error) {
    const line = jsonLine(raw, error);
    throw new ProjectError("PACKAGE_JSON_INVALID", `Cannot parse ${filename}${line ? ` at line ${line}` : ""}: ${String(error)}. No command was started and no files were changed.`);
  }
}

async function detectManager(root: string, choice?: PackageManager): Promise<{ manager: PackageManager | null; evidence: string[] }> {
  const present: PackageManager[] = [];
  const evidence: string[] = [];
  for (const manager of Object.keys(managerLocks) as PackageManager[]) {
    const found = [];
    for (const lock of managerLocks[manager]) if (await exists(path.join(root, lock))) found.push(lock);
    if (found.length) {
      present.push(manager);
      evidence.push(`package-manager:${manager}:${found.join(",")}`);
    }
  }
  if (present.length > 1) {
    if (!choice || !present.includes(choice)) {
      throw new ProjectError("PACKAGE_MANAGER_AMBIGUOUS", `Conflicting package managers were detected: ${present.join(", ")}. Choose one explicitly before startup.`, present);
    }
    evidence.push(`package-manager-choice:${choice}`);
    return { manager: choice, evidence };
  }
  if (choice && !present.includes(choice)) throw new ProjectError("PACKAGE_MANAGER_INVALID", `The selected package manager ${choice} has no matching lockfile in ${root}.`, present);
  return { manager: present[0] ?? null, evidence };
}

async function projectSourceFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  const queue = [root];
  while (queue.length) {
    const directory = queue.pop()!;
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!["node_modules", ".git", ".reframe", "dist", "build", "coverage"].includes(entry.name)) queue.push(path.join(directory, entry.name));
      } else if (entry.isFile() && /\.(?:blade\.php|[cm]?[jt]sx?|css|vue|svelte)$/i.test(entry.name)) files.push(path.join(directory, entry.name));
    }
  }
  return files;
}

async function composerFile(root: string): Promise<{ require?: Record<string, string> } | null> {
  const filename = path.join(root, "composer.json");
  if (!(await exists(filename))) return null;
  try {
    return JSON.parse(await readFile(filename, "utf8")) as { require?: Record<string, string> };
  } catch {
    return null;
  }
}

async function rootConfigEvidence(root: string): Promise<string[]> {
  const evidence: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    for (const [pattern, marker] of configMarkers) {
      if (pattern.test(entry.name)) evidence.push(`${marker}:${entry.name}`);
    }
  }
  if (await exists(path.join(root, "resources", "views"))) evidence.push("framework:laravel-views");
  return evidence;
}

export function defaultPortForFramework(framework: ProjectFramework): number | null {
  return frameworkDefaultPorts[framework] ?? null;
}

export function parseDevCommand(raw: string): readonly string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index]!;
    if (quote) {
      if (char === quote) quote = null;
      else current += char;
      continue;
    }
    if (char === "'" || char === '"') { quote = char; continue; }
    if (/\s/.test(char)) {
      if (current) { tokens.push(current); current = ""; }
      continue;
    }
    current += char;
  }
  if (current) tokens.push(current);
  if (!tokens.length) throw new ProjectError("DEVELOPMENT_COMMAND_INVALID", `Development command is empty: ${raw}`);
  return tokens;
}

function commandFromVector(vector: readonly string[], script: string): ProjectCommand {
  return { executable: vector[0]!, args: vector.slice(1), script };
}

async function detectFrameworkAndStyle(root: string, pkg: PackageFile | null, options: DetectProjectOptions = {}): Promise<{ framework: ProjectFramework; styling: ProjectStyling; evidence: string[] }> {
  const dependencies = { ...pkg?.dependencies, ...pkg?.devDependencies };
  const sources = await projectSourceFiles(root);
  const relativeSources = sources.map((file) => path.relative(root, file).replaceAll(path.sep, "/"));
  const configEvidence = await rootConfigEvidence(root);
  const hasReact = "react" in dependencies;
  const hasVue = "vue" in dependencies || relativeSources.some((file) => file.endsWith(".vue"));
  const hasVite = "vite" in dependencies || Object.values(pkg?.scripts ?? {}).some((script) => /(?:^|\s|\/)vite(?:\s|$)/.test(script));
  const hasTypeScript = "typescript" in dependencies || relativeSources.some((file) => /\.tsx?$/.test(file));
  const hasNext = "next" in dependencies;
  const hasNuxt = "nuxt" in dependencies;
  const hasAngular = "@angular/core" in dependencies || configEvidence.some((item) => item.startsWith("framework:angular-config"));
  const hasAstro = "astro" in dependencies || configEvidence.some((item) => item.startsWith("framework:astro-config"));
  const hasSvelteKit = "@sveltejs/kit" in dependencies;
  const hasSvelte = "svelte" in dependencies || relativeSources.some((file) => file.endsWith(".svelte"));
  const hasArtisan = await exists(path.join(root, "artisan"));
  const composer = hasArtisan ? await composerFile(root) : null;
  const hasLaravel = hasArtisan && Boolean(composer?.require?.["laravel/framework"]);
  const hasBlade = relativeSources.some((file) => file.endsWith(".blade.php"));
  let framework: ProjectFramework = "unknown";
  const evidence: string[] = [];
  if (hasLaravel) {
    framework = "laravel";
    evidence.push("framework:artisan", "framework:laravel-composer");
    if (hasBlade) evidence.push("framework:blade-template");
    if (hasVite) evidence.push("framework:vite-dependency-or-script");
  } else if (hasNext) {
    framework = "next";
    evidence.push("framework:next-dependency");
  } else if (hasNuxt) {
    framework = "nuxt";
    evidence.push("framework:nuxt-dependency");
  } else if (hasAngular) {
    framework = "angular";
    evidence.push("@angular/core" in dependencies ? "framework:angular-dependency" : "framework:angular-config");
  } else if (hasAstro) {
    framework = "astro";
    evidence.push("astro" in dependencies ? "framework:astro-dependency" : "framework:astro-config");
  } else if (hasSvelteKit) {
    framework = "sveltekit";
    evidence.push("framework:sveltekit-dependency");
  } else if (hasSvelte) {
    framework = "svelte";
    evidence.push("framework:svelte-source-or-dependency");
    if (hasVite) evidence.push("framework:vite-dependency-or-script");
  } else if (hasReact && hasVite) {
    framework = hasTypeScript ? "react-vite-typescript" : "react-vite";
    evidence.push("framework:react-dependency", "framework:vite-dependency-or-script");
    if (hasTypeScript) evidence.push("language:typescript-source-or-dependency");
  } else if (hasVue) {
    framework = "vue";
    evidence.push("framework:vue-source-or-dependency");
    if (hasVite) evidence.push("framework:vite-dependency-or-script");
  } else if (await exists(path.join(root, "index.html"))) {
    framework = "vanilla";
    evidence.push("framework:index.html");
  }
  if (options.frameworkChoice) {
    framework = options.frameworkChoice;
    evidence.push(`framework:override:${options.frameworkChoice}`);
  }
  evidence.push(...configEvidence);
  if ("bootstrap" in dependencies) evidence.push("styling:bootstrap-dependency");
  if ("sass" in dependencies || "node-sass" in dependencies) evidence.push("styling:sass-dependency");

  const tailwindDependency = "tailwindcss" in dependencies;
  const tailwindConfig = ["tailwind.config.js", "tailwind.config.cjs", "tailwind.config.mjs", "tailwind.config.ts"].find((file) => relativeSources.includes(file))
    ?? await Promise.all(["tailwind.config.js", "tailwind.config.cjs", "tailwind.config.mjs", "tailwind.config.ts"].map(async (file) => await exists(path.join(root, file)) ? file : null)).then((files) => files.find(Boolean) ?? null);
  let tailwindImport: string | undefined;
  let cssModuleImport: string | undefined;
  for (const source of sources) {
    const relative = path.relative(root, source).replaceAll(path.sep, "/");
    const raw = await readFile(source, "utf8");
    if (!tailwindImport && /@import\s+["']tailwindcss["']|@tailwind\s+(?:base|components|utilities)/.test(raw)) tailwindImport = relative;
    if (!cssModuleImport && /(?:import|require\s*\()(?:(?!\n).)*\.module\.css["']/.test(raw)) cssModuleImport = relative;
  }
  let styling: ProjectStyling = "unknown";
  if (tailwindDependency && (tailwindConfig || tailwindImport)) {
    styling = "tailwind";
    evidence.push("styling:tailwind-dependency");
    if (tailwindConfig) evidence.push(`styling:tailwind-config:${tailwindConfig}`);
    if (tailwindImport) evidence.push(`styling:tailwind-import:${tailwindImport}`);
  } else if (cssModuleImport) {
    styling = "css-modules";
    evidence.push(`styling:css-module-import:${cssModuleImport}`);
  } else if (relativeSources.some((file) => file.endsWith(".css"))) {
    styling = "plain-css";
    evidence.push("styling:css-source");
  }
  return { framework, styling, evidence };
}

async function savedConfig(root: string): Promise<SavedConfig | null> {
  const filename = path.join(root, ".reframe", "config.json");
  if (!(await exists(filename))) return null;
  try {
    return JSON.parse(await readFile(filename, "utf8")) as SavedConfig;
  } catch (error) {
    throw new ProjectError("PROJECT_CONFIG_INVALID", `Cannot parse ${filename}: ${String(error)}.`);
  }
}

async function writeConfig(root: string, manager: PackageManager, script: string): Promise<void> {
  const directory = path.join(root, ".reframe");
  const destination = path.join(directory, "config.json");
  const temporary = path.join(directory, `config.json.${process.pid}.tmp`);
  await mkdir(directory, { recursive: true });
  await writeFile(temporary, `${JSON.stringify({ version: 1, root, packageManager: manager, script }, null, 2)}\n`, { flag: "wx" });
  await rename(temporary, destination);
}

function resolveCommand(root: string, pkg: PackageFile | null, manager: PackageManager | null, config: SavedConfig | null, framework: ProjectFramework, hasArtisan: boolean, options: DetectProjectOptions): { command: ProjectCommand | null; persist: boolean; evidence: string[] } {
  if (options.devCommandOverride) {
    const vector = parseDevCommand(options.devCommandOverride);
    return { command: commandFromVector(vector, options.devCommandOverride), persist: false, evidence: [`command:override:${options.devCommandOverride}`] };
  }
  const scripts = pkg?.scripts ?? {};
  const choices = Object.keys(scripts).filter((name) => typeof scripts[name] === "string").sort();
  if (config) {
    if (config.version !== 1 || config.root !== root || config.packageManager !== manager || !choices.includes(config.script)) {
      throw new ProjectError("PROJECT_CONFIG_STALE", `Saved config does not match the current root, package manager, or scripts. Available scripts: ${choices.join(", ") || "none"}. No obsolete command was executed.`, choices);
    }
    return { command: { executable: config.packageManager, args: ["run", config.script], script: config.script }, persist: false, evidence: [`command:saved-config:${config.script}`] };
  }
  const script = options.commandChoice ?? ["dev", "start", "serve"].find((name) => choices.includes(name));
  if (!script) {
    if (framework === "laravel" && hasArtisan) {
      return { command: { executable: "php", args: ["artisan", "serve"], script: "artisan serve" }, persist: false, evidence: ["command:artisan-serve"] };
    }
    if (!pkg && choices.length === 0) return { command: null, persist: false, evidence: ["command:reframe-static-server"] };
    throw new ProjectError("DEVELOPMENT_COMMAND_UNKNOWN", `Reframe could not determine how to start this project. Available scripts: ${choices.join(", ") || "none"}. Select and approve a script explicitly.`, choices);
  }
  if (!choices.includes(script)) throw new ProjectError("DEVELOPMENT_COMMAND_INVALID", `Script ${script} does not exist. Available scripts: ${choices.join(", ") || "none"}.`, choices);
  if (!manager) throw new ProjectError("PACKAGE_MANAGER_UNKNOWN", `A script was selected but no npm, pnpm, Yarn, or Bun lockfile was found. No command was started.`);
  const persist = options.approveConfigWrite === true && script !== "dev";
  return { command: { executable: manager, args: ["run", script], script }, persist, evidence: [persist ? `command:saved-config:${script}` : `command:package-script:${script}`] };
}

export async function detectProject(inputRoot: string, options: DetectProjectOptions = {}): Promise<ProjectDescriptor> {
  const root = await canonicalRoot(inputRoot);
  const pkg = await packageFile(root);
  const config = await savedConfig(root);
  const { manager, evidence: managerEvidence } = await detectManager(root, options.packageManagerChoice ?? config?.packageManager);
  const hasArtisan = await exists(path.join(root, "artisan"));
  const detected = await detectFrameworkAndStyle(root, pkg, options);
  const scriptNames = Object.keys(pkg?.scripts ?? {});
  const hasAppEntry = await exists(path.join(root, "index.html"));
  const hasDevScript = ["dev", "start", "serve"].some((name) => scriptNames.includes(name));
  if (pkg && Array.isArray((pkg as PackageFile & { workspaces?: unknown }).workspaces) && !hasAppEntry && !hasDevScript && !options.devCommandOverride && !options.commandChoice) {
    throw new ProjectError("PROJECT_ROOT_INVALID", `Run Reframe from a project directory (for example demo/vanilla-demo), not the monorepo root (${root}).`);
  }
  if (options.frameworkChoice === "vanilla" && !hasAppEntry) {
    throw new ProjectError("VANILLA_INDEX_MISSING", `No index.html found in ${root}. Run reframe from the directory that contains index.html (for example demo/vanilla-demo).`);
  }
  if (detected.framework === "unknown" && pkg && !options.frameworkChoice && scriptNames.length === 0 && !hasAppEntry) {
    throw new ProjectError("PROJECT_FRAMEWORK_UNKNOWN", `Reframe could not determine the project framework. Select one explicitly before startup.`, [...frameworkChoices]);
  }
  if (detected.framework === "unknown" && !pkg) {
    throw new ProjectError("PROJECT_ROOT_INVALID", `No supported project evidence was found in ${root}. Evidence checked: package.json, composer.json/artisan, and index.html in the selected directory only; no parent folders were scanned.`);
  }
  const resolved = detected.framework === "vanilla" && manager === null && config === null && options.commandChoice === undefined && !options.devCommandOverride
    ? { command: null, persist: false, evidence: ["command:reframe-static-server"] }
    : resolveCommand(root, pkg, manager, config, detected.framework, hasArtisan, options);
  if (resolved.persist && manager && resolved.command) await writeConfig(root, manager, resolved.command.script);
  const sourceEditable = sourceEditableFrameworks.has(detected.framework);
  const previewable = sourceEditable || previewableFrameworks.has(detected.framework) || (detected.framework === "unknown" && resolved.command !== null);
  return Object.freeze({
    version: 1 as const,
    root,
    framework: detected.framework,
    styling: detected.styling,
    packageManager: manager,
    command: resolved.command,
    capabilities: Object.freeze({ canProxy: previewable, canExplore: previewable, canWriteSource: sourceEditable, canStart: resolved.command !== null || detected.framework === "vanilla" }),
    confidence: sourceEditable ? "high" as const : previewable ? "medium" as const : "low" as const,
    evidence: Object.freeze([...managerEvidence, ...detected.evidence, ...resolved.evidence]),
  });
}

export function packageManagerCommand(manager: PackageManager, script: string): ProjectCommand {
  return { executable: manager, args: ["run", script], script };
}

export function stackLimitations(framework: ProjectFramework, styling: ProjectStyling): readonly string[] {
  const limits: string[] = [];
  if (previewableFrameworks.has(framework) && !sourceEditableFrameworks.has(framework)) {
    limits.push(`${frameworkLabel(framework)} is preview-only; source writes are disabled.`);
  }
  if (framework === "laravel") limits.push("Dynamic Blade expressions fall back to overrides.css when no unique static source owner exists.");
  if (["vue", "svelte", "sveltekit", "nuxt", "angular", "astro"].includes(framework)) limits.push("Scoped Vue/Svelte/Angular/Astro styles and single-file components fall back to overrides.css when unmapped.");
  if (styling === "css-modules") limits.push("CSS module class names may require overrides.css when mapping is ambiguous.");
  return limits;
}

export async function detectProjectStack(inputRoot: string, options: DetectProjectOptions = {}): Promise<ProjectStack> {
  const descriptor = await detectProject(inputRoot, options);
  const devCommand = descriptor.command ? [descriptor.command.executable, ...descriptor.command.args] as const : null;
  return Object.freeze({
    framework: descriptor.framework,
    packageManager: descriptor.packageManager,
    devCommand,
    defaultPort: defaultPortForFramework(descriptor.framework),
    confidence: descriptor.confidence,
  });
}
