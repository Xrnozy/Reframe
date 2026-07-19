# Phase 1 Historical Completion Evidence

> Historical report. The current combined canonical traceability matrix is maintained in `spec/status/phase-3-status.md`.

## Status

- Phase: Phase 1 - Build the CLI Skeleton
- State: Implementation complete on Windows; cross-platform gate not fully verified
- Scope boundary: packed CLI, loopback welcome server, browser opening, lifecycle, shutdown, packaging, and Phase 1 verification only
- Previous phase: Phase 0 implementation complete on Windows; Unix remains Not verified
- Next phase: Phase 2 - Detect the Project and Start Its Development Server (untouched)

## Canonical test traceability matrix

This is the single canonical traceability matrix for Phase 1. Update these rows in place; do not create another Phase 1 matrix.

| Test ID | Requirement and expected result | Test type | Test location | Execution command | Windows environment | Windows result | Windows evidence | Unix environment | Unix result | Unix evidence | Overall status | Notes or blocker |
| ------- | ------------------------------- | --------- | ------------- | ----------------- | ------------------- | -------------- | ---------------- | ---------------- | ----------- | ------------- | -------------- | ---------------- |
| P1-01 | Run the packed CLI and request `/` and `/health`; both return 200, welcome text is correct, and one browser-open call uses the reachable URL. | Integration | `tests/integration/phase-1-cli.test.ts` | `npm.cmd run test:phase1:integration` | Windows native | Passed | Final exact-tree run: packed installation returned 200 for `/` and `/health`, exact content, one exact reachable opener URL, clean stop/rebind; integration 13/13, exit 0. | Linux via available low-risk environment | Not verified | No Unix execution. | Partially verified | Windows passed; Unix remains required by the plan. |
| P1-02 | Invoke via `npx` without a global installation; the bin resolves from the package, reaches ready state, and prints the documented output. | Integration, End-to-end | `tests/integration/phase-1-cli.test.ts` | `npm.cmd run test:phase1:integration` | Windows native | Passed | Final exact-tree empty-directory packed install resolved through local `npx`, reached HTTP readiness, printed exact output, invoked the browser spy once, and released the listener; integration 13/13, exit 0. | Linux via available low-risk environment | Not verified | No Unix execution. | Partially verified | Windows passed; Unix remains required by the plan. |
| P1-03 | Send `SIGINT` immediately during startup; startup is cancelled, any partial listener closes, browser does not open, and exit completes within 2 seconds. | Integration, Failure recovery | `tests/integration/phase-1-cli.test.ts` | `npm.cmd run test:phase1:integration` | Windows native | Passed | A real packed-bin child received OS `SIGINT` immediately after spawn; it exited within 2 seconds, no browser-spy call occurred, and the configured port rebound; final integration 13/13, exit 0. | Linux via available low-risk environment | Not verified | No Unix execution. | Partially verified | Windows passed; Unix remains required. |
| P1-04 | Send two shutdown signals rapidly; cleanup is idempotent with no double-close exception or hung process. | Integration, Failure recovery | `tests/integration/phase-1-cli.test.ts` | `npm.cmd run test:phase1:integration` | Windows native | Passed | Rapid `SIGINT` then `SIGTERM` followed exactly starting, ready, stopping, stopped; one cleanup, exit 0, immediate rebind; final integration 13/13. | Linux via available low-risk environment | Not verified | No Unix execution. | Partially verified | Windows passed; Unix remains required. |
| P1-05 | Run on an unsupported Node version using a version shim; exit nonzero with `NODE_VERSION_UNSUPPORTED` before binding a port. | Integration, Invalid input | `tests/integration/phase-1-cli.test.ts` | `npm.cmd run test:phase1:integration` | Windows native | Passed | Packed bin ran with shimmed Node `20.0.0`, exited nonzero with the stable code, printed no ready output, and never bound the port; final integration 13/13. | Linux via available low-risk environment | Not verified | No Unix execution. | Partially verified | Windows passed; Unix remains required. |
| P1-06 | Occupy port 4400 before startup; report `PORT_IN_USE`, do not claim readiness or open a browser, and leave no extra process. | Integration, Failure recovery | `tests/integration/phase-1-cli.test.ts` | `npm.cmd run test:phase1:integration` | Windows native | Passed | Real listener occupied 4400; CLI exited 1 with `PORT_IN_USE`, no ready output/opener call, original listener stayed isolated, then port released; final integration 13/13. | Linux via available low-risk environment | Not verified | No Unix execution. | Partially verified | Windows passed; Unix remains required. |
| P1-07 | Make the browser opener throw; report a warning and manual URL, keep serving the welcome page, and shut down cleanly. | Integration, Failure recovery | `tests/integration/phase-1-cli.test.ts` | `npm.cmd run test:phase1:integration` | Windows native | Passed | Throwing opener produced `BROWSER_OPEN_FAILED` and exact manual URL; welcome stayed HTTP 200 and stopped with exit 0/rebind; final integration 13/13. | Linux via available low-risk environment | Not verified | No Unix execution. | Partially verified | Windows passed; Unix remains required. |
| P1-08 | Force an HTTP server error after ready; report it, close the listener, exit nonzero, and allow a subsequent run to succeed. | Integration, Failure recovery | `tests/integration/phase-1-cli.test.ts` | `npm.cmd run test:phase1:integration` | Windows native | Passed | Forced real server error produced `HTTP_SERVER_FAILED`, exit 1, close/rebind, and a subsequent same-port run succeeded; final integration 13/13. | Linux via available low-risk environment | Not verified | No Unix execution. | Partially verified | Windows passed; Unix remains required. |
| P1-09 | Run two instances on distinct configured ports; both remain isolated and stopping one does not stop or corrupt the other. | Integration | `tests/integration/phase-1-cli.test.ts` | `npm.cmd run test:phase1:integration` | Windows native | Passed | Two real servers reached health on distinct ports; first stopped while second stayed HTTP 200; both exited 0 and rebound; final integration 13/13. | Linux via available low-risk environment | Not verified | No Unix execution. | Partially verified | Windows passed; Unix remains required. |
| P1-10 | Start, stop, and immediately restart 25 times; every run binds, with no `EADDRINUSE`, listener, or process leak. | Regression | `tests/integration/phase-1-cli.test.ts` | `npm.cmd run test:phase1:integration` | Windows native | Passed | All 25 real start/health/stop iterations exited 0 and rebound immediately; no `EADDRINUSE` or listener leak; final integration 13/13. | Linux via available low-risk environment | Not verified | No Unix execution. | Partially verified | Windows passed; Unix remains required. |
| P1-11 | Run the packed bin from Windows PowerShell and Linux shell in paths with spaces; argument/path handling is identical and no shell-specific construction fails. | Platform-specific, Integration | `tests/integration/phase-1-cli.test.ts` | `npm.cmd run test:phase1:integration` | Windows native PowerShell 5.1 | Passed | Final exact-tree packed bin ran through PowerShell from a space path, reached HTTP readiness, printed the URL, and released the port; integration 13/13, exit 0. | Linux via available low-risk environment | Not verified | WSL has no distribution and Docker has no daemon; no Linux shell executed. | Partially verified | Windows passed; Linux remains required by the plan. |
| P1-12 | Measure pack-installed CLI to health-ready and signal-to-exit; record warm p50/p95, with stated budgets of 2 seconds for ready and shutdown. | Performance | `tests/performance/phase-1-lifecycle.test.ts` | `npm.cmd run test:phase1:performance` | Windows native | Passed | Final post-race-fix exact-tree run, 1 warm-up + 20 real packed processes: ready p50 122.39 ms/p95 402.92 ms; signal-to-exit p50 7.35 ms/p95 8.37 ms; all listeners rebound; exit 0. | Linux via available low-risk environment | Not verified | No Unix samples; available low-risk environments could not execute Linux. | Partially verified | Observability-only; both Windows observations are within 2000 ms. |
| SUP-P1-01 | A repeated signal after the graceful-cleanup deadline invokes the forced-termination path once; the first signal invokes graceful shutdown once. | Mock-based unit, Failure recovery | `tests/integration/phase-1-cli.test.ts` | `npm.cmd run test:phase1:integration` | Windows native | Passed | Production signal handler with a zero-millisecond injected deadline received two signals: graceful shutdown count 1, force count 1; integration 13/13, exit 0. | Not applicable | Not applicable | The supplementary pure handler check is platform-independent; real OS signal coverage remains in P1-03/P1-12. | Passed | Supplementary coverage for the Phase 1 repeated-signal deadline branch. |
| SUP-P1-02 | Cancellation while the real listener's health probe is pending must close gracefully, return exit 0, avoid browser opening, and release the port. | Integration, Failure recovery | `tests/integration/phase-1-cli.test.ts` | `npm.cmd run test:phase1:integration` | Windows native | Passed | Forced abort during the health fetch followed the stopping/stopped path, returned 0, never reached the throwing browser opener, and rebound the real port; integration 13/13, exit 0. | Not applicable | Not applicable | The race logic is platform-independent and supplements the real platform signal tests. | Passed | Regression for the final startup-cancellation race fix. |

