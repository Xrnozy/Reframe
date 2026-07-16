# Reframe Detailed Implementation Plan

## Purpose and governing decisions

This plan turns `spec/phasing.md` and `spec/description/reframe-spec.md` into an executable build and verification sequence. The phase order is mandatory: Phase 0 through Phase 8 prove the complete browser-to-source-to-restore-to-Codex path; Phases 9 through 11 add Design DNA, screenshot-first history, and Git-synchronized comments only after that path is reliable. Because `spec/phasing.md` explicitly deprioritizes Reference Adaptation but `reframe-spec.md` still requires it in the demonstration flow and functional acceptance criteria, Phase 12 schedules it as a post-core, full-spec release gate instead of silently omitting it.

The following rules apply to every phase:

1. Source code is the permanent truth. Browser-only state must always be labeled as temporary.
2. An ambiguous mapping, stale file, failed checkpoint, or failed verification must stop a source write; uncertainty is never converted into a guess.
3. A phase gate requires its acceptance criteria, its strict tests, and all earlier regression tests to pass on Windows and at least one Unix environment.
4. A basic demo is not a phase gate. No critical test may be skipped, retried until green, or converted into a warning without a written decision.
5. Every process, temporary file, port, browser context, and fixture copy created by a test must be cleaned up, including after forced failures.
6. Reframe must never push, rewrite Git history, expose unrestricted filesystem access, send secrets, or attach to arbitrary production sites.
7. Initial target-project support is Vanilla HTML/CSS/JavaScript and React/Vite with JavaScript/JSX using plain CSS, CSS Modules, or Tailwind. TypeScript editing and other frameworks remain unsupported and must degrade safely.
8. Phase-specific performance budgets below are proposed release gates. Record p50/p95 values in CI so regressions are visible rather than hidden by a single generous timeout.

## Recommended project folder structure

The three roadmap packages remain the product boundaries. `shared` contains only contracts used by more than one boundary; it is not a fourth runtime service.

```text
reframe/
├── package.json                    # workspaces, build, test, lint, pack scripts
├── package-lock.json               # use one reproducible manager for Reframe itself
├── README.md
├── AGENTS.md
├── packages/
│   ├── cli/
│   │   ├── package.json            # public `reframe` package and bin mapping
│   │   └── src/
│   │       ├── bin.ts              # minimal executable boundary
│   │       ├── run.ts              # top-level lifecycle/orchestration
│   │       ├── output.ts           # human and verbose terminal output
│   │       ├── browser-opener.ts
│   │       ├── signals.ts
│   │       └── commands/
│   │           └── start.ts
│   ├── dev-server/
│   │   ├── package.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── config/
│   │       │   ├── schema.ts
│   │       │   └── store.ts
│   │       ├── project/
│   │       │   ├── detector.ts
│   │       │   ├── package-manager.ts
│   │       │   ├── command-resolver.ts
│   │       │   ├── root-guard.ts
│   │       │   └── capabilities.ts
│   │       ├── processes/
│   │       │   ├── supervisor.ts
│   │       │   ├── readiness.ts
│   │       │   └── port-allocator.ts
│   │       ├── proxy/
│   │       │   ├── server.ts
│   │       │   ├── html-injector.ts
│   │       │   └── websocket-upgrade.ts
│   │       ├── connection/
│   │       │   ├── websocket-server.ts
│   │       │   ├── session.ts
│   │       │   └── message-router.ts
│   │       ├── mapping/
│   │       │   ├── source-map-service.ts
│   │       │   ├── vanilla-adapter.ts
│   │       │   ├── react-vite-adapter.ts
│   │       │   └── confidence.ts
│   │       ├── edits/
│   │       │   ├── transaction.ts
│   │       │   ├── css-width-editor.ts
│   │       │   ├── jsx-width-editor.ts
│   │       │   ├── tailwind-width-editor.ts
│   │       │   └── verifier.ts
│   │       ├── history/
│   │       │   ├── checkpoint-store.ts
│   │       │   ├── patch-service.ts
│   │       │   ├── screenshot-service.ts
│   │       │   └── restore-service.ts
│   │       ├── codex/
│   │       │   ├── provider.ts
│   │       │   ├── context-packet.ts
│   │       │   ├── sanitizer.ts
│   │       │   ├── generation-runner.ts
│   │       │   └── diff-validator.ts
│   │       ├── design-dna/
│   │       │   ├── analyzer.ts
│   │       │   ├── schema.ts
│   │       │   ├── agents-md.ts
│   │       │   └── prompt-context.ts
│   │       ├── annotations/
│   │       │   ├── store.ts
│   │       │   ├── anchor-resolver.ts
│   │       │   └── schema.ts
│   │       └── references/
│   │           ├── store.ts
│   │           ├── normalizer.ts
│   │           ├── analyzer.ts
│   │           ├── adaptation-plan.ts
│   │           └── asset-sanitizer.ts
│   ├── browser-client/
│   │   ├── package.json
│   │   └── src/
│   │       ├── entry.ts
│   │       ├── connection/
│   │       │   ├── client.ts
│   │       │   └── reconnect.ts
│   │       ├── ui/
│   │       │   ├── root.ts
│   │       │   ├── top-bar.ts
│   │       │   ├── floating-toolbar.ts
│   │       │   ├── review-panel.ts
│   │       │   └── styles.css
│   │       ├── selection/
│   │       │   ├── controller.ts
│   │       │   ├── eligibility.ts
│   │       │   ├── overlay.ts
│   │       │   └── fingerprint.ts
│   │       ├── explore/
│   │       │   ├── resize-session.ts
│   │       │   └── preview-state.ts
│   │       ├── history/
│   │       │   ├── hold-overlay.ts
│   │       │   └── history-list.ts
│   │       ├── annotations/
│   │       │   ├── pins.ts
│   │       │   └── editor.ts
│   │       └── references/
│   │           ├── reference-panel.ts
│   │           ├── borrowing-controls.ts
│   │           └── adaptation-review.ts
│   └── shared/
│       └── src/
│           ├── protocol.ts         # versioned message names and payload schemas
│           ├── errors.ts           # stable codes and recovery metadata
│           ├── edit-contract.ts
│           └── identifiers.ts
├── demo/
│   ├── vanilla-demo/
│   └── react-demo/
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── e2e/
│   ├── regression/
│   ├── performance/
│   ├── fault-injection/
│   ├── fixtures/
│   │   ├── templates/
│   │   ├── manifests/
│   │   └── malformed/
│   ├── golden/
│   └── helpers/
│       ├── fixture-copy.ts
│       ├── process-harness.ts
│       ├── port-probe.ts
│       ├── file-snapshot.ts
│       └── fake-codex-provider.ts
├── scripts/
│   ├── verify-pack.ts
│   ├── verify-no-process-leaks.ts
│   └── run-fixture-matrix.ts
└── spec/
    ├── phasing.md
    ├── implementation-plan.md
    └── description/reframe-spec.md
```

Target projects receive only user-approved local metadata:

```text
<target-project>/.reframe/
├── config.json
├── history/<checkpoint-id>/
├── design-dna/
│   ├── DESIGN.md
│   ├── tokens.json
│   ├── components.json
│   └── fingerprint.json
├── references/<reference-id>/
│   ├── metadata.json
│   └── source.<approved-extension>
└── annotations/<annotation-id>.json
```

## Cross-phase testing strategy

### Unit tests

- Test detectors, schema validators, confidence calculation, selector eligibility, edit transforms, hash comparisons, sanitization, patch generation, annotation anchoring, and error serialization as pure functions.
- Use table-driven tests and mutation testing for security and source-write code. A surviving mutation in path containment, token validation, hash checking, or rollback logic blocks release.
- Golden tests are appropriate only for stable structured output such as project descriptors, context-packet summaries, patches, and Design DNA. Normalize paths, ports, timestamps, and line endings before comparison.

### Integration tests

- Copy an immutable fixture template to a unique temporary directory for every test. Never edit `demo/` or the fixture template in place.
- Run real child processes for CLI, project server, proxy, WebSocket, and file watchers. Assert readiness from HTTP behavior, not from log text alone.
- Record the full process tree and open ports before and after each test. A surviving child or listener fails the test.
- Fault-inject filesystem denial, stale hashes, process crashes, truncated messages, occupied ports, malformed files, and delayed HMR.

### End-to-end tests

- Use Playwright against the real proxy and real Vanilla/React fixture copies.
- Assert both browser state and disk state for every edit. A screenshot or visible resize alone never proves a source edit.
- For source edits, verify the exact changed-file set, the minimal textual/AST diff, the post-HMR UI, refresh persistence, and restoration.
- Run Chromium on every PR; run Firefox and WebKit for browser-client behavior nightly. Framework/dev-server behavior remains Chromium-gated for the hackathon release unless a browser-specific defect is found.

### Regression tests

- At each phase, promote every fixed bug to `tests/regression/<phase>/<issue>.test.*` with the smallest fixture that reproduces it.
- Run all previous phase suites before the next gate. Phase 6 onward additionally replays the winning milestone from a clean copy and from a dirty Git worktree.
- Maintain compatibility runs for the minimum and current supported Node LTS versions and current stable npm, pnpm, Yarn, and Bun where those executables are installed.

### Performance and timeout policy

- Use monotonic clocks and explicit deadlines. No readiness loop, WebSocket reconnect, HMR verification, Codex request, screenshot, or shutdown may wait forever.
- CI reports p50/p95 and fails on the stated phase budget after one controlled warm-up; it must not hide failure through automatic retries.
- Long external Codex latency is measured separately from local packet building, validation, and apply time.

## Test fixture and sample-project strategy

1. Keep `demo/vanilla-demo` and `demo/react-demo` human-readable and presentation-ready. They are not destructive test workspaces.
2. Keep minimal immutable templates under `tests/fixtures/templates`: Vanilla, React/plain CSS, React/CSS Modules, React/Tailwind, unsupported TypeScript, unsupported Vue, unknown scripts, dirty Git, no Git, CSP, malformed package, slow server, crashing server, ambiguous-source cases, and licensed synthetic reference assets/specifications for Phase 12.
3. Give each template a manifest containing expected framework, styling mode, package manager, dev command, expected URL, supported capabilities, editable element fingerprints, and files allowed to change.
4. Generate a test copy under the OS temp directory using a unique run ID. Include variants with spaces and non-ASCII characters in the path, CRLF/LF files, and read-only files.
5. Pin fixture dependencies and cache installations in CI, but never share `node_modules`, `.reframe`, ports, or Git state between concurrent test copies.
6. Use seeded content and stable selectors. Dynamic IDs and timestamps are prohibited unless a test specifically validates unstable runtime content.
7. Add a fixture only when it covers a distinct parser, framework, failure, or regression. Do not grow demos into unrealistic catch-all applications.

## Logging and debugging strategy

- Emit concise human output by default and newline-delimited structured logs with `--verbose` or `REFRAME_LOG_LEVEL=debug`.
- Every log record should include timestamp, level, stable event code, session ID, project ID, phase/subsystem, and—when applicable—request ID, edit transaction ID, generation ID, or checkpoint ID.
- Redact tokens, authorization headers, environment values, private paths outside the project root, prompt contents marked sensitive, and screenshot contents. Test redaction with canary secrets.
- Use stable error codes such as `PROJECT_UNSUPPORTED`, `DEV_SERVER_TIMEOUT`, `WS_TOKEN_INVALID`, `MAPPING_AMBIGUOUS`, `FILE_STALE`, `WRITE_FAILED`, `VERIFY_FAILED`, `CHECKPOINT_FAILED`, and `CODEX_TIMEOUT`.
- Every user-facing failure must state what happened, whether files changed, whether a recovery point exists, and the next safe action.
- Persist per-session diagnostics under an OS cache/log directory, not the repository, unless the user explicitly exports a support bundle. Rotate logs and make retention configurable.
- Expose a diagnostic summary containing detected root/framework/command, Reframe and project URLs, child PIDs, connection state, mapping confidence, recent transaction state, and redacted recent errors.
- Never infer readiness solely from `stdout`; pair logs with port/HTTP/WebSocket probes and record the failing probe.

## Phase gate policy

A phase is complete only when:

- All phase acceptance criteria pass on fresh fixture copies.
- All strict tests for the phase and every earlier regression suite pass.
- There are zero unexpected changed files, leaked child processes, occupied test ports, unhandled promise rejections, browser page errors, and secret-redaction failures.
- The phase's unsupported and failure states are visible and recoverable.
- The implementation documentation and protocol/config schemas match actual behavior.
- A named owner has reviewed any intentionally deferred warning; critical safety checks cannot be deferred.

---

# Phase 0 — Prepare the Development Environment

## Goal

Create a reproducible monorepo, two canonical demo projects, immutable failure-oriented fixtures, and the test/process harness needed to prove every later phase without risking a developer's real project.

## Why this phase comes at this point

Project detection, proxying, selection, source mapping, and file writes need known inputs and exact expected outputs. Building fixtures after implementation would let the implementation define the tests and conceal unsupported assumptions.

## Components to build

- Root workspace/build/test configuration.
- `packages/cli`, `packages/dev-server`, `packages/browser-client`, and `packages/shared` skeletons with ownership documented.
- `demo/vanilla-demo`: `index.html`, `style.css`, and `script.js`; header, hero, button, three cards, footer, stable IDs/data attributes.
- `demo/react-demo`: React/Vite JavaScript with `App.jsx`, `Hero.jsx`, `PricingCard.jsx`, and `Navbar.jsx`; one clearly unique annual-plan card; one supported styling mode selected for the official demo.
- Fixture templates and manifests for the initial framework/style matrix and malformed cases.
- Temp-copy, process-tree, port-probe, file-snapshot, and test cleanup helpers.
- Baseline CI matrix for Windows and Linux, minimum/current Node LTS, and Chromium.

### Inputs, outputs, and behavior

| Input | Output | Required behavior |
|---|---|---|
| Clean repository checkout | Installable workspace | One documented install/build/test path with a locked dependency graph |
| Canonical demo source | Running Vanilla and React pages | Stable content and selectors; no external service or network data required at runtime |
| Fixture template + manifest | Unique disposable fixture copy | Original template remains byte-identical; copy has independent port, Git state, and `.reframe` state |
| Test completion or forced abort | Cleanup report | All spawned descendants, temporary files, and listeners are gone |

## Detailed implementation steps

1. Choose and document the Reframe repository's Node versions, workspace manager, build output convention, test runner, and browser runner. Target-project package-manager support is independent of this internal choice.
2. Create the package boundaries and minimal build graph: `shared` first, then `dev-server`/`browser-client`, then `cli`.
3. Build the Vanilla demo with unique `#hero`, `#primary-cta`, and per-card IDs/data attributes. Put an explicit width declaration on the later editable card.
4. Build the React/Vite JavaScript demo with shallow components and a uniquely styled annual-plan `PricingCard`; do not use TypeScript, server data, complex routing, or component libraries.
5. Create fixture manifests and a validator that fails on missing expected files, duplicate fixture IDs, mutable timestamps, or undeclared allowed-change paths.
6. Implement fixture copying, free-port reservation, readiness probes, process-tree tracking, and before/after file snapshots.
7. Add minimal malformed/unsupported fixtures now so later detectors cannot be written only for happy paths.
8. Configure CI artifacts for structured logs, diffs, browser traces, screenshots, and leak reports on failure.
9. Record baseline startup and page-load timings; do not optimize yet, but make future regressions measurable.

## Acceptance criteria

- Both canonical demos start independently and render the exact required sections without network access.
- The React demo is JavaScript/JSX and has a deterministic edit target whose source ownership is unambiguous.
- Every fixture has a valid manifest and can be copied without mutating the template.
- Test cleanup detects and terminates a deliberately leaked child in the harness self-test.
- Windows paths with spaces and CRLF files work in the harness.
- CI can run a placeholder unit test and a real Chromium smoke test on Windows and Linux.
- The root folder structure and package responsibilities match this plan.

## Test environment and setup

- Windows 11/PowerShell and Linux/Bash CI workers.
- Minimum and current supported Node LTS.
- Chromium installed by the browser-test runner.
- Fixture copies created under a path with spaces; a second run uses a non-ASCII path where CI supports it.
- Network disabled while demo pages run.

## Strict test cases

| ID / type | Test | Expected result |
|---|---|---|
| P0-01 Happy | Start the Vanilla demo and inspect header, hero, CTA, three distinct cards, and footer. | All elements render once, stable IDs are unique, and there are no console/page errors. |
| P0-02 Happy | Start the React demo and inspect `Navbar`, `Hero`, and three `PricingCard` instances. | Vite serves JSX successfully; the annual card has a unique source/style marker and no TypeScript file is present. |
| P0-03 Edge | Copy each template twice in parallel. | Copies have different roots/ports and mutations in one copy never appear in the other or template. |
| P0-04 Invalid | Remove a required file and validate its manifest. | Validation fails with the missing relative path; no process is started. |
| P0-05 Invalid | Add duplicate IDs to the Vanilla fixture. | Fixture validation fails before E2E execution and names the duplicate ID. |
| P0-06 Failure/recovery | Force the harness test body to throw after spawning a child and opening a port. | `afterEach` kills the full process tree, releases the port, preserves failure evidence, and the leak assertion passes. |
| P0-07 Failure/recovery | Make a fixture copy read-only midway through setup. | Setup fails atomically, deletes or quarantines the incomplete copy, and does not modify the template. |
| P0-08 Cross-environment | Run fixture copy/start/stop from a path containing spaces and non-ASCII characters with LF and CRLF variants. | All paths are passed as arguments rather than shell-concatenated strings; files retain their original line endings. |
| P0-09 Integration | Run the real Vanilla and React servers through the shared process/readiness harness, then stop them. | Both real process trees reach HTTP readiness, emit usable diagnostics, stop fully, and release their ports. |
| P0-10 Regression | Hash fixture templates before and after the full smoke suite. | Every hash is identical; any in-place edit fails the suite. |
| P0-11 Performance | Create 20 small fixture copies and clean them up. | p95 setup plus cleanup is under 2 seconds per copy on CI and no copy or process remains. |

