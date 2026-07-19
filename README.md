# Reframe

**Visual development for local web projects — edit the running site in the browser, write changes to real source files.**

![Node](https://img.shields.io/badge/node-%3E%3D22%20%3C25-339933?style=flat-square&logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript&logoColor=white)
![npm workspaces](https://img.shields.io/badge/npm-workspaces-CB3837?style=flat-square&logo=npm&logoColor=white)
![Playwright](https://img.shields.io/badge/Playwright-1.x-2EAD33?style=flat-square&logo=playwright&logoColor=white)
![Vitest](https://img.shields.io/badge/Vitest-3.x-6E9F18?style=flat-square&logo=vitest&logoColor=white)
![CI](https://img.shields.io/badge/CI-GitHub_Actions-2088FF?style=flat-square&logo=githubactions&logoColor=white)
![OpenAI Build Week](https://img.shields.io/badge/OpenAI-Build_Week-412991?style=flat-square&logo=openai&logoColor=white)

Reframe is an AI-native visual development environment for local websites. It injects an editing UI into your running dev server, maps rendered elements back to source files, and applies approved visual edits directly in your repository — no browser extension required.

<!-- Add screenshot -->

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Usage](#usage)
- [CLI Reference](#cli-reference)
- [Development](#development)
- [Requirements](#requirements)

## Features

- **Visual editing** — select elements, resize and restyle them, and describe structural changes in natural language.
- **Source mapping** — link DOM elements to real source locations and persist approved edits to disk.
- **Local history** — review and restore changes through visual history without leaving your codebase.
- **Framework detection** — auto-detect project type from `package.json`, config files, and directory layout.
- **Design DNA** — analyze and persist a project's design language from the CLI.
- **No extension** — runs through a local proxy; your app code stays untouched.

## Tech Stack

| Layer | Package | Role |
| --- | --- | --- |
| CLI | `reframe` | Entry point — detect project, start proxy, open browser |
| Dev server | `@reframe/dev-server` | Proxy, WebSocket server, source mapping, history, AI edits |
| Browser client | `@reframe/browser-client` | Injected toolbar and visual editing UI |
| Shared | `@reframe/shared` | Protocol types and utilities |

**Runtime:** TypeScript, Node.js 22+, Playwright (browser automation), `@openai/codex` (AI).

**Monorepo workspaces:** `packages/*` (core) and `demo/*` (sample projects).

### Supported frameworks

Reframe auto-detects the project from `package.json`, config files, and directory layout.

| Framework | Source writes |
| --- | --- |
| React + Vite | Yes |
| React + Vite + TypeScript | Yes |
| Vanilla HTML/CSS | Yes |
| Laravel (Vite assets) | Yes (Blade read-only) |
| Next.js, Nuxt, Angular, Astro, Vue, Svelte, SvelteKit | Preview only |

Override detection with `--framework` when needed.

## Architecture

```mermaid
flowchart LR
  A[Project root] --> B[Detect framework & dev command]
  B --> C[Start or attach dev server]
  C --> D[Reframe proxy :4400]
  D --> E[Inject browser client]
  E --> F[Visual edits]
  F --> G[Map to source files]
  G --> H[Write approved changes]
```

1. **Detect** — scan the project root for framework, package manager, and dev script.
2. **Attach** — start the project's dev server or connect to one already running.
3. **Proxy** — serve the app through Reframe at `http://127.0.0.1:4400`.
4. **Inject** — add the browser client (toolbar, selection, edit panel) without modifying your app code.
5. **Map & write** — link DOM elements to source locations; approved edits persist to disk.

Press `Ctrl+C` to stop Reframe and every server it owns.

## Installation

### From source

```bash
git clone <repo-url>
cd reframe
npm install
npm run build
npm run pack:cli
```

This writes a `reframe-0.0.0.tgz` package. Install it locally or globally:

```bash
# Local install in a project
npm install /path/to/reframe-0.0.0.tgz

# Global install
npm install -g /path/to/reframe-0.0.0.tgz
```

## Quick Start

```bash
# Build Reframe once from the repo root
npm install
npm run build
npm run pack:cli
npm install -g ./reframe-0.0.0.tgz

# Run against a demo project
cd demo/react-demo
npm install
npx reframe
```

Other demos: `demo/vanilla-demo` (plain HTML/CSS), `demo/react-tailwind-demo` (React + Tailwind).

## Usage

### Run in your own project

```bash
cd /path/to/your-project
npx reframe
```

Reframe opens the injected proxy in your browser. Common options:

```bash
# Attach to an already-running dev server
npx reframe --url http://127.0.0.1:5173

# Override the dev command
npx reframe --dev-cmd "npm run dev"

# Set framework explicitly
npx reframe --framework react-vite-typescript

# Change the Reframe proxy port (default 4400)
npx reframe --port 4400
```

### AI authentication

Local AI mode uses your existing Codex login — no API key required:

```bash
codex login          # if not already signed in
npx reframe auth     # show auth status
```

Optional API fallback:

```bash
export REFRAME_AI_PROVIDER=api   # Windows: set REFRAME_AI_PROVIDER=api
npx reframe auth api
npx reframe auth logout
```

Set `REFRAME_CODEX_PATH` if the `codex` binary is not on your PATH.

### Design DNA

Analyze and persist a project's design language from the project root:

```bash
npx reframe dna preview
npx reframe dna write --correct=color:ID --exception=spacing:ID
npx reframe dna status
```

Add `--agents` to `dna write` to update the Design System section in the project's `AGENTS.md`.

## CLI Reference

### Commands

| Command | Description |
| --- | --- |
| `reframe` | Detect project, start proxy, open browser |
| `reframe auth` | Show Codex auth status |
| `reframe auth api` | Store OpenAI API key (optional fallback) |
| `reframe auth logout` | Remove stored API credential |
| `reframe dna preview` | Analyze design tokens and components (read-only) |
| `reframe dna write` | Persist reviewed Design DNA findings |
| `reframe dna status` | Show current Design DNA version |

### Flags and environment

| Flag / variable | Description |
| --- | --- |
| `--url <url>` | Attach to a running dev server (`REFRAME_DEV_URL`) |
| `--dev-cmd <cmd>` | Override the dev start command (`REFRAME_DEV_CMD`) |
| `--framework <name>` | Force framework detection |
| `--port <n>` | Reframe proxy port (`REFRAME_PORT`, default `4400`) |
| `REFRAME_CODEX_PATH` | Path to the `codex` binary |
| `REFRAME_AI_PROVIDER` | Set to `api` for direct OpenAI API transport |

Framework values: `react-vite`, `react-vite-typescript`, `next`, `nuxt`, `angular`, `astro`, `vue`, `svelte`, `sveltekit`, `laravel`, `vanilla`.

## Development

### npm scripts (repo root)

| Script | Description |
| --- | --- |
| `npm run build` | Compile all TypeScript packages |
| `npm run clean` | Remove build artifacts |
| `npm run pack:cli` | Build and pack the `reframe` CLI as `.tgz` |
| `npm run test:unit` | Unit tests |
| `npm run test:integration` | Integration tests |
| `npm run test:e2e` | Playwright end-to-end tests |
| `npm run verify:pack` | Verify CLI package integrity |
| `npm run verify:fixtures` | Verify demo fixture manifests |
| `npm run verify:leaks` | Check for orphaned processes/ports |
| `npm run test:phase0` … `test:phase12` | Phase-scoped test suites |

## Requirements

- **Node.js** `>=22` and `<25`
- A supported local web project with a dev server (or static `index.html` for vanilla)

---

Built for [OpenAI Build Week](https://openai.com/).