## Command log

- `npm.cmd run build` - Windows native - first Phase 1 compile failed on an invalid type-only import in `signals.ts`; exit 1.
- `npm.cmd run build` - Windows native - corrected build passed; exit 0.
- `npm.cmd run pack:cli -- test-results\\phase1-pack` - Windows native - packed self-contained CLI with bundled dev-server runtime; exit 0.
- `npm.cmd exec -- vitest run --pool=forks --maxWorkers=1 --no-file-parallelism --testTimeout=30000 --hookTimeout=30000 tests/integration/phase-1-cli.test.ts` - Windows native - P1-01 passed; P1-02 reached ready but cleanup failed to release its descendant listener; passed 1, failed 1, skipped 0; exit 1.
- Same P1-01/P1-02 command - Windows native repair attempt - P1-01 passed; P1-02 cleanup waited indefinitely for the npx wrapper after its listener was killed; passed 1, failed 1, skipped 0; exit 1 (30-second test timeout).
- Same P1-01/P1-02 command - Windows native repair attempt - P1-01 passed; P1-02 reached readiness and cleaned up, but asserted the browser-spy file before the spawned spy wrote it; passed 1, failed 1, skipped 0; exit 1.
- Same P1-01/P1-02 command - Windows native final slice - packed install, direct packed runtime, local npx bin resolution, exact output, real HTTP, exact opener URL, and cleanup passed; passed 2, failed 0, skipped 0; exit 0; runtime 4.73 seconds.
- `npm.cmd exec -- vitest run --pool=forks --maxWorkers=1 --no-file-parallelism --testTimeout=30000 --hookTimeout=30000 tests/integration/phase-1-cli.test.ts` - Windows native - P1-01 through P1-10 all passed against one packed isolated install; passed 10, failed 0, skipped 0; exit 0; runtime 5.09 seconds.
- Same Phase 1 integration command after adding P1-11 - Windows native - P1-01 through P1-10 passed; P1-11 failed before startup because host PowerShell execution policy blocked the temporary `.ps1`; passed 10, failed 1, skipped 0; exit 1.
- Same Phase 1 integration command with process-scoped `-ExecutionPolicy Bypass` - Windows native - P1-01 through P1-11 passed; passed 11, failed 0, skipped 0; exit 0; runtime 4.92 seconds.
- Initial P1-12 in-process measurement command - Windows native - produced p50/p95 but was rejected as insufficient evidence because it did not launch a real packed-bin process; it is not accepted as P1-12 evidence.
- `npm.cmd exec -- vitest run --pool=forks --maxWorkers=1 --no-file-parallelism --testTimeout=60000 --hookTimeout=30000 tests/performance/phase-1-lifecycle.test.ts` - Windows native real-process attempt - functional test body passed and measured ready p50 370.43 ms/p95 903.23 ms, shutdown p50 6.14 ms/p95 8.42 ms, but suite cleanup failed with a browser-spy working-directory lock; exit 1.
- `npm.cmd run build` - Windows native - changed browser child working directory to the OS temp directory so it cannot lock the target project; exit 0.
- Same P1-12 real-process command - Windows native final - 1 warm-up + 20 real packed-bin processes; ready p50 140.88 ms/p95 925.96 ms, signal-to-exit p50 7.19 ms/p95 9.30 ms; passed 1, failed 0, skipped 0; exit 0; runtime 9.41 seconds.
- `npm.cmd run test:phase1` - Windows native sandboxed orchestrator - build, P1-01 through P1-12, Phase 0 unit/integration/performance, and fixture immutability passed; Phase 0 React E2E failed when sandboxed esbuild could not read hoisted React files; exit 1. This is retained as a sandbox-boundary failure, not accepted regression evidence.
- `npm.cmd run test:phase1` - Windows native outside the filesystem sandbox - build passed; Phase 1 integration 11/11; P1-12 passed with ready p50 116.44 ms/p95 861.70 ms and shutdown p50 6.89 ms/p95 8.42 ms; Phase 0 unit 2/2, integration 5/5, performance 1/1, E2E 2/2, fixture hash unchanged, and leak checks passed; exit 0.
- `npm.cmd run test:phase1:integration` - Windows native after strengthening P1-03 to a real packed child and adding SUP-P1-01 - passed 12, failed 0, skipped 0; exit 0; runtime 6.60 seconds.
- `npm.cmd install --package-lock-only --ignore-scripts --cache .npm-cache --offline` - Windows native - synchronized the workspace lockfile after the public package rename and bundled dependency; 118 packages audited, 0 vulnerabilities; exit 0. Earlier cache attempts failed with sandbox `EPERM` and one stale workspace-link `ENOENT`; neither is accepted evidence.
- `npm.cmd run test:phase1` - Windows native outside the filesystem sandbox, final exact-current-tree orchestrator - build passed; Phase 1 integration 12/12; P1-12 1/1; Phase 0 unit 2/2, integration 5/5, performance 1/1, browser E2E 2/2; fixture hash `de31366fb4a1199cafc4cc950bde1f604aeb23814ea441a0e85a198119cf20af` unchanged; leak checks passed; failed 0; skipped 0; exit 0.
- `npm.cmd run build` and `npm.cmd run test:phase1:integration` - Windows native after the health-probe cancellation race fix - build passed; P1-01 through P1-11 plus SUP-P1-01/SUP-P1-02 passed 13/13; failed 0; skipped 0; both commands exit 0.
- `npm.cmd run test:phase1` - Windows native outside the filesystem sandbox, final post-race-fix exact-current-tree orchestrator - build passed; integration 13/13; P1-12 1/1 with ready p50 122.39 ms/p95 402.92 ms and shutdown p50 7.35 ms/p95 8.37 ms; Phase 0 unit 2/2, integration 5/5, performance 1/1, browser E2E 2/2; fixture hash unchanged; ports 4400/4510/4511 bindable; failed 0; skipped 0; exit 0.
- `npm.cmd run verify:phase1-leaks` - Windows native post-suite audit - port 4400 bindable; exit 0.
- Windows temp audit and checked cleanup - six directories left by earlier failed attempts were verified under `C:\\Users\\MY PC\\AppData\\Local\\Temp`, removed with literal paths, and the final owned Phase 1 temp count was 0. Current successful suites cleaned their own installs.