## Expected results

The repository has trustworthy, disposable inputs for all future phases. A failure can be reproduced from a named fixture and leaves enough artifacts to diagnose it without leaving live processes or corrupted templates.

## Failure conditions

- A demo relies on external data, unstable IDs, TypeScript, or complex behavior not required by the roadmap.
- A test edits `demo/` or a fixture template directly.
- Cleanup checks only the parent PID and misses descendants.
- Parallel tests share ports, Git directories, `.reframe` state, or browser storage.
- CI passes on one OS only.

Common mistakes are detected as follows:

- Hard-coded POSIX paths are exposed by P0-08.
- In-place fixture mutation is exposed by P0-03/P0-10.
- Weak cleanup that kills only one process is exposed by P0-06.
- An overcomplicated demo is exposed by manifest review and P0-02's file/dependency assertions.

## Debugging checklist

- Confirm the test is using a copy and print its run ID/root.
- Compare template and copy hashes.
- Inspect the process-tree and port-leak artifacts.
- Check path quoting, line endings, Node version, and browser executable.
- Re-run the failing fixture alone with its seed and verbose structured logs.

## Definition of done

Phase 0 is done when the fixtures and harness themselves have passed their adversarial self-tests on Windows and Linux, the demos satisfy the roadmap exactly, and there is no product runtime logic beyond package skeletons.

---

# Phase 1 — Build the CLI Skeleton

## Goal

Make the packed package runnable through `npx reframe`, start a localhost HTTP server, open a welcome page, print clear status, and stop cleanly on user interruption.

## Why this phase comes at this point

Every later phase depends on a reliable single-process entry point, deterministic lifecycle, clear errors, and reusable signal/port handling. Project detection and child project processes would obscure basic CLI failures if introduced now.

## Components to build

- `packages/cli/src/bin.ts`, `run.ts`, `output.ts`, `browser-opener.ts`, and `signals.ts`.
- Minimal HTTP/welcome server in `packages/dev-server/src/index.ts`.
- Public package metadata, bin mapping, build output, and package verification script.
- Lifecycle state machine: `starting -> ready -> stopping -> stopped` or `failed`.
- Browser opener abstraction that can be replaced with a spy in tests.
- Graceful shutdown for `SIGINT`, `SIGTERM`, server errors, and repeated signals.

### Inputs, outputs, and behavior

| Input | Output | Required behavior |
|---|---|---|
| `npx reframe` in any directory | Server at `http://localhost:4400` and browser-open request | Welcome page states project detection is unavailable |
| `Ctrl+C`/termination signal | Exit code 0 after cleanup | Listener closes and a second run can bind immediately |
| Occupied configured port | Stable error and nonzero exit | No browser opens and no partial listener remains |
| Browser-open failure | Running URL plus warning | Server remains usable; user can open URL manually |

## Detailed implementation steps

1. Define supported Node versions and reject unsupported versions before opening files, ports, or browsers.
2. Add the executable bin with a minimal error boundary; keep business logic in `run.ts` so it is directly testable.
3. Start an HTTP server bound explicitly to loopback. Serve a fixed welcome document and a small health endpoint.
4. Probe the actual bound URL before reporting ready or calling the browser opener.
5. Format the exact startup output from the roadmap; put stack traces and low-level events behind verbose mode.
6. Install idempotent signal handlers. The first signal begins graceful close; a repeated signal after a short deadline forces cleanup and exits nonzero only if cleanup failed.
7. Normalize bind errors, browser-open errors, and unexpected server errors into stable error codes with recovery guidance.
8. Pack the package, install/run it in an isolated directory, and verify the published bin contains all runtime files.

## Acceptance criteria

- `npx reframe` from the packed artifact reaches the welcome page without a global install.
- The URL is printed only after the health probe succeeds.
- The browser opener is invoked once with the exact loopback URL.
- `Ctrl+C` exits within 2 seconds and the same port can be rebound immediately.
- Port and browser-launch errors distinguish fatal from recoverable states.
- No project detection, WebSocket, injection, source mapping, Git, Codex, or Design DNA code is active.

## Test environment and setup

- Install the packed tarball into an empty temporary directory.
- Use a fake browser opener for deterministic integration tests and a real Chromium opener only in an opt-in smoke test.
- Reserve port 4400 for conflict tests; use an ephemeral configured port for parallel CI.
- Capture stdout, stderr, exit code, process tree, and listener state.

## Strict test cases

| ID / type | Test | Expected result |
|---|---|---|
| P1-01 Happy | Run the packed CLI and request `/` and `/health`. | Both return 200; welcome text is correct; one browser-open call uses the reachable URL. |
| P1-02 Happy | Invoke via `npx` without a global installation. | The bin resolves from the package, reaches ready state, and prints the documented output. |
| P1-03 Edge | Send `SIGINT` immediately during startup. | Startup is cancelled, any partial listener closes, browser does not open, and exit completes within 2 seconds. |
| P1-04 Edge | Send two shutdown signals rapidly. | Cleanup is idempotent; there is no double-close exception or hung process. |
| P1-05 Invalid | Run on an unsupported Node version using a version shim. | CLI exits nonzero with `NODE_VERSION_UNSUPPORTED` before binding a port. |
| P1-06 Failure/recovery | Occupy port 4400 before startup. | CLI reports `PORT_IN_USE`, does not claim readiness or open a browser, and leaves no extra process. |
| P1-07 Failure/recovery | Make the browser opener throw. | CLI reports a warning and manual URL, keeps serving the welcome page, and still shuts down cleanly. |
| P1-08 Failure/recovery | Force an HTTP server error after ready. | CLI reports the error, closes the listener, exits nonzero, and a subsequent run succeeds. |
| P1-09 Integration | Run two instances with distinct configured ports. | Both are isolated; stopping one does not stop or corrupt the other. |
| P1-10 Regression | Start, stop, and immediately restart 25 times. | All runs bind successfully; no `EADDRINUSE`, listener, or process leak occurs. |
| P1-11 Cross-environment | Run the packed bin from Windows PowerShell and Linux shell in paths with spaces. | Argument/path handling is identical and no shell-specific command construction fails. |
| P1-12 Performance | Measure pack-installed CLI to health-ready and signal-to-exit. | Warm p95 ready time is <=2 seconds and shutdown p95 is <=2 seconds on CI. |

## Expected results

The single command has a trustworthy lifecycle: it never reports a false ready state, never hides a fatal bind failure, and can be stopped and restarted without manual port cleanup.

## Failure conditions

- Readiness is inferred from a log line rather than an HTTP probe.
- Browser opening occurs before the listener is reachable.
- A failed browser opener terminates an otherwise usable server.
- Shutdown leaves a listener, timer, or unhandled rejection.
- Tests run source directly but never verify the packed artifact.

P1-01 detects false readiness, P1-06 detects premature browser opening, P1-07 detects incorrect fatality, P1-03/P1-04/P1-10 detect lifecycle races, and P1-02 detects missing package files or bin metadata.

## Debugging checklist

- Inspect lifecycle transition logs and the first fatal event.
- Probe the printed host/port independently.
- Verify bin shebang, package `bin`, built file paths, and packed contents.
- Inspect remaining handles/processes and attempt an immediate rebind.
- Distinguish browser opener failure from HTTP server failure.

## Definition of done

Phase 1 is done when the packed `npx` path, welcome page, error states, and cleanup budgets pass on both operating systems for repeated runs, with later-phase features still absent.

---

# Phase 2 — Detect the Project and Start Its Development Server

## Goal

Run Reframe inside an existing supported project, produce a normalized project descriptor, start or provide the correct development server, discover its reachable URL, and supervise it as one lifecycle with Reframe.

## Why this phase comes at this point

The proxy cannot be correct until the upstream server, framework, styling mode, package manager, project root, and capabilities are known. This phase isolates detection and process supervision before any page transformation.

## Components to build

- Project-root guard and detector.
- Package manager detector for npm, pnpm, Yarn, and Bun lockfiles.
- React/Vite, Vanilla, Tailwind, plain CSS, CSS Module, TypeScript, and unsupported-framework capability detection.
- Development-command resolver and interactive fallback.
- `.reframe/config.json` schema/store with explicit write permission and stale-config validation.
- Vanilla static server.
- Child-process supervisor, readiness detector, URL/port parser, timeout, and combined shutdown.

### Inputs, outputs, and behavior

| Input | Output | Required behavior |
|---|---|---|
| Project root files | `ProjectDescriptor` | Canonical root, framework, styling, manager, command, capabilities, confidence, evidence |
| Known supported project | Reachable upstream URL | Uses existing Vite script or Reframe static server without rewriting the project |
| Unknown command in TTY | Validated user selection | Lists real scripts; persists only after consent and successful validation |
| Unknown command without TTY | Actionable error | No hang waiting for input and no guessed command |
| TypeScript/unsupported project | Limited capability descriptor | No source-edit capability; clear preview/manual-assistance fallback for later phases |

## Detailed implementation steps

1. Canonicalize the current directory, confirm it exists/is a directory, and establish the only allowed project root for later filesystem operations.
2. Parse `package.json` defensively; collect evidence rather than returning a label from one filename.
3. Apply deterministic package-manager precedence. If multiple conflicting lockfiles exist, report ambiguity and require a choice rather than silently choosing.
4. Detect React+Vite from dependencies/scripts/config and distinguish JS/JSX from TypeScript. Detect Tailwind from dependencies plus relevant config/CSS evidence; detect CSS Modules from file usage, not only filenames.
5. Detect Vanilla only when a suitable `index.html` exists and no supported framework takes precedence.
6. Produce a versioned `ProjectDescriptor` with a capability matrix such as `canProxy`, `canExplore`, and `canWriteSource`; retain evidence for diagnostics.
7. Resolve an existing `dev` command. For unknown scripts, show a TTY picker; in noninteractive mode fail with available choices and a configuration instruction.
8. Validate `.reframe/config.json` against the current root, package manager, and available script before reuse. Write atomically only with explicit approval.
9. Spawn the command without shell-string concatenation. Capture PID tree/stdout/stderr and probe candidate URLs until one returns a valid page or the deadline expires.
10. For Vanilla without a dev command, start a loopback-only static server with traversal protection and correct content types.
11. Tie child exit and Reframe shutdown together. Unexpected project exit changes state to failed and never leaves Reframe claiming ready.

## Acceptance criteria

- All five initial supported combinations yield correct project descriptors and capability flags.
- Vanilla and React/Vite demos start and return their real pages.
- npm, pnpm, Yarn, and Bun lockfiles map to the matching command without changing lockfiles.
- An unknown command is selected/persisted safely or fails without hanging.
- TypeScript and other unsupported frameworks are detected but never marked source-editable.
- Port conflicts, startup timeouts, early exits, and combined shutdown have clear recovery messages.
- Stopping Reframe stops the child tree it started; attaching to an already running server never kills an unrelated process.

## Test environment and setup

- Use fixture copies for every supported styling mode, manager lockfile, unsupported framework, malformed package, slow server, crashing server, and pre-running server.
- Provide fake package-manager executables for deterministic command assertions; run real installed managers in the nightly matrix.
- Use short test deadlines with injectable clocks/readiness intervals.
- Snapshot the entire fixture before and after detection/start/stop.

## Strict test cases

| ID / type | Test | Expected result |
|---|---|---|
| P2-01 Happy | Detect and start Vanilla with no `package.json`. | Descriptor is `vanilla`, Reframe static server is reachable, and no project file is created or changed. |
| P2-02 Happy | Detect React/Vite with plain CSS and npm. | Descriptor and evidence are correct; exact `npm run dev` command starts; URL is verified by HTTP. |
| P2-03 Happy | Detect React/Vite with CSS Modules. | Styling is `css-modules`; plain-CSS or Tailwind capability is not falsely asserted. |
| P2-04 Happy | Detect React/Vite with Tailwind. | Styling is `tailwind`; Tailwind evidence identifies dependency/config/import; existing `dev` script is used. |
| P2-05 Cross-environment | Repeat package-manager detection for npm, pnpm, Yarn, Bun lockfiles. | Each manager receives the correct argument vector; lockfiles and `package.json` remain byte-identical. |
| P2-06 Edge | Put two conflicting lockfiles in one project. | Detection reports `PACKAGE_MANAGER_AMBIGUOUS`, names both, and starts nothing until a choice is supplied. |
| P2-07 Edge | Existing valid `.reframe/config.json` selects `serve`. | Schema/root/script are revalidated, the saved command is used, and no prompt appears. |
| P2-08 Invalid | Use malformed JSON in `package.json`. | Stable parse error includes file path/line when available; no command or browser starts. |
| P2-09 Invalid | Cached config references a removed script or different root. | Config is rejected as stale; user gets available choices; no obsolete command is executed. |
| P2-10 Invalid | Run in an empty or wrong parent folder. | `PROJECT_ROOT_INVALID` explains evidence checked and does not scan upward outside the chosen scope silently. |
| P2-11 Unsupported | Detect React/Vite TypeScript and Vue fixtures. | TypeScript/Vue are labeled unsupported for source writes; no edit capability is advertised and startup/preview capability is explicit. |
| P2-12 Failure/recovery | Project command exits nonzero before readiness. | Reframe surfaces exit code and tail of redacted logs, closes its resources, and never prints ready. |
| P2-13 Failure/recovery | Server prints a URL but never listens/returns HTTP. | Readiness times out with `DEV_SERVER_TIMEOUT`; printed text alone does not create a ready state. |
| P2-14 Failure/recovery | Preferred upstream port is occupied. | Existing unrelated process is not killed; dynamic Vite URL is discovered or a clear conflict action is shown. |
| P2-15 Failure/recovery | Child spawns a grandchild, then Reframe receives `Ctrl+C`. | Entire owned process tree stops within 5 seconds and all ports can be rebound. |
| P2-16 Integration | Attach to a verified already-running local server. | Reframe records attachment ownership=false and does not kill that server on shutdown. |
| P2-17 Regression | Run detection twice and startup/shutdown 20 times from paths with spaces. | Descriptor is stable, config is idempotent, no shell quoting failure or orphan occurs. |
| P2-18 Performance | Measure detection and project readiness separately. | Detection p95 <=500 ms for demo fixtures; readiness respects a configurable 30-second ceiling and reports progress. |

## Expected results

Reframe can state exactly what project it is operating on and why, then reach a verified upstream page without changing package configuration or leaving process ownership ambiguous.

## Failure conditions

- Framework/style detection relies on one filename or dependency and yields false capabilities.
- Multiple lockfiles are resolved by undocumented order.
- A cached command is trusted without checking the current root and script.
- A child log line is treated as readiness.
- Shell-string spawning breaks quoted paths or enables argument injection.
- Shutdown kills an attached process Reframe does not own or leaves an owned descendant alive.

P2-06 detects silent manager precedence, P2-09 detects stale config trust, P2-13 detects false readiness, P2-15/P2-16 detect ownership errors, and P2-17 detects quoting/idempotency bugs.

## Debugging checklist

- Print the canonical root and detector evidence, not only the chosen label.
- Inspect `package.json` parsing, dependency sections, scripts, lockfiles, and style evidence.
- Compare the exact executable/argument vector with expected manager behavior.
- Check ownership flag, child PID tree, candidate URLs, and the last failing readiness probe.
- Revalidate saved config and confirm no target-project file changed unexpectedly.

## Definition of done

Phase 2 is done when every supported fixture starts through the correct manager/server, unsupported or malformed projects fail safely, ownership-aware shutdown is leak-free, and Phase 1 regressions remain green. No browser-client injection is present yet.

---

# Phase 3 — Inject the Reframe Toolbar

## Goal

Proxy the supported local application, inject a self-contained browser-client bundle into HTML responses, and display `Reframe | Connected | Select | Exit` on the real page without modifying target-project files or breaking the upstream dev server.

## Why this phase comes at this point

Injection needs a verified upstream URL and known framework from Phase 2. It is deliberately built before WebSocket behavior so proxy, HMR, routing, style isolation, and cleanup defects can be diagnosed without protocol state.

## Components to build

- Reverse proxy for HTTP, streaming responses, redirects, cookies, and upstream WebSocket upgrades used by Vite HMR.
- Idempotent HTML injector that touches only eligible HTML documents.
- Browser-client build artifact and bootstrap configuration containing only non-secret session bootstrap data.
- Shadow DOM (preferred) UI root with isolated CSS, controlled z-index, top bar, placeholder connection state, Select, and Exit.
- Injection eligibility guard for local Reframe proxy sessions only.
- UI mount/unmount and HMR/remount behavior.

### Inputs, outputs, and behavior

| Input | Output | Required behavior |
|---|---|---|
| Upstream HTML through Reframe proxy | HTML with one browser-client bootstrap | Original document semantics retained; injection never reaches disk |
| JS/CSS/image/font/API response | Byte-equivalent proxied response | No injection or content corruption |
| Vite HMR/navigation/refresh | Recreated single UI root | Upstream HMR continues and no duplicate toolbar appears |
| Exit click | Normal application page | All Reframe DOM, styles, listeners, offsets, and temporary UI state are removed |

## Detailed implementation steps

1. Start a separate loopback proxy URL and preserve the upstream project's URL/host semantics, headers, redirects, cookies, and asset paths.
2. Proxy upstream WebSocket upgrades before adding Reframe's own Phase 4 channel; distinguish paths/protocols so Vite HMR is not intercepted.
3. Inject only successful, parseable `text/html` navigation responses. Handle content encoding correctly and recalculate/remove stale length/ETag headers.
4. Insert a versioned script URL and bootstrap object once, preferably before `</body>` with safe fallback for documents lacking body tags.
5. Mount the top bar inside a Shadow DOM root. Use Reframe-owned CSS variables and no target Tailwind utilities.
6. Keep overlay positioning from permanently changing layout. If a temporary top offset is required, save and restore the exact prior inline/computed state.
7. Make bootstrap idempotent across back/forward navigation, refreshes, SPA route changes, and Vite HMR.
8. Implement Exit as a complete teardown, not merely `display:none`.
9. Add an injection marker/header visible in diagnostics but never write markers into project source.

## Acceptance criteria

- Toolbar renders once on Vanilla, React/plain CSS, React/CSS Modules, and React/Tailwind fixtures.
- Vite asset loading, routing, error overlay, and HMR still work through the proxy.
- Target styles cannot materially alter the toolbar, and toolbar styles do not leak into the page.
- Refresh and HMR preserve one toolbar; Exit removes every Reframe artifact and returns normal page interaction.
- Non-HTML responses are unmodified and project files remain byte-identical.
- The client is not injected when visiting the upstream URL directly or a nonlocal/unconfigured origin.

## Test environment and setup

- Real Vanilla and React/Vite fixture processes behind the proxy.
- Fixtures with aggressive global CSS (`*`, `button`, very high z-index), CSP, compressed HTML, SPA routes, HMR edits, binary assets, streaming responses, and HTML without closing body.
- Playwright DOM/style snapshots plus complete fixture file hashes.

## Strict test cases

| ID / type | Test | Expected result |
|---|---|---|
| P3-01 Happy | Open Vanilla through the proxy. | Exactly one toolbar renders above the site and the page remains usable; no project file changes. |
| P3-02 Happy | Open React/Vite through the proxy and edit a component file externally. | Vite HMR updates the component and exactly one toolbar remains mounted. |
| P3-03 Edge | Upstream HTML has no `</body>` or arrives compressed/chunked. | Valid HTML is returned with one bootstrap; headers are correct and browser parsing succeeds. |
| P3-04 Edge | Navigate across SPA routes, use back/forward, and refresh repeatedly. | Toolbar remains singular and Exit remains functional; no listener count grows per navigation. |
| P3-05 Isolation | Load global CSS that resets all elements and sets `button { all: unset }`. | Shadow-root toolbar retains documented dimensions, colors, controls, and accessibility roles. |
| P3-06 Isolation | Inspect project elements for Reframe style leakage. | No Reframe selector matches outside its root; application computed styles are unchanged except documented temporary offset. |
| P3-07 Invalid | Upstream returns malformed HTML or a 500 HTML error overlay. | Proxy does not crash; injection behavior follows the documented eligibility rule and upstream error remains visible. |
| P3-08 Security | Request JS, JSON, SVG, image, font, range, and API responses through proxy. | Content/status/headers remain semantically equivalent and no bootstrap text is inserted. |
| P3-09 Security | Visit upstream directly and attempt to reuse an injection URL from an unrelated origin. | Direct page has no toolbar; unrelated origin cannot bootstrap an active Reframe client. |
| P3-10 Failure/recovery | Kill and restart upstream while proxy remains alive. | Proxy shows a clear upstream-disconnected state/error, recovers when upstream returns, and does not serve stale editable HTML as ready. |
| P3-11 Integration | Use Vite HMR WebSocket and a normal app WebSocket through the proxy. | Both upgrade/communicate normally; proxy routing does not consume or corrupt them. |
| P3-12 Regression | Click Exit after scroll, route change, and HMR. | Shadow root, overlay, offsets, observers, and event listeners are removed; page behavior matches direct upstream. |
| P3-13 Cross-environment | Run proxy tests on Windows/Linux and browser-client smoke tests in Chromium/Firefox/WebKit nightly. | No path/host/header/browser-specific injection failure is observed. |
| P3-14 Performance | Compare direct-upstream and proxied navigation for the demo pages. | Injection adds <=100 ms p95 server overhead and <=50 KB gzipped client payload at this phase. |

## Expected results

The real local application is the editing surface, served through a transparent proxy with one isolated Reframe UI. Normal development behavior remains intact and no source file has been touched.

## Failure conditions

- Regex-only injection corrupts compressed, malformed, or unusual HTML.
- Every `text/*` response is modified.
- The toolbar depends on target Tailwind or inherits target resets.
- HMR WebSocket upgrades are routed to the wrong service.
- Exit hides UI but leaves offsets, listeners, or observers.
- Direct/upstream production-like pages receive injection.

P3-03 detects brittle injection, P3-08 detects overbroad transforms, P3-05/P3-06 detect CSS coupling, P3-11 detects HMR routing mistakes, and P3-12 detects incomplete teardown.

## Debugging checklist

- Compare upstream and proxy status, headers, content encoding, and first HTML difference.
- Count injection markers, UI roots, observers, and event listeners.
- Inspect Shadow DOM computed styles and z-index conflicts.
- Check WebSocket upgrade path and target.
- Hash project files before/after and compare direct-versus-proxy behavior.

## Definition of done

Phase 3 is done when injection is transparent, isolated, idempotent, local-only, removable, and compatible with HMR across all supported fixtures while Phases 0–2 remain green.

---

# Phase 4 — Connect the Browser Client to the Local Server

## Goal

Establish a versioned, localhost-only, authenticated WebSocket channel with accurate connection state, strict payload validation, refresh reconnection, and no client-controlled filesystem paths.

## Why this phase comes at this point

The browser client and server now exist on a known proxy session. A secure transport and state model must be proven before element data or edit requests can cross the boundary.

## Components to build

- Shared versioned protocol schemas for `client:ready`, `server:ready`, `selection:changed`, `preview:changed`, `edit:apply`, `edit:cancel`, `server:error`, and temporary `ping`/`pong`.
- Cryptographically random per-run session token and non-secret project/session identifiers.
- WebSocket server bound to loopback with origin, host, token, protocol-version, payload-size, and message-type checks.
- Browser connection state machine with bounded exponential backoff and jitter.
- Server message router and structured error envelopes.
- Temporary Test Connection control and diagnostics.

### Inputs, outputs, and behavior

| Input | Output | Required behavior |
|---|---|---|
| Valid `client:ready` | `server:ready` | Returns project name/framework/capabilities/current state without filesystem authority |
| Valid `ping` | Matching `pong` | Correlation ID retained; toolbar status becomes Connected |
| Refresh or transient disconnect | New authenticated connection | State changes accurately; reconnect is bounded and does not duplicate handlers |
| Invalid origin/token/type/schema | Close/error with stable code | Message has no side effect and sensitive validation detail is not leaked |

## Detailed implementation steps

1. Define the protocol version, maximum payload sizes, allowed message direction, required fields, and stable error codes in `shared`.
2. Generate a high-entropy token for each Reframe run and deliver it only through the injected bootstrap; never log it or persist it in the project.
3. Bind the Reframe WebSocket endpoint to loopback and validate `Origin`, `Host`, token, project/session ID, and protocol version during upgrade/handshake.
4. Validate parsed JSON against the exact schema before routing. Reject unknown fields for security-sensitive messages and reject unknown message types.
5. Keep browser payloads source-relative and identity-based. The server derives all absolute paths from server-owned mappings.
6. Implement connection states `connecting`, `connected`, `disconnected`, `reconnecting`, and `failed`; update the toolbar from actual socket events/heartbeat, not optimistic clicks.
7. Add ping/pong correlation, heartbeat timeout, outbound queue policy, and bounded reconnection. Drop stale preview/apply messages rather than replaying mutations automatically.
8. Add rate limits and backpressure for selection/preview messages; close oversized or abusive connections.
9. Ensure a page refresh creates one active connection and disposes the old client's timers/listeners.

## Acceptance criteria

- Valid clients automatically exchange ready messages and ping/pong in both directions.
- Status is accurate through refresh, server restart, offline/online transitions, and heartbeat failure.
- Invalid token, wrong origin/host, wrong project, wrong protocol version, malformed JSON, oversized payload, and unknown types are rejected before routing.
- No browser message can name an absolute path or cause a filesystem read/write.
- Selection/preview message bursts remain bounded and do not starve control messages.
- Tokens and sensitive bootstrap values are absent from normal/verbose logs.

## Test environment and setup

- Real browser client through the Phase 3 proxy plus raw WebSocket clients for hostile inputs.
- Injectable token generator/clock and deterministic backoff for unit tests.
- Canary session token in log-redaction assertions.
- Network proxy capable of dropping, delaying, duplicating, and reordering frames.

## Strict test cases

| ID / type | Test | Expected result |
|---|---|---|
| P4-01 Happy | Load the page with valid bootstrap and press Test Connection. | Ready exchange completes; matching pong appears; status is Connected. |
| P4-02 Happy | Refresh the page ten times. | Each page obtains one active socket; old sockets/timers close and status recovers automatically. |
| P4-03 Edge | Start browser before WS endpoint is ready. | Client shows Connecting/Reconnecting, uses bounded backoff, and becomes Connected once available without reload. |
| P4-04 Edge | Open two tabs for the same session. | Tabs receive independent connection IDs; one tab's selection state does not overwrite the other's unless explicitly shared. |
| P4-05 Invalid | Send malformed JSON, missing fields, wrong types, unknown type, and wrong protocol version. | Each is rejected with a stable code/close; router side-effect counters remain zero. |
| P4-06 Security | Connect with missing/invalid token, wrong origin, non-loopback host, or wrong project ID. | Upgrade/ready is rejected and no project metadata or token-validation detail is disclosed. |
| P4-07 Security | Put absolute paths and `../` sequences in every string field. | Schema/router rejects path-like fields where disallowed; no filesystem API is called. |
| P4-08 Security | Send a payload above the size limit and 10,000 previews rapidly. | Oversized frame is closed/rejected; rate limiting/backpressure keeps memory bounded and control messages responsive. |
| P4-09 Failure/recovery | Kill WS server while project server stays up, then restart it. | Toolbar changes to Disconnected, page remains usable, reconnect authenticates, and no mutation message is replayed. |
| P4-10 Failure/recovery | Drop pong frames. | Heartbeat deadline marks Disconnected and starts bounded reconnection; it never shows stale Connected. |
| P4-11 Integration | Send all initial allowed message types in both valid and invalid directions. | Only direction-valid, schema-valid messages reach the registered handler with preserved correlation/session IDs. |
| P4-12 Regression | Inspect logs after all hostile tests using a canary token. | Token and authorization data never appear; errors contain safe diagnostic codes. |
| P4-13 Cross-environment | Connect using IPv4/IPv6 loopback variants on Windows/Linux. | Only configured loopback variants are accepted and legitimate local clients connect consistently. |
| P4-14 Performance | Measure 1,000 sequential local ping/pong exchanges and preview bursts. | Ping/pong p95 <=100 ms; memory stabilizes after the burst and UI control messages are not starved. |

## Expected results

The toolbar truthfully represents a small authenticated local protocol. Hostile or malformed clients cannot gain project details or filesystem authority, and transient development reloads recover without user action.

## Failure conditions

- Token is in a query string, project file, or log.
- Origin/token checks happen after accepting actionable messages.
- Payloads are cast rather than runtime-validated.
- Browser sends absolute paths or server trusts a selector as a file location.
- Reconnect replays `edit:apply` or creates duplicate handlers.
- UI remains Connected after heartbeat failure.

P4-06/P4-12 detect credential and handshake errors, P4-05 detects missing runtime validation, P4-07 detects client path authority, and P4-02/P4-09/P4-10 detect stale or duplicated connection state.

## Debugging checklist

- Correlate browser connection ID with server session/project ID without printing the token.
- Inspect upgrade origin/host/protocol and close code.
- Validate raw payload against the shared schema and message direction.
- Count sockets, timers, queued frames, and registered handlers.
- Check heartbeat timestamps, backoff state, and whether a stale mutation was queued.

## Definition of done

Phase 4 is done when connection, rejection, backpressure, and recovery tests pass with token redaction and no filesystem calls from unvalidated data, while HMR and earlier phases remain stable.

---

# Phase 5 — Select and Preview One Element

## Goal

Let the user enter Select mode, choose exactly one eligible element, resize its width as a clearly temporary browser-only preview, cancel exactly, or send a constrained edit proposal to the server.

## Why this phase comes at this point

Selection and preview need the injected UI and protocol but do not need source mapping. Keeping the source untouched allows pointer, overlay, layout, and state-race bugs to be solved before file writes become possible.

## Components to build

- Selection controller and eligibility rules.
- Hover/selected overlays and semantic label.
- Stable temporary fingerprint containing tag, ID, classes, text summary, parent summary, route, and viewport; it is not a filesystem mapping.
- Width resize handles and `ResizeSession` with original/preview state.
- Apply/Cancel controls and keyboard cancellation.
- Preview/edit-proposal protocol handling and stale-selection invalidation.

### Inputs, outputs, and behavior

| Input | Output | Required behavior |
|---|---|---|
| Hover in Select mode | Nonblocking outline/label | No source or persistent DOM style change |
| Click eligible element | One locked selection and resize handles | Previous selection is fully cleared |
| Drag width handle | Temporary width + old/new display | Source files and server edit state remain unchanged |
| Cancel/Escape | Exact original browser style/layout | All preview mutations removed |
| Apply | Constrained `EditProposal` | Server receives tag/identity/context/old/new width, never an arbitrary path |
| Hard refresh before Apply | Clean page | Unsaved preview disappears and is never represented as saved |

## Detailed implementation steps

1. Add explicit Select mode; when off, page pointer, keyboard, scrolling, links, menus, and forms behave normally.
2. Use composed event paths to find an eligible element while excluding the Reframe root, `head`, scripts/styles, invisible/zero-area nodes, cross-origin iframe content, browser-native overlays, and unsupported canvas/runtime content.
3. Render hover/selection outlines in a Reframe overlay layer with `pointer-events` configured so it does not trap ordinary interaction except resize handles.
4. On selection, capture a bounded fingerprint and exact original inline width declaration/presence, relevant box-sizing, bounding box, route, viewport, and selection generation.
5. During drag, schedule updates through `requestAnimationFrame`, clamp invalid/negative/nonfinite widths, and display both original and proposed values.
6. Keep preview state browser-only. Do not send continuous source-edit requests; rate-limited `preview:changed` is diagnostic/state information only.
7. Cancel by restoring the exact inline property/value/priority or removing the property if it did not exist. Do not overwrite unrelated inline styles changed by the app during the session.
8. Apply serializes one immutable proposal and marks it with session, tab, selection generation, and proposal ID. Phase 5 server acknowledges receipt but performs no filesystem operation.
9. Invalidate or safely re-resolve overlays when the element is removed, HMR replaces the DOM, route changes, viewport changes, or another selection begins.

## Acceptance criteria

- Hover and selection work on both demos; one selection exists per tab.
- Ignored/unsupported elements cannot be selected and explain why when appropriate.
- Width preview follows the handle smoothly and is visibly temporary.
- Cancel/Escape restores exact pre-preview state; refresh discards unsaved preview.
- Apply emits the complete roadmap data plus IDs needed to reject stale messages, but changes no file.
- Select-off and Exit restore normal application behavior with no leftover overlay/listener/style.
- Dynamic DOM replacement, scrolling, and viewport edges do not leave detached overlays or crash the client.

## Test environment and setup

- Playwright on Vanilla and React fixtures with nested elements, transforms, scroll containers, hidden nodes, iframes, canvas, dynamic removal, route changes, and app-driven inline-style updates.
- File snapshots before/after every test and a server filesystem-call spy.
- Performance fixture with 2,000 DOM nodes and rapid pointer movement.

## Strict test cases