## Performance observations

- P1-12 gate type: observability-only under governing rule 8.
- Workload: one controlled warm-up plus 20 separate real packed-bin processes from an isolated install; each reached `/health`, received a real termination signal, exited, and released its port.
- Windows environment: win32-x64, Node 24.14.0, 12 logical processors.
- Final post-race-fix exact-tree health-ready: p50 122.39 ms; p95 402.92 ms.
- Final post-race-fix exact-tree signal-to-exit: p50 7.35 ms; p95 8.37 ms.
- Stated budget: 2000 ms for each p95. Gate type: observability-only. Both Windows measurements were within budget.

## Operating-system discovery

- Windows native: available; Node 24.14.0 and npm 11.9.0.
- WSL: installed compatibility layer, but `wsl.exe --list --verbose` reports no installed Linux distribution.
- Docker: client 29.6.1 is installed; daemon pipe is absent and the user Docker config is unreadable in the current sandbox.
- Other local runners: Podman, Multipass, and VirtualBox executables were not found.
- Docker service: `com.docker.service` exists but is stopped; `Start-Service -Name com.docker.service` failed because the current environment could not open the service. Docker Desktop is installed but had no running process; Phase 0's approved launch attempt had already remained stuck starting, so it was not repeated.
- Existing CI: `.github/workflows/ci.yml` has Windows and Ubuntu jobs. The `origin` remote is `https://github.com/Xrnozy/Reframe.git`, but `gh auth status` reports the configured token is invalid, so no remote job could be run without new credentials/external state.
- Unix conclusion: no documented low-risk local or remote Unix environment could execute the suite. All required Unix cells remain `Not verified`; the full cross-platform gate is not met.