| ID / type | Test | Expected result |
|---|---|---|
| P5-01 Happy | Enable Select, hover and click the unique Vanilla card, drag from 320px to 420px. | Correct card alone is outlined/selected; displayed proposed width is 420px; disk is unchanged. |
| P5-02 Happy | Cancel with button and repeat with Escape. | Original inline width/value/priority or absence is restored byte-for-behavior; handles and proposal disappear. |
| P5-03 Happy | Apply the React annual-card preview. | Server receives one immutable proposal with required context/IDs; it acknowledges without any filesystem call. |
| P5-04 Edge | Select a second element while the first has a preview. | User is prompted/discards according to policy; never two live selections or hidden preview mutations. |
| P5-05 Edge | Resize an element using `border-box`, percentage width, min/max constraints, and a transformed ancestor. | Visual handle tracks the bounding box; proposal reports pixel preview plus original source-independent context; invalid sizes are clamped. |
| P5-06 Edge | Scroll nested containers and move the selected element near each viewport edge. | Overlay/toolbar reposition correctly and remain usable without covering the handle irrecoverably. |
| P5-07 Invalid | Try selecting Reframe UI, `script`, `style`, `head`, hidden/zero-area nodes, canvas, and cross-origin iframe contents. | Selection remains unchanged; no proposal is created; supported explanation is shown where useful. |
| P5-08 Invalid | Inject NaN, infinity, negative, zero, and extremely large widths through protocol/devtools. | Schema/session rejects nonfinite/out-of-range values; DOM and server state remain unchanged. |
| P5-09 Failure/recovery | App removes the selected node during drag. | Resize session cancels safely, observers/handles detach, no Apply is enabled, and page keeps working. |
| P5-10 Failure/recovery | HMR replaces DOM or route changes before Apply. | Old selection generation becomes stale; proposal is rejected/cancelled and user must reselect. |
| P5-11 Failure/recovery | App changes an unrelated inline style during preview, then user cancels. | Reframe restores only its width mutation and preserves the app's unrelated style change. |
| P5-12 Integration | Disconnect WS while resizing, click Apply, then reconnect. | Preview stays labeled temporary; Apply is disabled/queued only as nonmutating UI state and is not replayed as a source mutation. |
| P5-13 Regression | Turn Select off and click links, type in inputs, use menus, and scroll. | Application behavior matches direct upstream; Reframe does not intercept events. |
| P5-14 Regression | Hard-refresh with an active preview. | Preview is gone, original source-rendered width returns, and no saved/accepted indicator appears. |
| P5-15 Cross-browser | Run hover/select/resize/cancel in Chromium and nightly Firefox/WebKit. | Composed-path, pointer capture, cursor, and overlay behavior remain functionally equivalent. |
| P5-16 Performance | Move pointer across 2,000 nodes and drag for 5 seconds. | No long task >50 ms caused by selection; p95 selection work per animation frame <=8 ms and message rate stays bounded. |

## Expected results

Users can confidently experiment with one width change while Reframe maintains a hard distinction between temporary DOM state and persistent source state. Invalid or stale interactions never turn into edit requests.

## Failure conditions

- Preview writes a style tag/source file or is shown as saved.
- Cancel writes a guessed width instead of restoring exact prior state.
- The overlay traps application input when Select is off.
- Detached nodes or HMR leave active handles/listeners.
- Apply omits session/selection generation and accepts stale state.
- Continuous pointer movement floods the server.

P5-02/P5-11 catch destructive restoration, file snapshots catch hidden writes, P5-09/P5-10 catch detached/stale state, P5-13 catches event interception, and P5-16 catches unbounded hover/message work.

## Debugging checklist

- Inspect Select mode, selected node connectivity, selection generation, and proposal ID.
- Compare captured original inline width/value/priority with the cancelled state.
- Check eligibility decision and composed event path.
- Count overlay roots, observers, pointer-capture owners, and protocol messages.
- Verify disk snapshots and server filesystem-call spy are clean.

## Definition of done

Phase 5 is done when preview/cancel/apply semantics survive dynamic DOM, reconnect, refresh, invalid input, and performance stress with no source changes, and all earlier phase suites pass.

---

# Phase 6 — Write the Edit to the Real Source File

## Goal

Resolve one approved width proposal to exactly one safe source location, apply the smallest framework-appropriate change atomically, verify hot reload and page health, and roll back automatically on failure.

## Why this phase comes at this point

This is the core technical proof and depends on every earlier boundary: correct project root, live upstream, injected metadata, authenticated proposal, and stable selection. Vanilla is implemented and gated before React; React plain CSS/CSS Modules are gated before Tailwind transformations.

## Components to build

- Development-only source metadata injection for Vanilla and React/Vite.
- Server-owned mapping registry with exact/probable/ambiguous/not-mapped confidence and candidate evidence.
- Vanilla HTML/CSS mapper and CSS width editor.
- React/Vite JSX mapper plus plain-CSS and CSS Module ownership resolution.
- Tailwind width-class editor preserving variants and using an arbitrary value only when needed.
- Root/path/symlink containment guard.
- Compare-and-swap edit transaction with content hash, atomic write, exact changed-file allowlist, and transient rollback backup.
- Post-write HMR/build/page/console verification and rollback response.

### Inputs, outputs, and behavior

| Input | Output | Required behavior |
|---|---|---|
| Valid Phase 5 proposal + server mapping | `EditPlan` | One root-contained file/range, old/new text, confidence exact, expected hash, impact summary |
| Ambiguous/probable/unmapped element | Candidate/error response | Apply disabled; Choose Source, Keep as Preview, or Cancel; no write |
| Exact Vanilla CSS mapping | Minimal CSS declaration edit | Correct rule changes; formatting/EOL/encoding otherwise preserved |
| Exact React/CSS mapping | Minimal JSX/CSS/CSS Module edit | Correct component instance/style owner changes with disclosed reuse impact |
| Exact Tailwind mapping | Utility replacement | Existing `w-*` variant preserved; arbitrary `w-[Npx]` only if no supported token matches |
| Stale hash/write/verification failure | Rollback result | Original bytes restored; user knows whether source changed and why it was rejected |

## Detailed implementation steps

1. Define an `EditPlan` that the mapper produces and the writer consumes. It must include canonical relative path, source range/node identity, expected bytes/hash, before/after fragment, styling mode, mapping evidence/confidence, reuse impact, and allowed changed-file set.
2. Resolve every candidate path on the server from the canonical project root. Reject absolute paths, traversal, alternate-drive paths, device names, and symlinks/junctions that resolve outside the root.
3. Phase 6A—Vanilla metadata: transform development-served HTML to add source file/range/element IDs without writing them to disk. Map only unique IDs, unique classes with one owning rule, or an exact source marker.
4. Parse CSS structurally. For the first supported operation, update an existing unambiguous width declaration. Do not use unconstrained string replacement or invent a new rule in this phase.
5. Gate and freeze Vanilla: exact edit persists after refresh; cascade ambiguity, multiple selectors, dynamic elements, and unsupported styling remain preview-only.
6. Phase 6B—React metadata: add development-time JSX transform metadata through the Vite adapter. Map rendered node to component, file/range, instance, props/style owner, and whether the source is reused.
7. Support an existing width in a static JSX style only when inline style is already the project's method, or an existing plain-CSS/CSS Module declaration. Preserve dynamic expressions; never replace them with a literal silently.
8. Gate and freeze React plain CSS/CSS Modules before enabling Tailwind.
9. Phase 6C—Tailwind: parse `className` safely, locate the active base/responsive width utility, replace a matching utility token, and preserve prefixes such as `md:`. Use `w-[420px]` only if no configured/existing utility maps to 420px. Reject computed/dynamic class expressions not exactly editable.
10. Before every write, reacquire the per-project edit lock, reread the file, compare the exact expected hash/range, and abort with `FILE_STALE` if anything differs.
11. Create a transient, local transaction backup outside the source path, compute the minimal diff, atomically write through a same-directory temporary file/rename, preserve BOM/encoding/EOL/mode, and fsync where supported.
12. Observe the project server through its real HMR/build signals and probe the route. Check compile overlay, page response, browser page errors, and that the selected element now renders the proposed width within tolerance.
13. On timeout, build failure, page failure, unexpected changed-file scope, or width mismatch, atomically restore the original bytes, wait for recovery, and report both primary and rollback status. Persistent Phase 7 history is not yet available.
14. Invalidate the mapping after HMR and require new metadata for the next edit.

## Acceptance criteria

- One unique Vanilla width declaration is updated, survives refresh, and is the only source diff.
- One simple React width is updated correctly for plain CSS, CSS Modules, and Tailwind.
- Tailwind preserves existing conventions and never falls back to inline style unless inline style was already the exact supported owner.
- Apply is impossible below exact confidence or when multiple source locations/owners remain.
- Stale content, out-of-root paths, shared-component impact without acknowledgement, unsupported dynamic styles, and unexpected file scope block the edit.
- Writes are atomic and preserve all unrelated bytes/format characteristics.
- A failed build/HMR/page verification restores the exact pre-edit bytes and returns the page to a healthy state or reports rollback failure prominently.
- The complete React winning milestone works: resize, Apply, exact source diff, refresh persistence.

## Test environment and setup

- Dedicated fixture copies for unique/ambiguous Vanilla selectors, CSS cascade, React plain CSS, CSS Modules, Tailwind configured values, Tailwind arbitrary values, responsive variants, dynamic `className`, shared components, stale files, symlink escape, CRLF/BOM, read-only files, slow HMR, and compile failure.
- Real Vite and browser for E2E; parser/transform unit tests use golden source and diffs.
- Filesystem abstraction only at the transaction boundary so denial, short write, rename failure, disk-full, and rollback failure can be injected.
- Snapshot source bytes, Git diff, browser errors, and project health before/after.

## Strict test cases

| ID / type | Test | Expected result |
|---|---|---|
| P6-01 Happy | Change unique Vanilla `#pricing-card` width 320px -> 420px. | Only the intended CSS declaration changes; page HMR/reloads to 420px; metadata is absent from disk. |
| P6-02 Happy | Change a unique Vanilla class with one owning rule. | Exact rule changes once; whitespace, comments, EOL, and unrelated matching text remain unchanged. |
| P6-03 Edge | Same selector appears in two stylesheets or width is overridden by a later media rule. | Mapping is Ambiguous/Probable, Apply is disabled, candidates/evidence are shown, and disk is unchanged. |
| P6-04 Invalid | Width is negative, noninteger beyond policy, nonfinite, or outside configured bounds. | Proposal/edit schema rejects it before mapping/write; source and preview acceptance state remain unchanged. |
| P6-05 Happy | Edit React component with an existing plain-CSS width. | Mapper identifies component/file/style rule; exactly one minimal CSS diff persists after Vite HMR. |
| P6-06 Happy | Edit React element using an imported CSS Module class. | Correct module file/rule changes; similarly named global classes and other modules are untouched. |
| P6-07 Happy | Replace Tailwind `w-80` with configured `w-96`. | Only that token in the exact JSX node changes; order, variants, and all other classes are preserved. |
| P6-08 Edge | Request 420px when no configured Tailwind utility maps exactly. | Exact node receives `w-[420px]`; no inline style or global token/config is added. |
| P6-09 Edge | Element uses `md:w-80` plus base `w-full`. | Reframe requires/uses explicit breakpoint intent; selected variant alone changes and base/mobile behavior is preserved. |
| P6-10 Invalid | Element uses computed template/conditional classes or dynamic width expression. | Mapping is not exact; Apply is disabled and the system does not rewrite the expression. |
| P6-11 Impact | Selected source node belongs to a component reused on multiple cards/routes. | Reuse locations/impact are shown; edit blocks until user explicitly chooses shared impact or an exact instance-local owner. |
| P6-12 Concurrency | External editor changes the target file after mapping but before Apply. | Hash compare returns `FILE_STALE`; neither external change nor Reframe proposal is overwritten. |
| P6-13 Concurrency | Two valid Apply requests arrive together. | Per-project lock serializes them; second remaps or fails stale; file never contains an interleaved/corrupt result. |
| P6-14 Security | Send absolute, `../`, alternate-drive, UNC, encoded traversal, and NUL path attempts. | Root guard rejects all before file read; no out-of-root file is probed or disclosed. |
| P6-15 Security | Target-relative symlink/junction resolves outside project root. | Canonical containment rejects it; outside file remains byte-identical. |
| P6-16 Failure/recovery | Deny write or inject disk-full/short-write/rename failure. | Original file remains exact; partial temp is cleaned/quarantined; error states that no source change was accepted. |
| P6-17 Failure/recovery | Applied edit produces Vite compile error or route returns 500. | Verification fails, original bytes are restored atomically, healthy page returns, and edit is rejected. |
| P6-18 Failure/recovery | Verification times out because HMR stalls. | Configured deadline expires; rollback occurs; UI offers retry/reselect and never waits indefinitely. |
| P6-19 Failure/recovery | Primary write succeeds but injected rollback write fails. | UI enters critical recovery state, preserves backup path/hash, disables further edits, and does not claim original was restored. |
| P6-20 Integrity | Edit UTF-8 BOM/CRLF CSS containing comments and duplicate width text in strings. | BOM/EOL/mode are preserved; only AST-selected declaration bytes differ. |
| P6-21 Integration | Execute the full React winning milestone then hard refresh. | Browser and source show the new width; selection remaps after refresh; no extra files changed. |
| P6-22 Regression | Repeat all supported edits 20 times on fresh copies and run earlier phase suites. | Diffs are deterministic/idempotent, no metadata accumulates, no port/process leak or toolbar regression appears. |
| P6-23 Cross-environment | Run source transforms/writes on Windows and Linux fixture copies. | Canonical relative paths and resulting source semantics match; platform EOL/mode policy is preserved. |
| P6-24 Performance | Measure proposal-to-plan, atomic write, and local verification. | Mapping+planning p95 <=500 ms; write p95 <=100 ms; verification completes within a configurable 10-second demo budget or rolls back. |

## Expected results

Reframe has proven its core claim: a browser resize can become one minimal, framework-appropriate, persistent source change with explicit mapping evidence and transactional rollback. Every unsafe case remains preview-only.

## Failure conditions

- DOM selector/string search is treated as exact source ownership.
- CSS/JSX is edited with global regex replacement.
- File is not reread/hash-checked immediately before write.
- Client supplies or controls a filesystem path.
- Atomicity, encoding, EOL, or unrelated comments are lost.
- HMR activity alone is treated as success without page/render verification.
- Shared component or responsive impact is hidden.
- Rollback failure is presented as successful recovery.

P6-03/P6-10 detect invented certainty, P6-02/P6-20 detect regex collateral damage, P6-12/P6-13 detect stale/concurrent writes, P6-14/P6-15 detect path trust, P6-17/P6-18 detect weak verification, and P6-19 detects false recovery reporting.

## Debugging checklist

- Inspect mapping evidence/confidence, component instance, style owner, and reuse locations.
- Compare expected versus current hash/range and exact changed-file allowlist.
- Review parser/AST node identity and minimal diff rather than the rendered selector alone.
- Verify canonical/real path remains inside canonical project root.
- Inspect transaction state: backup, temp, rename, verification probe, rollback, and post-rollback hash.
- Compare browser computed width at the correct route/viewport after a fresh metadata remap.

## Definition of done

Phase 6 is done only when Vanilla, React plain CSS, CSS Modules, and Tailwind gates all pass; ambiguous/dynamic/out-of-root/stale/failing edits remain safe; rollback is proven; and the full persistent React milestone passes repeatedly on Windows and Linux.

---

# Phase 7 — Add Git Checkpoints and Restore

## Goal

Create a durable local checkpoint for every accepted edit and restore the previous source safely without mixing or overwriting unrelated user work and without any remote Git action.

## Why this phase comes at this point

Persistent history is meaningful only after deterministic source edits and rollback work. It must exist before AI edits, because AI can change a broader source scope and needs a recoverable pre-generation state.

## Components to build

- Git/worktree inspector with dirty-path and overlap detection; no Git mode fallback.
- `.reframe/history/<checkpoint-id>` schema and atomic checkpoint store.
- `before.patch`, `after.patch`, metadata, before/after page/component screenshots, and verification record.
- Screenshot service with explicit route/viewport and privacy/retention hooks.
- History API/UI for Previous, Current, Restore Previous.
- Restore service with pre-restore safety checkpoint, expected-current hash checks, patch validation, HMR verification, and recovery.
- Git command allowlist that contains no network, push, merge, reset-hard, or history-rewrite commands.

### Inputs, outputs, and behavior

| Input | Output | Required behavior |
|---|---|---|
| Verified accepted Phase 6 transaction | Complete checkpoint directory | Metadata/patches/hashes/screenshots are internally consistent and atomically published |
| Dirty unrelated user files | Checkpoint/edit allowed with disclosure | Unrelated bytes and index state remain untouched |
| Dirty overlapping source region | Blocked review state | No automatic overwrite/stage/commit; user must resolve or choose a safe path |
| Restore Previous | Safety checkpoint + restored bytes | Expected-current state verified, project reloads, source/browser match previous |
| Non-Git project | Local history checkpoint | Restore remains functional; UI states Git is unavailable rather than disabling safety |

## Detailed implementation steps

1. Define a versioned checkpoint schema containing ID, parent ID, timestamps, edited files, old/new hashes, edit type, selected element, route, viewport, before/after screenshots, verification result, repository HEAD/index/worktree summary, and optional Codex/Design DNA IDs.
2. Inspect Git without staging or modifying it. Record tracked/untracked/ignored status and compute overlap between planned Reframe ranges and existing user modifications.
3. Generate forward/reverse unified patches from exact transaction bytes. Validate both in a temporary copy before publishing the checkpoint.
4. Capture before/after screenshots only from the documented route/viewport; mark privacy exclusions and capture failure explicitly.
5. Write checkpoint contents to a temporary directory, fsync where supported, verify hashes/schema, then atomically rename to its final ID. An incomplete checkpoint cannot appear in history.
6. Change acceptance semantics: an edit is not Accepted unless its required checkpoint is complete. If checkpoint creation fails, keep the edit in review/recovery state and offer rollback/retry.
7. Build the minimal history UI and list only valid checkpoints in deterministic timestamp/parent order.
8. Before restore, re-hash affected files, re-check user-work overlap, and create a safety checkpoint of the current state.
9. Apply the reverse/selected patch only to expected files/ranges, verify project/browser, and update current history pointer. If restore fails, recover from the safety checkpoint and report both outcomes.
10. Execute only local read/diff/status operations. Never run push/fetch/pull or create visible automatic commits in the hackathon implementation.

## Acceptance criteria

- Every accepted edit has a valid, complete, parseable checkpoint with matching hashes and screenshots/explicit screenshot status.
- Restore Previous creates a safety checkpoint, restores exact source, reloads the browser, and records verification.
- Dirty unrelated files and index state remain byte/status identical.
- Dirty overlapping content or unexpected current hashes block restoration.
- Checkpoint corruption, write failure, screenshot failure, Git absence, and Git command failure are visible and recoverable.
- No remote Git operation, automatic staging, commit, reset, merge, or conflict resolution occurs.
- Phase 6 winning milestone now includes a successful Restore returning browser and source to original state.

## Test environment and setup

- Fixture copies initialized as clean Git repos, dirty unrelated/overlapping repos, staged/unstaged/untracked mixes, detached HEAD, no Git, corrupted history, and unavailable Git executable.
- Fake Git executable records every argument; network is disabled during tests.
- Screenshot service can return success, timeout, partial file, or privacy-masked image.
- Filesystem failure injection at each checkpoint file and atomic rename.

## Strict test cases

| ID / type | Test | Expected result |
|---|---|---|
| P7-01 Happy | Accept one verified Vanilla/React edit in a clean Git repo. | One complete checkpoint appears with correct parent, patches, hashes, route/viewport, screenshots, and verification. |
| P7-02 Happy | Click Restore Previous after the winning milestone. | Safety checkpoint is created; exact original source/browser return; history pointer and UI update. |
| P7-03 Edge | Accept an edit in a non-Git project. | Local checkpoint/restore work; UI states no Git metadata; no Git requirement blocks editing. |
| P7-04 Edge | Repo has unstaged/staged/untracked changes in unrelated files. | Reframe discloses dirty state but preserves all bytes and index status through edit/checkpoint/restore. |
| P7-05 Invalid | User modification overlaps the exact target range before edit/restore. | Operation blocks with changed file/range evidence; no automatic merge or overwrite occurs. |
| P7-06 Invalid | Tamper with metadata hash, patch, or screenshot after creation. | Checkpoint is marked corrupt and cannot be restored; other valid checkpoints remain usable. |
| P7-07 Failure/recovery | Fail writing each checkpoint artifact or final rename. | Incomplete checkpoint never appears as valid; edit remains unaccepted/recoverable; temp artifacts are cleaned/quarantined. |
| P7-08 Failure/recovery | Screenshot capture times out or produces a truncated file. | Checkpoint does not claim complete visual history; UI offers retry/degraded policy, and source safety remains intact. |
| P7-09 Failure/recovery | Source changes after checkpoint listing but before restore. | Expected-current hash fails; restore is blocked before write and user's new change remains intact. |
| P7-10 Failure/recovery | Restore patch applies but build verification fails. | Safety checkpoint is reapplied, current bytes/browser recover, and failed restore is recorded—not marked successful. |
| P7-11 Failure/recovery | Process crashes during checkpoint temp write or restore. | On restart, incomplete temp state is detected; valid history remains readable; recovery instructions identify safe current bytes. |
| P7-12 Concurrency | Two accepted edits/checkpoints race. | Project/history lock serializes them; parent chain is consistent and neither checkpoint overwrites the other. |
| P7-13 Security | Inspect every invoked Git command and run with network disabled. | Only allowlisted local commands occur; no remote URL is contacted and no push/fetch/pull is attempted. |
| P7-14 Integration | Open actual Git diff before/after edit and restore. | Diff matches checkpoint source summary; restore removes only Reframe change and keeps unrelated diff/index state. |
| P7-15 Regression | Perform edit -> checkpoint -> restore -> edit again 20 times. | Hashes/parent links remain valid; no cumulative source drift, duplicate ID, process, or disk-state corruption occurs. |
| P7-16 Cross-environment | Create checkpoints on Windows/CRLF, transfer the repository/history to Linux/LF tooling, and restore without normalizing source unexpectedly. | Patch metadata is portable, original bytes/EOL policy is respected, and user index/worktree state remains correct. |
| P7-17 Performance | Create and restore checkpoints on 1, 10, and 50 small changed files. | One-file demo checkpoint p95 <=2 seconds excluding screenshot; restore verification fits <=10 seconds or times out safely. |

## Expected results

Accepted now means recoverable. Reframe can prove what changed visually and in source, restore it safely, and coexist with normal dirty Git work without performing hidden repository operations.

## Failure conditions

- A history entry is visible before all required artifacts are durable and validated.
- Screenshot success is inferred from file existence only.
- Dirty worktree detection is repository-wide but does not calculate overlap.
- Restore applies against unexpected current hashes.
- User index/staging state is modified.
- A Git reset/commit/push is used as a shortcut.
- Restore failure lacks a safety checkpoint or is labeled successful.

P7-07/P7-11 catch non-atomic history, P7-08 catches weak screenshot validation, P7-04/P7-05 catch dirty-work loss, P7-09 catches stale restore, P7-13 catches prohibited Git behavior, and P7-10 catches false recovery.

## Debugging checklist

- Validate checkpoint schema, parent link, patches, old/new hashes, and screenshot decode.
- Compare HEAD, index, worktree, untracked set, and exact overlap before/after.
- Inspect checkpoint temp/final directories and current history pointer.
- Review Git argument audit for any non-allowlisted command.
- Follow restore transaction: expected-current check, safety checkpoint, apply, HMR verification, recovery.

## Definition of done

Phase 7 is done when every accepted deterministic edit is durably reversible, dirty/no-Git/corrupt/crash scenarios preserve user work, the winning milestone restores exactly, no remote Git behavior exists, and all earlier tests pass.

---

# Phase 8 — Add One AI-Assisted Edit

## Goal

Allow a user to select one exactly mapped card, request "Make this card more visually prominent while preserving the current design," apply a tightly scoped Codex proposal in a temporary review state, and Accept, Refine, Compare, or Reject it safely.

## Why this phase comes at this point

Codex generation must reuse exact mapping, transactional writes, verification, and checkpoints. Adding AI before those controls would make provider output—not Reframe—responsible for repository safety.

## Components to build

- `CodexProvider` abstraction for Local mode and optional rate-limited Demo mode; non-AI features remain independent.
- OS secure-credential integration for local API key and redacted provider diagnostics.
- Minimal Element Context Packet builder, human-readable preview, size budget, and secret/sensitive-file sanitizer.
- Generation runner with progress stages, timeout, Stop, idempotency, and conversation/generation IDs.
- Constrained response/diff schema and validator with expected file allowlist, root containment, prohibited operation checks, and scope expansion review.
- Pre-generation checkpoint, temporary generated-result state, build/browser/accessibility/design warnings, and Accept/Refine/Compare/Reject controls.
- Deterministic fake provider for tests.

### Inputs, outputs, and behavior

| Input | Output | Required behavior |
|---|---|---|
| Exact selected element + instruction | Previewable Element Context Packet | Contains selected/surrounding visual and relevant source/design context only; discloses categories before send |
| Valid provider response | Validated scoped diff | Only root-contained allowlisted relevant files; no packages/routes/backend/auth/external APIs for first request |
| Generated diff applied | Temporary review state | Project reloads and verification is visible; not yet accepted history/current design |
| Accept | Durable checkpoint and screenshots | Final checks pass; changed files/prompt/conversation/Design DNA version are recorded; no push |
| Reject/Stop/failure | Pre-generation state | Partial/generation-owned changes are removed; unrelated concurrent user work is preserved |
| Missing key/provider outage | Clear AI-unavailable state | Direct Edit, Explore, history, and restore remain usable |

## Detailed implementation steps

1. Define a provider-neutral request/response contract and fake provider before connecting a live provider. Keep credentials and transport outside prompt/context code.
2. Store Local-mode credentials only in OS secure storage. Demo mode is optional, clearly labeled/rate-limited, and unavailable mode must not imply account-free AI.
3. Create a pre-generation checkpoint and capture the exact permitted file/range scope derived from server-owned mapping and disclosed related style files.
4. Build the minimal packet: selected/section screenshots, component/semantic role, mapped file/range, bounded source snippet, current classes/computed styles/dimensions, route/viewport, framework/style, relevant errors, approved design rules if available, and separate instruction.
5. Apply ignore/sensitive rules before reading. Block `.env*`, credentials, keys, dumps, ignored secret directories, paths outside root, entire repository inclusion, and unrelated logs/history. Show a readable category/file summary for approval.
6. Send with generation ID/idempotency key and show understandable stages. Implement Stop and a hard provider deadline; never leave an indefinite spinner.
7. Require structured proposed changes/diff. Parse in a sandboxed validator; reject binary changes, path traversal, new dependencies, lockfile changes, backend/auth/routes/external APIs, deletions, unexpected scope, and malformed/truncated patches for the first edit.
8. Re-read/hash-check every target, apply through Phase 6 transactions, and enter temporary review only if the project reloads and verification completes. Do not call the generated result accepted automatically.
9. Accept reruns final build/page/console/responsive/accessibility/scope checks, creates the durable checkpoint/screenshots, and records prompt plus conversation/generation IDs.
10. Reject restores the pre-generation checkpoint. Refine stays in the same conversation/generation lineage but creates a new safe pre-refinement point. Compare uses screenshots, not live Git switching.
11. If the user edits the same file during generation, stop before apply and present the stale conflict. If unrelated files change, preserve them and recompute scope evidence.
12. Keep the first prompt tightly constrained. General generation, conversation picker sophistication, natural-language refactors, variations, and Design Critic remain deferred; Reference Adaptation is deferred specifically to Phase 12, after Design DNA and screenshot-first comparison are reliable.

## Acceptance criteria

- The focused prompt changes only the selected card's relevant styling source and preserves current visual language.
- The packet is inspectable, bounded, relevant, and demonstrably free of canary secrets/unrelated files.
- Missing auth, timeout, rate limit, provider error, malformed response, Stop, stale source, and build failure recover to the exact safe state.
- Disallowed scope cannot be applied, even if the provider proposes it.
- Generated state remains temporary until Accept; Reject restores exact source/browser; Refine preserves lineage; Compare does not mutate source.
- Accept produces a complete Phase 7 checkpoint with prompt, provider conversation/generation ID, changed files, screenshots, and verification.
- Non-AI workflow passes with no key and no provider network.

## Test environment and setup

- Fake provider scenarios: valid diff, streaming chunks, duplicate response, delayed response, timeout, rate limit, auth failure, malformed JSON, truncated patch, path traversal, secret request, new dependency, broad file scope, compile error, and partial cancellation.
- One opt-in live-provider smoke test outside normal PR CI, with strict spend/rate limit and redacted artifacts.
- Canary `.env`, private key, credential JSON, ignored directory, unrelated large files, and prompt-injection-like source comments.
- Network disabled for all non-provider tests; browser/source/Git snapshots around each generation.

## Strict test cases

| ID / type | Test | Expected result |
|---|---|---|
| P8-01 Happy | Fake provider returns a valid CSS/Tailwind emphasis diff for the selected annual card. | Scoped change reloads into temporary review; Accept/Refine/Compare/Reject controls appear; it is not yet in accepted history. |
| P8-02 Happy | Accept a verified generated result. | Final checks pass; one complete checkpoint records prompt, conversation/generation ID, exact changed files, screenshots, and verification. |
| P8-03 Happy | Reject a generated result. | Exact pre-generation bytes and browser return; generation-owned diff disappears; rejection is recorded without an accepted checkpoint. |
| P8-04 Happy | Refine the temporary result in the same conversation. | Follow-up packet includes current result/relevant context; new result has lineage and remains independently rejectable to the correct safe point. |
| P8-05 Privacy | Put canary secrets in `.env`, key files, ignored folders, logs, and unrelated source. | Packet/request/log snapshot contains none of the canaries; packet preview lists exclusions without revealing values. |
| P8-06 Edge/privacy | Disable full-page screenshots, mark a region for blur, and make the optional surrounding screenshot fail. | Packet includes only allowed available visual data, records privacy/capture status, and never silently substitutes an unmasked full-page image. |
| P8-07 Invalid | Provider returns malformed/truncated diff or an edit against the wrong source hash. | Validation fails before write; pre-generation state remains exact and actionable error is shown. |
| P8-08 Security | Provider proposes `../`, absolute/out-of-root files, `.env`, binary, package/lockfile, backend, auth, route, or external API changes. | Entire proposal is blocked with categorized scope violations; no proposed file is written. |
| P8-09 Security | Source snippet contains instructions asking the agent to reveal secrets or broaden scope. | Source is treated as untrusted project context; sanitizer/scope validator still excludes secrets and disallowed files. |
| P8-10 Failure/recovery | No key, invalid key, Demo mode unavailable, or provider rate limit. | AI panel explains the state/retry path; no source changes; all non-AI controls still pass their smoke suite. |
| P8-11 Failure/recovery | Provider times out or connection drops mid-stream. | Hard deadline/Stop terminates the run; no partial diff applies; pre-generation checkpoint remains available. |
| P8-12 Failure/recovery | User presses Stop after one file was transactionally staged/applied. | Generation runner rolls back generation-owned files, verifies recovery, preserves unrelated work, and reports final state. |
| P8-13 Failure/recovery | Valid diff causes build, route, console, severe overflow, or unexpected-scope failure. | Result cannot be accepted; warning/block policy is explicit; Reject/rollback restores safe state. |
| P8-14 Concurrency | User edits target source during provider latency. | Apply detects stale hash and stops; user's edit remains; provider output is offered only for manual rebase/retry. |
| P8-15 Concurrency | Duplicate/retried provider response arrives with same generation ID. | Idempotency logic applies at most once and creates at most one review state/checkpoint. |
| P8-16 Integration | Complete select -> Generate -> packet preview -> temporary change -> Compare -> Reject. | Compare uses before/current screenshots without switching source; Reject returns exact source/browser. |
| P8-17 Regression | Run the entire non-AI milestone with provider/network disabled. | CLI, detection, toolbar, selection, Direct Edit, checkpoint, and restore remain fully operational. |
| P8-18 Cross-framework | Run focused edit on Vanilla CSS, React plain CSS, CSS Modules, and Tailwind fixtures. | Provider context/style constraints match each framework; only supported relevant files change; unsupported TypeScript blocks write. |
| P8-19 Performance | Build/sanitize packet from demo and a large-noise fixture; measure local validation/apply. | Packet build+sanitize p95 <=2 seconds, packet stays under configured size (recommended 256 KB excluding images), local validation <=1 second, provider deadline is finite/configurable. |

## Expected results

Codex is an optional, bounded proposal generator behind Reframe's safety system. A focused visual change can be generated and reviewed without sending the repository, touching disallowed files, losing user work, or making the non-AI product dependent on provider availability.

## Failure conditions

- API key is stored in the project, plain config, command arguments, or logs.
- Entire repository or secret/ignored files are included by default.
- Provider prose/patch is trusted without schema, path, hash, and scope validation.
- Generated files are called accepted before user action and final verification.
- Stop/timeout leaves partial changes or an indeterminate state.
- Retry applies duplicate diffs/checkpoints.
- Build/console/scope failures are hidden.
- AI outage disables Direct Edit/Explore/history.

P8-05/P8-09 detect context leakage, P8-08 detects provider authority over scope, P8-11/P8-12 detect partial-generation recovery, P8-15 detects missing idempotency, P8-13 detects weak review gates, and P8-17 detects coupling of AI to the core product.

## Debugging checklist

- Inspect generation ID, conversation lineage, provider mode, deadline, and redacted stage history.
- Review packet manifest/categories and run canary-secret scan on serialized request/log artifacts.
- Compare planned/actual changed-file sets and expected/current hashes.
- Validate every proposed path and operation against the Phase 8 allowlist.
- Trace pre-generation checkpoint, apply transactions, verification findings, and final Accept/Reject state.
- Confirm provider failure did not disable or mutate non-AI subsystems.

## Definition of done

Phase 8 is done when the focused AI edit passes privacy, scope, invalid-output, cancellation, concurrency, recovery, cross-framework, and optional-auth tests; Accept and Reject are exact and reversible; and the complete non-AI path remains green without a provider.

---

# Phase 9 — Add Basic Design DNA

## Goal

Generate a small, evidence-based, human-reviewable design contract; persist it only with permission; preserve existing `AGENTS.md`; and provide only approved relevant rules to later AI requests.