## Acceptance status

- Packed artifact reaches the welcome page through local `npx` without a global install: **Passed on Windows; Unix Not verified** (P1-01, P1-02).
- URL is printed only after a successful real health probe and opener receives the exact reachable URL once: **Passed on Windows; Unix Not verified** (P1-01, P1-02).
- Immediate and repeated shutdown signals clean listeners within two seconds without double close: **Passed on Windows; Unix Not verified** (P1-03, P1-04, P1-10, SUP-P1-01).
- Fatal port/server errors and recoverable browser-launch errors are distinguished with stable guidance: **Passed on Windows; Unix Not verified** (P1-06, P1-07, P1-08).
- Unsupported Node fails before binding or opening a browser: **Passed on Windows; Unix Not verified** (P1-05).
- Distinct instances remain isolated and PowerShell space paths work: **Passed on Windows; Linux Not verified** (P1-09, P1-11).
- No project detection, WebSocket, injection, mapping, source-write, Git, Codex, or Design DNA runtime is active: **Passed by code/diff inspection**.

Overall acceptance: **Implementation complete on Windows; cross-platform gate not fully verified**.

## Regression status

- Final exact-tree `npm.cmd run test:phase1` reran all Phase 0 test IDs P0-01 through P0-11 on Windows: unit 2/2, integration 5/5, performance 1/1, browser E2E 2/2, fixture immutability passed, and ports 4510/4511 were released.
- Phase 0 fixture hash remained `de31366fb4a1199cafc4cc950bde1f604aeb23814ea441a0e85a198119cf20af`.
- No Windows regression was detected. Phase 0 and Phase 1 Unix regression coverage remains Not verified.