## Why this phase comes at this point

The roadmap intentionally delays Design DNA until source edits, restore, and one Codex edit are proven. This prevents analysis complexity and uncertain design inference from blocking the core workflow or becoming an unreviewed source of truth.

## Components to build

- Bounded analyzer for main colors, font families, common font sizes, common spacing, border radii, Tailwind theme values, and reusable React component names.
- Versioned schemas for `DESIGN.md`, `tokens.json`, `components.json`, and `fingerprint.json` with value, source evidence, confidence, frequency, and approval status.
- Permission-first setup and limited preview mode.
- Review UI for Correct, Incorrect, Intentional exception, Deprecated, and Needs review.
- Idempotent, clearly delimited `AGENTS.md` Design System section updater that preserves all unrelated content.
- Prompt-context selector that includes approved/relevant rules, not the entire Design DNA.
- Lightweight fingerprint/status foundation; full drift detection and automatic updates remain deferred.

### Inputs, outputs, and behavior

| Input | Output | Required behavior |
|---|---|---|
| Supported project styles/components | Proposed design findings | Each finding has type/value/evidence/confidence/frequency; one-offs are not global rules |
| User grants write permission | Atomic `.reframe/design-dna/*` files | Human and structured files agree and are versioned |
| Existing `AGENTS.md` | Same file plus delimited Design System section | Existing commands/instructions/formatting remain intact; rerun is idempotent |
| User denies/skips permission | In-memory preview/limited mode | No Design DNA, history, or `AGENTS.md` file is silently written |
| AI context request | Minimal approved rule subset | Relevant colors/spacing/components/rules only, with version ID |

## Detailed implementation steps

1. Define schemas and approval states before analysis. Store source-relative evidence and confidence; never store an inferred rule without its evidence/status.
2. Ask permission before writing Design DNA, history metadata for analysis, screenshots, or `AGENTS.md`. Allow the user to preview findings and continue editing without approval.
3. Limit scanning to canonical project root and relevant source/config files. Honor ignore rules and sensitive-file exclusions; skip dependencies, build output, history, credentials, and unrelated data.
4. Parse CSS variables/declarations, Tailwind configuration, font imports, spacing/radius occurrences, and React component declarations/usages structurally. Normalize values without losing raw value/source.
5. Require frequency/semantic evidence before proposing a common token. Label conflicts and one-off values rather than promoting them globally.
6. Produce the four files atomically as one Design DNA version. `DESIGN.md` is human-editable; JSON remains the machine contract and references the version/fingerprint.
7. Build review controls and persist user approval/rejection without deleting evidence. Rejected/exception values do not become AI defaults.
8. If `AGENTS.md` exists, insert/update one delimited section that references actual Design DNA paths. Preserve unrelated bytes as much as possible; if no file exists, create one only with explicit permission.
9. Add relevant approved Design DNA rules to the Phase 8 packet and record the DNA version on accepted checkpoints.
10. Compute a fingerprint and status but do not implement full drift difference review. External changes set `May be outdated`; they never silently rewrite DNA or block normal editing.
11. Analyze the official demo ahead of the demonstration and commit/provide its approved pre-generated DNA so startup is immediate, while keeping re-analysis testable.

## Acceptance criteria

- All seven initial categories are detected with evidence and confidence in Vanilla and relevant React fixtures.
- One-off/conflicting values are not presented as confirmed global rules.
- User can review/correct/disable findings and resulting files remain schema-consistent.
- Denying permission results in zero project writes and does not block Design Mode.
- Existing `AGENTS.md` content is preserved exactly outside the delimited section; reruns create no duplicate section.
- AI packet receives only approved, relevant rules and generated emphasis uses existing design values in the fake-provider test.
- Typical demo analysis completes within approximately 30 seconds and optional/background analysis never blocks editing.

## Test environment and setup

- Fixtures containing CSS variables, literal duplicates, Tailwind theme extensions, imported fonts, shared/reused React components, one-off outliers, conflicting page styles, malformed CSS/config, existing/no `AGENTS.md`, secrets/ignored files, and large generated noise.
- Golden structured output with normalized paths/order; manual-review state tests use a temporary DNA version.
- Canary unrelated `AGENTS.md` content/commands and secret files.

## Strict test cases

| ID / type | Test | Expected result |
|---|---|---|
| P9-01 Happy | Analyze Vanilla with repeated colors, fonts, sizes, spacing, and radii. | Proposed tokens contain normalized/raw values, count, source evidence, confidence, and unconfirmed status. |
| P9-02 Happy | Analyze React/Tailwind theme plus reusable components. | Theme values and component names/usages are recorded; generated/build/dependency files are excluded. |
| P9-03 Happy | Approve selected findings and write DNA. | Four schema-valid, version-consistent files are atomically created; human summary matches structured approved values. |
| P9-04 Edge | Project has one bright color used once and conflicting radius patterns. | Color is a one-off/exception candidate, not a global approved token; conflict is visible with evidence. |
| P9-05 Edge | User marks a detected rule Incorrect, exception, or Deprecated. | Status/evidence persist; rule is excluded or scoped correctly from default AI context. |
| P9-06 Permission | Deny all first-run write permissions. | No `.reframe`, screenshot, history, or `AGENTS.md` change occurs; preview editing remains usable. |
| P9-07 Integrity | Update an existing `AGENTS.md` containing commands and unrelated instructions, then rerun twice. | Only one delimited section exists; all outside content is byte-identical and paths are correct. |
| P9-08 Invalid | Malformed CSS, Tailwind config, or partially unreadable source. | Analyzer reports file-scoped findings/errors, continues safe files, marks analysis incomplete, and writes nothing corrupt. |
| P9-09 Security | Place canary secrets in ignored/env/key files and symlink an apparent style file outside root. | Analyzer never reads/records canaries; outside symlink is rejected; logs remain redacted. |
| P9-10 Failure/recovery | Fail one DNA file write or final directory rename. | No partial version becomes current; prior version remains intact; retry is offered. |
| P9-11 Integration | Build a Phase 8 packet for the annual card after approvals. | Packet includes only relevant approved colors/spacing/components/rules and the correct DNA version, not rejected/unrelated rules. |
| P9-12 Integration | Fake provider proposes an unrelated color despite Preserve current design. | Design conflict is flagged before Accept; policy requires correction/explicit exception and DNA is not auto-updated. |
| P9-13 Regression | Modify project styles outside Reframe after DNA generation and restart. | Status becomes `May be outdated`; DNA files are not silently rewritten and editing is not blocked. |
| P9-14 Cross-framework | Analyze plain CSS, CSS Modules, Tailwind, Vanilla, and unsupported TypeScript/Vue fixtures. | Supported style evidence is correct; unsupported fixtures get analysis/preview-only capability without source-edit claims. |
| P9-15 Performance | Analyze demo and a large fixture while interacting with selection. | Demo completes <=30 seconds; UI remains responsive; large analysis is incremental/cancellable and does not run on every save. |

## Expected results

Design DNA becomes a reviewable contract backed by source evidence, not an unquestioned generated summary. It improves scoped AI edits without changing the existing design or repository guidance silently.

## Failure conditions

- First run scans/writes immediately without consent.
- A single occurrence becomes a global token/rule.
- Confidence/evidence and user approval are missing.
- `AGENTS.md` is replaced, reformatted wholesale, or duplicated.
- Ignored/secrets/out-of-root files are analyzed.
- DNA updates automatically on drift or blocks editing.
- Full DNA is added to every prompt regardless of relevance.

P9-06 detects silent setup writes, P9-04 detects overgeneralization, P9-07 detects destructive `AGENTS.md` handling, P9-09 detects scope/privacy failure, P9-13 detects silent drift rewrite, and P9-11 detects bloated/unapproved prompt context.

## Debugging checklist

- Inspect scan allowlist/ignore decisions and canonical paths.
- Trace a finding from raw value through normalization, frequency, evidence, confidence, and approval.
- Validate all files against the same DNA version/fingerprint.
- Diff `AGENTS.md` outside the generated markers.
- Inspect packet rule selection and ensure rejected/deprecated items are excluded.
- Check background job cancellation/debounce and last completed fingerprint.

## Definition of done

Phase 9 is done when permission, analysis, review, persistence, `AGENTS.md` preservation, AI-context selection, stale status, privacy, and 30-second demo budget all pass with no full drift feature smuggled into scope.

---

# Phase 10 — Add the Visual Time Machine

## Goal

Provide an immediate screenshot-first previous/current comparison with a hold control and basic history list, then reuse the proven Phase 7 restore path when the user explicitly restores.

## Why this phase comes at this point

The interaction depends on complete checkpoints, screenshots, route/viewport metadata, and safe restoration. Screenshot comparison is intentionally used instead of switching the live worktree while the user hovers or holds.

## Components to build

- Floating `Hold to view previous` control.
- Pointer/keyboard/touch hold state machine and previous screenshot overlay.
- Route/viewport/checkpoint matching and visible mismatch labels.
- Basic valid-checkpoint history list with Previous/Current labels, changed files, prompt summary, verification status, and Restore.
- Screenshot decoder/cache, privacy-mask/retention integration, and missing/corrupt fallback.
- Restore action adapter to Phase 7; comparison itself has no source/Git mutation.

### Inputs, outputs, and behavior

| Input | Output | Required behavior |
|---|---|---|
| Hold pointer/key on history control | Previous screenshot overlay | Source, server, route, and live page state do not change |
| Release/cancel/Escape/window blur | Current live page | Overlay disappears immediately and all input capture is released |
| Click control | Basic history list | Only valid checkpoints; clear route/viewport/verification metadata |
| Restore selection | Phase 7 restore confirmation/transaction | Safety checkpoint and overlap checks occur before any source change |
| Missing/corrupt/mismatched screenshot | Explicit unavailable/mismatch state | Never show a misleading image as an exact comparison |

## Detailed implementation steps

1. Extend checkpoint reading to expose validated screenshot descriptors, route, viewport, timestamp, prompt summary, file summary, and verification state.
2. Select the nearest previous valid checkpoint for the current route and compatible viewport. If none matches exactly, require a labeled mismatch choice rather than silently stretching another route.
3. Preload/decode only the immediate prior screenshot after idle; do not capture or scan full history on every hover.
4. Implement hold with pointer capture plus keyboard-accessible press/release. Release on pointerup, pointercancel, Escape, lost capture, visibility change, window blur, and component teardown.
5. Render screenshot in a Reframe-owned overlay with clear `Previous` label and aspect-fit behavior. It must not intercept the live worktree or trigger dev-server rebuilds.
6. On click (not hold), open the basic list and show invalid/corrupt entries as unavailable rather than dropping evidence silently.
7. Route Restore through the exact Phase 7 confirmation, dirty-overlap check, safety checkpoint, restore, HMR, and verification flow.
8. Honor screenshot retention, component-only mode, exclusions, and blur metadata; never reconstruct unrecorded private regions.

## Acceptance criteria

- Hold reveals the correct prior screenshot and release always returns to the unchanged live page.
- Comparison performs zero source writes, Git operations, upstream restarts, and route changes.
- Route/viewport mismatch, missing image, corruption, and privacy masking are accurately labeled.
- Basic history list exposes checkpoint order, file/prompt summary, and verification state.
- Restore from the list is identical in safety to Phase 7 and creates a safety checkpoint.
- Control remains usable during scroll, near viewport edges, on keyboard, and after HMR.
- Overlay interaction stays responsive and does not decode the entire history eagerly.

## Test environment and setup

- History fixtures with same/different routes, mobile/tablet/desktop viewports, missing/corrupt/truncated images, privacy masks, failed verification, and 100+ checkpoints.
- Source/Git/process spies assert comparison is read-only.
- Playwright pointer, touch emulation, keyboard, window blur, scroll, and HMR.

## Strict test cases

| ID / type | Test | Expected result |
|---|---|---|
| P10-01 Happy | Hold the control after two accepted edits. | Exact previous screenshot appears labeled Previous; releasing shows unchanged current live page. |
| P10-02 Happy | Click the control and inspect history. | Valid checkpoints appear in deterministic parent/time order with route, viewport, files, prompt, and verification. |
| P10-03 Integration | Select Restore Previous from history. | Phase 7 confirmation/safety checkpoint/restore/verification execute; source/browser restore exactly. |
| P10-04 Edge | Current route has no prior screenshot but another route does. | UI reports no exact route match or offers a clearly labeled mismatch; it never presents the other route as exact previous. |
| P10-05 Edge | Viewport/aspect ratio differs. | Mismatch is labeled with both dimensions; image is aspect-fit and not misrepresented as pixel-perfect. |
| P10-06 Invalid | Screenshot is missing, truncated, wrong format, or hash-mismatched. | Entry is unavailable/corrupt; overlay does not show broken/stale content; restore source can still use valid checkpoint data. |
| P10-07 Failure/recovery | Pointer leaves window, pointer capture is lost, tab hides, or window blurs while holding. | Overlay closes and control state resets without requiring another click. |
| P10-08 Failure/recovery | HMR replaces the page/client while overlay is visible. | Old overlay/listeners are removed; remounted UI returns to current state and can compare again. |
| P10-09 Security/privacy | Previous screenshot has blurred/excluded regions or component-only mode. | Overlay honors stored privacy result and does not fetch/display a full unmasked alternative. |
| P10-10 Read-only | Audit filesystem, Git invocations, upstream PID, route, and live DOM state during 100 holds. | All remain unchanged except Reframe overlay/cache state; no rebuild or Git command occurs. |
| P10-11 Accessibility | Operate hold/list/close using keyboard and screen reader roles. | Focus is visible, labels/state are announced, Escape closes, and focus returns to trigger. |
| P10-12 Regression | Compare after scroll, route navigation, restore, and new checkpoint. | Correct checkpoint is selected each time; no stale cached image or duplicate control appears. |
| P10-13 Cross-browser | Run pointer hold/release, keyboard compare, blur cancellation, and history list in Chromium, Firefox, and WebKit. | The overlay state machine and accessibility behavior are functionally equivalent; no browser leaves a stuck overlay. |
| P10-14 Performance | Open history with 100 checkpoints and hold repeatedly. | Immediate prior overlay appears <=150 ms p95 after preload; list initial render <=500 ms; memory cache is bounded. |

## Expected results

Visual history feels immediate while remaining honest and read-only. Source changes occur only when the user selects Restore, at which point all existing restore safeguards apply.

## Failure conditions

- Hold switches Git/source versions or restarts the project.
- Wrong route/viewport screenshot is displayed without warning.
- Pointer cancellation leaves the previous overlay stuck.
- Corrupt images are silently skipped or presented as valid.
- Entire history is decoded on startup/hover.
- Restore bypasses dirty-work or safety-checkpoint checks.

P10-10 detects source-switch shortcuts, P10-04/P10-05 detect misleading comparisons, P10-07 detects stuck interaction, P10-06 detects weak image validation, P10-14 detects eager history work, and P10-03 ensures restore reuse.

## Debugging checklist

- Inspect current route/viewport and chosen checkpoint descriptor/hash.
- Check image decode/preload/cache state and privacy metadata.
- Trace hold state events including lost capture/blur/visibility/HMR teardown.
- Verify zero filesystem/Git/upstream events during comparison.
- For restore issues, use the Phase 7 transaction/checkpoint checklist.

## Definition of done

Phase 10 is done when screenshot comparison is fast, accessible, mismatch-aware, privacy-preserving, and provably read-only; history restore still passes every Phase 7 safety and recovery test.

---

# Phase 11 — Add Async Comments

## Goal

Add local, Git-synchronized Pin, Comment, Highlight, Resolve, and Reopen workflows anchored to stable source/component identity, with one annotation JSON file per discussion and no accounts, cloud backend, real-time presence, or application-source changes.

## Why this phase comes at this point

Comments are trustworthy only after element/source anchors survive selection, HMR, edits, checkpoints, and restore. One-file-per-annotation storage is added last so collaboration metadata cannot distract from or destabilize the core editor.

## Components to build

- Versioned annotation schema/store and atomic one-file writer.
- Stable anchor composed from component name, source-relative file/range, source mapping/fingerprint, route, viewport, and optional local highlight geometry.
- Pin/highlight renderer isolated from application UI.
- Comment editor with plain-text sanitization, author label, timestamp, replies (if included in minimal schema), Resolve, and Reopen.
- Anchor resolver after startup, HMR, source edits, route changes, checkpoint views, and Git pull.
- Orphan/conflict review state; unmapped annotations remain preserved but are not drawn as if exact.
- Filesystem watcher for annotation changes; Git remains the only synchronization mechanism.

### Inputs, outputs, and behavior

| Input | Output | Required behavior |
|---|---|---|
| Exact selected element + comment/highlight | One atomic annotation JSON file | Application source and other annotations remain unchanged |
| Startup/Git-pulled annotation files | Pins/highlights for valid current route anchors | Invalid/orphaned/conflicted entries are preserved and shown for review, not guessed onto elements |
| Resolve/Reopen | Update to that annotation file only | Status/timestamp change is durable and survives restart/Git operations |
| Source/checkpoint change | Re-resolved anchor/status | Stable source identity leads; screen coordinates are only local geometry |
| Malformed/untrusted comment text | Safe validation/rendering | No script/HTML execution, traversal, or arbitrary file write |

## Detailed implementation steps

1. Define the annotation schema: version, UUID, author, timestamps, component, stable element fingerprint, source-relative file/range, route, viewport, comment/replies, highlight geometry, status, related checkpoint, related Design DNA version, and anchor confidence.
2. Require exact/probable source-aware anchoring for persistent pins. Coordinates alone can support a temporary draft but cannot be saved as a trusted resolved annotation.
3. Create one file per annotation with an exclusive create/atomic replace strategy. Never rewrite a combined database file or application source.
4. Render text as text, validate lengths/types/enums, reject executable markup and unsafe URLs, and keep overlays inside Reframe's isolated UI.
5. On startup/file-watch events, parse each file independently. A malformed/conflicted file cannot prevent valid annotations from loading.
6. Resolve anchors against current metadata and route. If component/source moved, use explicit evidence and lower confidence; if not safe, mark Orphaned/Needs review and do not place it by guessed coordinates.
7. Resolve/Reopen updates only the matching annotation file and preserves thread/history/checkpoint linkage.
8. Watch `.reframe/annotations` for normal Git pull/checkout changes with debounce and atomic-write awareness. Do not run Git pull/push automatically.
9. When viewing a checkpoint, filter/label annotations by related checkpoint/time. Promoting a comment to Design DNA requires a separate explicit Phase 9 review/write action.
10. Add conflict UI for duplicate IDs, JSON conflict markers, concurrent edits, deleted components, and schema-version incompatibility.

## Acceptance criteria

- User can create, reload, resolve, and reopen a source-anchored pin/comment/highlight.
- Each action changes only one annotation file and never application source.
- Valid annotations survive restart and normal Git add/commit/pull/checkout workflows without Reframe performing them.
- Source movement/removal, invalid mapping, malformed JSON, merge conflict, duplicate ID, and old schema are visible and never silently mis-anchored or lost.
- Comment content is safely rendered and storage paths remain inside `.reframe/annotations`.
- Route/checkpoint filtering is accurate and avoids displaying irrelevant annotations as current.
- No account, cloud, real-time cursor, presence, or synchronization server is required.

## Test environment and setup

- Fixture copies with exact anchors, moved components, deleted nodes, repeated list items, route variants, old checkpoints, malformed JSON, conflict markers, duplicate UUIDs, legacy schema, read-only annotation directory, and 1,000 annotations.
- Two independent fixture clones simulate Git synchronization; Git operations are performed by the test harness/user workflow, never Reframe.
- XSS/canary payloads and path traversal IDs/file fields.
- Full source snapshot plus annotation-level file diff after every operation.

## Strict test cases

| ID / type | Test | Expected result |
|---|---|---|
| P11-01 Happy | Select mapped annual card, add pin/comment/highlight, restart Reframe. | One schema-valid file is created; annotation reappears on the correct card/route with exact anchor. |
| P11-02 Happy | Resolve then reopen a discussion. | Only that annotation file changes status/timestamps; state survives restart and thread content remains intact. |
| P11-03 Integration | Commit annotation in clone A, pull in clone B, start/watch Reframe. | Clone B loads and anchors it after filesystem change; no Reframe push/pull/account/backend is involved. |
| P11-04 Edge | Source file moves but component/fingerprint maps with explicit high-confidence evidence. | Annotation relocates with updated evidence/history and does not rely on old screen coordinates. |
| P11-05 Edge | Component is deleted or repeated items are indistinguishable. | Annotation is preserved as Orphaned/Ambiguous for review and is not drawn on a guessed element. |
| P11-06 Invalid | JSON is malformed, contains Git conflict markers, wrong schema types, or unsupported version. | That file is quarantined/reported; all other valid annotations load and none are deleted. |
| P11-07 Invalid | Duplicate annotation IDs arrive in two files. | Conflict is surfaced with both filenames; neither silently overwrites the other. |
| P11-08 Security | Comment contains script tags, event attributes, Markdown links with unsafe protocols, or huge text. | Content is escaped/sanitized and length-limited; no script/navigation executes and validation error is clear. |
| P11-09 Security | Annotation ID/source fields attempt traversal, absolute path, symlink escape, or device name. | Store/resolver rejects unsafe paths before read/write; only the annotation directory is accessible. |
| P11-10 Failure/recovery | Annotation directory is read-only/disk-full or process crashes during write. | No partial valid-looking file appears; draft remains in UI/retry state; application source/history are unchanged. |
| P11-11 Concurrency | Two users create annotations simultaneously and edit different existing files. | UUIDs/files do not collide; independent files merge naturally; watcher loads both once. |
| P11-12 Concurrency | Two users edit the same annotation and Git leaves conflict markers. | Reframe flags a collaboration conflict, preserves both sides in the file, and never auto-resolves. |
| P11-13 Checkpoint | View current and older checkpoints with annotations created at different points. | UI filters/labels annotations by checkpoint relationship and never changes current source during viewing. |
| P11-14 Design DNA | Promote comment to a rule. | Separate confirmation/review creates a scoped DNA proposal/version; annotation alone does not rewrite DNA. |
| P11-15 Regression | Create/resolve/reopen annotations while Direct Edit, HMR, restore, and history comparison run. | Anchors refresh correctly; no duplicate pins, lost comments, blocked edits, or application-source diff occurs. |
| P11-16 Cross-environment | Commit annotation files on Windows, pull/read/update them on Linux, then return them to Windows. | UTF-8 JSON, IDs, timestamps, paths, and anchors remain valid; watcher behavior and source-relative paths are portable. |
| P11-17 Performance | Load 1,000 annotations across many routes and process a 100-file Git pull burst. | Initial parse/index p95 <=1 second on CI demo hardware, current-route rendering is bounded, watcher coalesces events without missed final state. |

## Expected results

Reframe supports durable asynchronous review attached to real source identity while remaining local-first and Git-native. Bad or stale collaboration data degrades per annotation and never modifies the application or invents an anchor.

## Failure conditions

- Coordinates are the sole persistent anchor.
- All annotations share one merge-prone file.
- One corrupt/conflicted file prevents all comments from loading.
- Comment content is inserted as HTML.
- File paths or IDs escape the annotation directory.
- Resolve/Reopen rewrites unrelated files or source.
- Reframe automatically pulls/pushes or requires accounts/presence.
- Orphaned comments are silently dropped or placed on a guess.

P11-04/P11-05 detect coordinate-only/guessed anchors, P11-06 detects all-or-nothing parsing, P11-08/P11-09 detect content/path attacks, P11-02/source snapshots detect broad writes, P11-03 verifies Git-only synchronization, and P11-12 verifies conflicts are disclosed.

## Debugging checklist

- Validate annotation ID/schema/version and canonical storage path.
- Inspect component/source/fingerprint evidence, route, checkpoint, and anchor confidence.
- Check watcher debounce/atomic-rename handling and duplicate load counts.
- Diff only the expected annotation file and verify application source hashes.
- Review HTML/text escaping and unsafe-protocol filtering.
- For Git conflicts, preserve the raw file and show both sides; do not auto-resolve.

## Definition of done

Phase 11 is done when annotations survive restart and Git synchronization, remain source-anchored and secure, isolate malformed/conflicted entries, change no application source, and coexist with the entire Phase 0–10 regression suite.

---

# Phase 12 — Add Reference Adaptation

## Goal

Let a user provide an approved visual or written reference, choose exactly which characteristics to borrow, choose how strongly to preserve the project's brand, review an explicit adaptation plan, and generate a reversible source change that reuses the project's real components and Design DNA rather than cloning the reference.

## Why this phase comes at this point

`spec/phasing.md` says not to prioritize Reference Adaptation during the core build, but `reframe-spec.md` §26 defines it, §41 includes it in the demonstration, and §42 makes brand-preserving adaptation a functional acceptance criterion. It therefore follows the roadmap's named phases as a full-spec release gate. It depends on exact source mapping and safe writes from Phase 6, checkpoints from Phase 7, constrained Codex review from Phase 8, approved Design DNA from Phase 9, and screenshot-first Compare from Phase 10. Phase 11 is not a technical dependency, but Phase 12 remains last so it cannot displace the core or already scheduled post-core work.

## Components to build

- Reference intake adapters for screenshot, Figma export, hand-drawn mockup, another-site screenshot supplied by the user, Markdown design specification, and approved project reference stored in Design DNA.
- File/type/size validator, metadata stripper, canonical local store, retention controls, and explicit persistence consent.
- Reference normalizer producing a versioned, source-agnostic `ReferenceDescriptor` without executable content.
- Evidence-based analyzer for page structure, component arrangement, colors, typography, interaction clues, content density, navigation pattern, and responsive clues; unavailable characteristics remain Unknown rather than inferred.
- Controlled-borrowing UI with independent choices for each characteristic.
- Brand-treatment control: Preserve this project's Design DNA (default), Blend both designs, or Follow the reference closely.
- Adaptation-plan review showing what will be borrowed, what will be preserved, reusable project components, required new components, placement/scope, responsive assumptions, and possible Design DNA proposals.
- Reference-aware extension to the Element/Page Context Packet and Phase 8 generation runner.
- Reference asset/text/branding copy guard, Design DNA conflict detector, responsive verifier, and visual/source comparison.
- Checkpoint/history metadata containing reference ID, approved borrowing choices, brand treatment, and verification evidence.

### Inputs, outputs, and behavior

| Input | Output | Required behavior |
|---|---|---|
| Supported user-supplied reference | Sanitized `ReferenceDescriptor` | Original executable metadata/content is never run; type, size, hash, consent, and provenance are recorded |
| Borrowing choices + brand treatment | Reviewable `AdaptationPlan` | Selected characteristics, preserved characteristics, placement, reuse/new-component scope, uncertainty, and expected files are explicit |
| Preserve Design DNA + reference layout | Scoped Codex proposal | Project colors, typography, spacing, buttons, cards, and reusable components remain authoritative while selected layout traits may change |
| Blend/Follow closely | Proposal plus design-rule conflicts | New tokens/patterns remain proposals requiring review; Design DNA is never rewritten automatically |
| Accept | Verified source change and complete checkpoint | Reference/plan IDs, files, screenshots, responsive results, conflicts, and user approval are recorded |
| Reject, Stop, failure, or stale source | Pre-adaptation state | Exact source/browser recovery through Phase 7/8; unrelated work and stored reference retention choice are preserved |

## Detailed implementation steps

1. Define a versioned `ReferenceDescriptor` with ID, media/spec type, MIME/format, content hash, dimensions/pages, sanitized local path or approved DNA reference ID, provenance supplied by the user, consent/retention state, and analyzer status. It must never contain executable markup or remote credentials.
2. Add adapters for the six §26 input categories. Normalize raster/vector/document exports into bounded visual pages plus safe textual metadata. Treat an another-site reference as a user-supplied screenshot; do not crawl, authenticate to, or attach Reframe to an arbitrary site.
3. Validate magic bytes and parser output rather than trusting extension/MIME. Reject active SVG/script, macros, archive bombs, path traversal, password-protected/unsupported documents, excessive dimensions/pages, and malformed Figma exports. Strip EXIF, embedded URLs, comments, and unrelated metadata before provider use or persistence.
4. Ask before copying a reference into `.reframe/references`. If permission is denied, use a temporary in-memory/OS-temp copy for the current session and remove it on exit. Apply screenshot privacy and retention settings to reference assets too.
5. Analyze only observable evidence. A static screenshot may support layout, color, typography, density, and navigation clues, but interaction/responsive behavior must be Unknown unless the supplied export/spec provides evidence. Show confidence and evidence for every proposed characteristic.
6. Require the user to select borrowing categories: page structure, component arrangement, colors, typography, interaction behavior, content density, navigation pattern, and responsive behavior. None are implicitly selected merely because a reference was attached.
7. Default brand treatment to Preserve this project's Design DNA. Load only approved relevant DNA and components. Blend/Follow closely must show that new design proposals may be created and require explicit confirmation.
8. Build an `AdaptationPlan` before generation: target element/page/route and placement; borrowed/preserved categories; current reusable components/tokens; likely new components; expected files; responsive assumptions; content/assets that must not be copied; uncertainties; and verification plan. User approval freezes the plan/hash for the generation.
9. Extend the Phase 8 packet with the sanitized descriptor, selected reference views/spec excerpts, evidence summary, frozen adaptation plan, relevant approved DNA, target source context, and separate user instruction. Do not send the raw project, original metadata, unrelated reference pages, or reference content the user did not select.
10. Constrain the provider to project architecture and the approved plan. Block literal transfer of reference logos, brand names, protected copy, tracking IDs, remote asset URLs, embedded code, and proprietary assets unless the user separately supplies rights and explicitly requests the specific asset.
11. Validate the proposed diff through Phase 8 plus plan-specific checks: expected file scope, selected characteristics only, reuse of existing components/tokens, no unapproved token/DNA mutation, no copied content/assets, and no unrelated page/framework/backend changes.
12. Apply into temporary review state and verify source/build/console/accessibility plus representative mobile, tablet, and desktop views. Compare reference-to-result only for selected characteristics and compare before-to-result for preserved brand characteristics. A static reference cannot be used as proof of responsive or interaction equivalence.
13. Show Accept, Refine, Compare, and Reject. Accept creates a complete checkpoint with the reference descriptor/plan IDs and conflict decisions; Refine keeps the same frozen choices unless the user explicitly revises the plan; Reject restores the pre-adaptation checkpoint.
14. If the result introduces a potentially useful new token/pattern, create a Design DNA proposal for separate Phase 9 review. Never treat one adaptation as an automatic global rule.
15. Add one synthetic, licensed screenshot-based preserve-brand demonstration to the official demo. The other supported adapters must pass normalization and planning tests even if they are not all shown live.

## Acceptance criteria

- Every §26 reference category is normalized safely or rejected with a precise supported-format reason; no parser executes active content or performs an implicit network fetch.
- The user must explicitly choose borrowing characteristics and brand treatment; Preserve Design DNA is the default.
- Before generation, the UI shows a complete, hash-frozen plan of borrowed/preserved traits, placement, component reuse/new scope, expected files, uncertainty, and prohibited copying.
- In the official preserve-brand test, the result demonstrably borrows selected structure/arrangement while retaining approved project colors, typography, spacing, cards, and buttons.
- Unselected characteristics, literal branding/copy/assets, disallowed files, unrelated routes, and automatic Design DNA changes are blocked.
- Static references never fabricate interaction or responsive evidence; cross-viewport behavior is verified against the generated project, not assumed from the image.
- Accept, Refine, Compare, Stop, timeout, stale source, invalid diff, verification failure, and Reject retain all Phase 7/8 safety and recovery guarantees.
- A complete accepted checkpoint records reference provenance/hash, selected traits, brand treatment, adaptation-plan hash, source/visual diffs, responsive results, DNA version/conflicts, and verification.
- The §41 demonstration can show Reference Adaptation after Visual Time Machine, and the §42 brand-preservation acceptance statement is backed by an automated E2E assertion rather than narration alone.

## Test environment and setup

- Synthetic, licensed fixtures for: product-dashboard screenshot, another-brand screenshot containing canary logo/text/assets, low-resolution hand sketch, Markdown design specification, approved Design DNA reference, and supported Figma export variants.
- Malformed/hostile inputs: spoofed MIME, active SVG, embedded scripts/URLs, EXIF canaries, oversized/decompression-bomb images, huge multipage documents, password-protected files, corrupt exports, symlink/path traversal, and unsupported formats.
- Target copies for React/Tailwind, React/plain CSS, CSS Modules, Vanilla, unsupported TypeScript, mobile overflow, shared components, dirty Git, stale source, build failure, and provider failure.
- Fake reference analyzer/provider with deterministic evidence and diffs; one optional live-provider smoke test uses only synthetic assets.
- Golden adaptation plans, packet manifests, exact changed-file sets, source diffs, DNA-token snapshots, and mobile/tablet/desktop screenshots.

## Strict test cases