## Cross-platform gate status

`Partially verified`: Windows native passed every Phase 1 named test, supplementary test, acceptance check, performance observation, and Phase 0 regression. No real Unix environment was available after the bounded WSL, Docker, runner, and CI inspection, so the implementation plan's full cross-platform gate is not met.

## Known issues

- Unix Phase 1 and Phase 0 verification is missing.
- The GitHub Actions Windows/Ubuntu matrix is configured but could not be run because the available GitHub CLI token is invalid.
- Docker Desktop's service is unavailable to the current environment and WSL has no distribution.
- The inherited `NO_COLOR`/`FORCE_COLOR` warning appears in Playwright output; it did not hide a product failure.
- Performance must continue to be monitored as an observability-only budget; the final Windows results were within budget.

## Final diff and cleanup review

- `git diff --check` passed; Git reported only line-ending conversion notices.
- No demo, fixture template, governing specification, or Phase 0 status file changed.
- Source inspection found no Phase 2+ project-detection, proxy, WebSocket, injection, mapping, Git, Codex, or Design DNA runtime.
- Port 4400 is bindable, owned Phase 1 temp count is 0, and `test-results` contains only Playwright's `.last-run.json`.
- Git was clean before Phase 1; every current tracked/untracked change listed by `git status` belongs to Phase 1.

## Stopping point

Phase 1 implementation is complete on Windows. The full gate remains partially verified because no real Unix environment was available. Final Windows capability: packed `npx reframe` lifecycle, welcome/health server, browser-open request, stable failures, and clean shutdown. Last named test: P1-12. Phase 2 remains untouched; continue only with explicit instruction to verify Phase 1 on Unix or start Phase 2 despite the missing Unix gate.