| ID / type | Test | Expected result |
|---|---|---|
| P12-01 Happy | Attach a dashboard screenshot, select only Page structure and Component arrangement, keep Preserve Design DNA, and target the current page. | Plan names borrowed structure/arrangement and preserved brand traits; generated review reuses project components/tokens and contains no reference colors, fonts, copy, logos, or assets. |
| P12-02 Happy | Attach a Markdown design specification and select Content density plus Navigation pattern. | Only relevant sanitized sections enter the packet; proposal changes density/navigation within disclosed files and preserves unselected design traits. |
| P12-03 Happy | Choose an approved project reference already recorded in Design DNA. | Descriptor references the approved local ID/version without duplicating the asset; plan/provider receive only selected characteristics and current approved DNA. |
| P12-04 Edge | Use a low-resolution hand-drawn mockup with uncertain text and no responsive evidence. | Analyzer labels ambiguous text/geometry and responsive/interaction as Unknown; plan requires confirmation and does not invent those behaviors. |
| P12-05 Edge | Supply a valid very large image or multipage export near configured limits. | Intake downscales/pages selectively within explicit limits, records the transformation, stays within packet budget, and never silently drops selected evidence. |
| P12-06 Invalid | Supply spoofed MIME, corrupt Figma export, password-protected document, unsupported format, active SVG, or decompression bomb. | Validation rejects before persistence/analysis/provider call with a safe specific code; no executable content, partial source change, or leaked temp file remains. |
| P12-07 Invalid | Click Generate without a target/placement, borrowing choice, brand treatment, or approved frozen plan. | Generation is disabled and each missing decision is named; no checkpoint, packet, provider call, or source write occurs. |
| P12-08 Security | Reference contains canary logo, brand name, marketing copy, tracking ID, remote image URL, and embedded asset. | None are transferred to result/source/request beyond bounded analysis evidence; copy guard blocks a provider proposal that reproduces them. |
| P12-09 Security/privacy | Reference includes EXIF location/author, embedded URLs/comments, secret-like metadata, traversal filename, or outside-root symlink. | Sanitized descriptor/request/logs contain no canaries; unsafe path/content is rejected; persistence stays inside the approved reference directory. |
| P12-10 Failure/recovery | Analyzer times out, crashes, or returns partial/contradictory evidence. | Finite deadline ends analysis; source is untouched; partial findings are labeled incomplete and cannot be frozen without explicit resolution/retry. |
| P12-11 Failure/recovery | Provider disconnects, user presses Stop, source becomes stale, or applied proposal fails build/console/accessibility checks. | Phase 7/8 rollback restores exact pre-adaptation source/browser, preserves unrelated work/reference retention, and never marks the adaptation accepted. |
| P12-12 Design DNA conflict | Preserve mode proposal introduces a new color/font/radius or changes `tokens.json`/`DESIGN.md`. | Acceptance is blocked; user may refine, explicitly revise brand treatment, or create a separate DNA proposal, but DNA is not auto-updated. |
| P12-13 Responsive | Reference is desktop-only and proposed layout is tested at representative mobile/tablet/desktop widths. | Result passes disclosed viewport checks or acceptance blocks with overflow/overlap findings; Reframe never claims the reference proved mobile behavior. |
| P12-14 Integration | Run target selection -> reference intake -> choices -> plan review -> Generate -> Compare -> Reject, then repeat and Accept. | Compare is screenshot-first; Reject is exact; Accept produces minimal source diff and complete reference-aware checkpoint/history metadata. |
| P12-15 Regression | Run Phases 0–11 suites with no reference attached and repeat the winning milestone after an accepted adaptation. | Reference code is dormant when unused; CLI, Direct/Explore/Codex edits, DNA, history, restore, and annotations retain prior behavior. |
| P12-16 Cross-framework | Apply the same selected structural characteristic to Vanilla, React/plain CSS, CSS Modules, and Tailwind; attempt TypeScript. | Each supported target uses its existing architecture/style conventions; TypeScript remains preview/plan-only with no source write. |
| P12-17 Cross-environment | Normalize/store/use reference files from Windows and Linux paths with spaces, Unicode, CRLF Markdown, and case differences. | Hashes/descriptors/relative paths remain stable, no case/path collision escapes storage, and generated semantics match. |
| P12-18 Performance | Analyze bounded demo references, build the packet/plan, and render comparison under load. | Intake+sanitization p95 <=2 seconds for demo assets; local analysis/plan p95 <=5 seconds; packet remains within Phase 8 budget; provider wait has a finite configurable deadline. |

## Expected results

Reference Adaptation is an explicit, testable extension of the proven Codex pipeline: it borrows only user-selected characteristics, keeps the project's brand and architecture authoritative by default, exposes uncertainty, prevents literal copying, and remains fully reversible.

## Failure conditions

- Reference Adaptation exists only as a prompt attachment with no normalized descriptor or frozen borrowing plan.
- Attaching a reference implicitly selects every characteristic or defaults to copying it closely.
- A static screenshot is treated as evidence of responsive or interaction behavior.
- Original metadata, remote URLs, executable SVG/document content, or sensitive reference data reaches storage/provider/logs.
- Logos, text, branding, tracking IDs, or proprietary assets are copied into the result.
- Preserve mode introduces reference tokens/styles or edits Design DNA without review.
- The provider chooses placement, changed-file scope, or new components without prior disclosure.
- Compare mutates source, or Reject/Stop/failure leaves partial adaptation files.
- The feature is shown in the demo but omitted from full-spec automated acceptance.

P12-01/P12-07 detect prompt-only or implicit borrowing, P12-04/P12-13 detect invented reference evidence, P12-06/P12-09 detect unsafe intake, P12-08 detects literal copying, P12-12 detects silent brand/DNA drift, P12-11/P12-14 detect incomplete recovery/review, and P12-15 detects regressions in the core path.

## Debugging checklist

- Validate reference magic bytes, parser/sanitizer result, hash, dimensions/pages, provenance, persistence consent, and canonical storage path.
- Inspect analyzer evidence/confidence per characteristic; verify Unknown remains Unknown.
- Compare selected borrowing choices and brand treatment with the frozen adaptation-plan hash.
- Audit the packet manifest for only approved views/spec excerpts, target context, and relevant DNA; scan all artifacts for canary metadata/content.
- Compare planned and actual changed-file/component/token scope; inspect copy-guard and DNA-conflict findings.
- Review mobile/tablet/desktop screenshots and build/console/accessibility results.
- Trace pre-adaptation checkpoint, generation ID, transaction, Compare state, Accept/Reject decision, and rollback hashes.

## Definition of done

Phase 12 is done when every §26 input category has a safe adapter or explicit supported-format rejection path, the preserve-brand screenshot E2E test proves §42, the §41 demo includes a real reversible adaptation, all adversarial intake/copy/privacy/recovery/responsive tests pass, and the entire Phase 0–11 regression suite remains green.

---

## Risk list and early detection

| Risk | Likely failure | Mitigation | Earliest detecting tests/gate |
|---|---|---|---|
| Wrong project/root detection | Reframe starts or edits the wrong folder | Canonical root guard, evidence-based descriptor, no silent upward scan | P2-08–P2-11 |
| Process/port ownership confusion | Orphaned Vite processes or killed unrelated server | Ownership-aware supervisor and process-tree leak assertion | P1-10, P2-15, P2-16 |
| Proxy/HMR incompatibility | Page works once but HMR/assets/WebSockets break | Transparent proxy tests for headers, encodings, upgrades, routes | P3-02, P3-03, P3-11 |
| UI CSS/event collision | Toolbar unreadable or site interaction broken | Shadow DOM and Select-off event parity tests | P3-05, P3-06, P5-13 |
| WebSocket trust boundary failure | Unrelated site sends edit messages or filesystem paths | Loopback/origin/token/schema/path-authority controls | P4-05–P4-08 |
| Stale or invented source mapping | Correct-looking preview edits wrong file/component | Exact-confidence gate, server-owned metadata, hash compare | P6-03, P6-10–P6-13 |
| Regex/format corruption | Multiple declarations/JSX tokens change, BOM/EOL lost | AST/parser transforms, golden minimal diffs, byte integrity checks | P6-02, P6-20 |
| Path traversal/symlink escape | Out-of-project read/write | Canonical/real-path containment at every file boundary | P6-14, P6-15, P11-09 |
| Non-atomic write/rollback | Truncated source or false recovery | Same-directory atomic write, transaction backup, rollback status | P6-16–P6-19 |
| Dirty Git work loss | User edits/staging overwritten during edit/restore | Range overlap, expected hashes, safety checkpoint, no reset | P7-04, P7-05, P7-09 |
| Invalid history | Restore appears available but artifacts are partial/corrupt | Atomic checkpoint publication and independent schema/hash/image validation | P7-06–P7-11 |
| Secret/context leakage to Codex | Credentials or unrelated repository content sent/logged | Allowlist packet builder, ignored-file rules, canary scanning, redaction | P8-05, P8-06, P8-09 |
| Provider scope escalation | AI adds packages/routes/backend or edits broad files | Structured diff plus operation/file allowlist and exact hashes | P8-07, P8-08, P8-13 |
| AI cancellation/race | Partial files or duplicated generation apply | Pre-checkpoint, idempotency, project lock, Stop recovery | P8-11–P8-15 |
| Design DNA overclaims | One-off style becomes permanent project rule | Evidence/confidence/frequency and explicit review | P9-04, P9-05, P9-12 |
| `AGENTS.md` destruction | Existing commands/instructions lost | Delimited idempotent section and outside-byte diff | P9-07 |
| Misleading visual history | Wrong route/viewport shown as exact previous | Screenshot descriptor/hash/mismatch labels | P10-04–P10-06 |
| Annotation drift/XSS/conflict | Comment attaches to wrong element or executes content | Source-aware anchors, orphan state, text rendering, per-file isolation | P11-04–P11-12 |
| Unsafe reference intake | Active content, metadata secrets, bombs, or outside paths reach storage/provider | Magic-byte validation, bounded parsers, metadata stripping, canonical storage, canary scans | P12-06, P12-09 |
| Reference cloning or brand drift | Result copies protected content/assets or replaces project DNA despite Preserve mode | Explicit borrowing plan, copy guard, relevant approved DNA, conflict gate, separate DNA proposals | P12-01, P12-08, P12-12 |
| Unsupported reference assumptions | Static image is treated as proof of responsive/interaction behavior | Per-characteristic evidence/confidence and Unknown state plus generated-project viewport checks | P12-04, P12-13 |
| Performance degradation | Hover jank, endless analysis, slow history/reference processing | Phase budgets, p95 telemetry, debounce/cache/bounded queues | P5-16, P9-15, P10-14, P11-17, P12-18 |

## Final end-to-end validation checklist

Run this checklist only after all phase gates pass. Use a clean clone of Reframe, clean copies of both demos, a dirty-worktree variant, network-disabled mode, and—separately—an optional live Codex smoke environment.

### Installation and startup

- [ ] Pack/install the exact release candidate and run `npx reframe` without a global install.
- [ ] Confirm project root, framework, styling, package manager, command, upstream URL, and proxy URL are correct and evidence-backed.
- [ ] Confirm the browser opens only after a verified ready state.
- [ ] Confirm no extension, proprietary IDE, account, separate init command, or manual port copying is required.
- [ ] Repeat on Vanilla and React/Vite; run package-manager matrix and Windows/Linux CI variants.

### Proxy, connection, and ordinary application behavior

- [ ] Confirm one isolated toolbar appears only through the Reframe proxy.
- [ ] Verify assets, routes, forms, scrolling, menus, application WebSockets, and Vite HMR behave as they do upstream.
- [ ] Refresh/reload/restart the server and confirm accurate Connected/Disconnected/Reconnecting states with no duplicate UI.
- [ ] Verify invalid token/origin/protocol clients and malicious/oversized messages are rejected and secrets are absent from logs.
- [ ] Click Exit and verify every overlay, offset, observer, timer, listener, and temporary preview is gone while the project server keeps running.

### Explore/selection behavior

- [ ] Enter Select mode, hover and select the intended annual pricing card, and confirm component/source-confidence information.
- [ ] Attempt ignored, dynamic, cross-origin, canvas, third-party, hidden, and ambiguous elements; verify no unsafe Apply is offered.
- [ ] Resize to the planned width; confirm the browser changes but disk does not.
- [ ] Cancel and verify exact visual/inline-style restoration; hard refresh and verify unsaved preview disappears.
- [ ] Disable Select and verify the website is fully interactive.

### Deterministic source edit

- [ ] Apply a Vanilla width edit; verify exact source file/range, minimal diff, hot reload, computed width, and refresh persistence.
- [ ] Apply React plain CSS, CSS Module, and Tailwind width edits; verify conventions/variants and allowed changed-file sets.
- [ ] Force ambiguous mapping, stale hash, concurrent request, out-of-root path, read-only file, compile failure, and HMR timeout; verify no unsafe acceptance and exact rollback/recovery reporting.
- [ ] Verify responsive/shared-component impact is disclosed and requires explicit intent.

### Checkpoint and restore

- [ ] Accept an edit and validate checkpoint schema, hashes, patches, screenshots, route/viewport, changed files, and verification record.
- [ ] Restore Previous; verify a safety checkpoint is created and source/browser return exactly.
- [ ] Repeat with unrelated staged/unstaged/untracked work and verify every byte/index state is preserved.
- [ ] Test corrupted/incomplete checkpoint and failed restore; verify invalid history is not presented as restorable and recovery is explicit.
- [ ] Audit Git commands and network: no push, pull, fetch, stage, commit, reset, merge, or hidden history rewrite occurs.

### Codex-assisted edit

- [ ] With no key/provider network, verify the entire non-AI workflow still works.
- [ ] Preview the Element Context Packet and confirm only relevant source, screenshots, styles, route/framework, approved rules, and user instruction are included.
- [ ] Run canary scans proving `.env`, keys, credentials, ignored files, unrelated repository content, and sensitive logs/screenshots are excluded/redacted.
- [ ] Generate the focused annual-plan emphasis change and inspect exact proposed files/scope before apply.
- [ ] Verify malformed, broad, disallowed, duplicate, late, timed-out, stopped, or build-breaking provider outputs cannot become accepted source.
- [ ] Compare without source switching; Reject and verify exact pre-generation state; regenerate and Accept with a complete checkpoint.
- [ ] Refine in the same conversation lineage and verify safe rollback points remain correct.

### Design DNA

- [ ] Deny setup permission and verify zero writes plus continued limited editing.
- [ ] Generate/review colors, fonts, sizes, spacing, radii, Tailwind values, and reusable component names with evidence/confidence.
- [ ] Mark incorrect/exception/deprecated items and confirm they are excluded/scoped in AI context.
- [ ] Verify existing `AGENTS.md` is byte-identical outside one idempotent generated section.
- [ ] Change styles externally and verify status becomes `May be outdated` without silent DNA rewrite or editing block.

### Reference Adaptation

- [ ] Ingest and sanitize each §26 reference category or produce an explicit supported-format rejection; verify no active content, metadata canary, remote fetch, or unsafe path survives.
- [ ] Select only the characteristics to borrow and confirm Preserve this project's Design DNA is the default.
- [ ] Review and hash-freeze the adaptation plan: target/placement, borrowed and preserved traits, component reuse/new scope, expected files, uncertainties, prohibited copying, and responsive verification.
- [ ] Adapt the synthetic reference's structure/arrangement while automated assertions prove project colors, typography, spacing, cards, buttons, source architecture, and unselected traits remain authoritative.
- [ ] Verify reference logos, names, copy, tracking IDs, remote assets, and embedded content cannot enter source or provider output.
- [ ] Test desktop-only/unknown evidence and verify responsive/interaction behavior is not invented; validate the generated result at mobile, tablet, and desktop widths.
- [ ] Compare without source switching; Reject/Stop/failure/stale source restores exactly; Accept records reference/plan IDs, choices, DNA version/conflicts, source/visual diffs, and verification in the checkpoint.
- [ ] Show the accepted/rejected Reference Adaptation path in the §41 demonstration and retain the passing §42 preserve-brand E2E evidence.

### Visual Time Machine and comments

- [ ] Hold to show the correct prior route/viewport screenshot; release/blur/Escape returns immediately to unchanged live page.
- [ ] Prove comparison causes no source/Git/server mutation and labels missing/corrupt/mismatched/private screenshots accurately.
- [ ] Restore from history through the same Phase 7 safety flow.
- [ ] Create, reload, resolve, reopen, Git-sync, and checkpoint-filter one annotation.
- [ ] Move/delete its source, inject malformed/conflicted/XSS/path-traversal annotation data, and verify safe orphan/conflict handling with no application-source changes.

### Reliability, performance, and release evidence

- [ ] Run all phase suites with zero skipped critical tests, leaked processes/ports, unhandled rejections, unexpected changed files, or redaction failures.
- [ ] Repeat the complete winning milestone 20 times from fresh fixtures and once from a dirty worktree.
- [ ] Meet recorded p95 budgets for CLI startup/shutdown, detection, proxy injection, WebSocket, selection frames, mapping/write/verification, packet building, analysis, history, annotations, and reference intake/adaptation planning.
- [ ] Preserve failing CI artifacts: structured logs, process tree, port report, exact file diff/hashes, browser trace, screenshots, checkpoint validation, and redacted provider manifest.
- [ ] Review product prohibitions one final time: no production attachment, secret sending, invented mappings, silent Design DNA/`AGENTS.md` rewrite, hidden changed files/errors, automatic Git remote/history operations, reference cloning or unapproved brand/token changes, unsupported TypeScript/framework writes, browser/editor extension requirement, Multi-AI Comparison, or AI Animation Generator.

## Complete-product definition of done

The core hackathon milestone remains Phase 0–8: a non-technical evaluator can run one command and repeatedly open a supported project, see the injected toolbar, select one card, preview/cancel, apply a persistent exact source edit, inspect the minimal diff, checkpoint/restore it, and request/compare/reject-or-accept one scoped Codex edit without manual repair. Phases 9–12 must not reduce the reliability of that sequence.

The complete product specification is not done at the core milestone. Full §41 demonstration and §42 functional acceptance additionally require reviewable Design DNA, screenshot-first history/restore, and a real Reference Adaptation that borrows only selected characteristics while preserving project branding by default. Phase 12 is therefore mandatory for a full-spec release even though the roadmap correctly deprioritizes it until the core pipeline is stable. Async Comments remain a separately gated Phase 11 capability.
