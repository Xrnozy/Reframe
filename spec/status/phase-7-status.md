# Phase 7 completion report

Status: **Implementation complete and verified on Windows; full cross-platform gate not verified by user direction.** Phase 8 remains untouched.

## Selected agent and skill

- Agent: Reframe Phase Implementation Agent.
- Skill: `ponytail:ponytail` (full). It kept the implementation on the existing Phase 6 transaction, Node standard library, existing WebSocket protocol, and existing Vitest/Playwright stack. No dependency or future-phase abstraction was added.
- Restriction followed: minimum Phase 7 implementation only; correctness and data-loss prevention were not simplified.

## Implementation summary

- Every accepted source edit now requires an atomically published `.reframe/history/<id>` checkpoint. Checkpoint failure rolls the Phase 6 source transaction back.
- Checkpoints contain versioned metadata, parent link, selected element, route/viewport, HEAD/worktree summary, exact before/after bytes, forward/reverse patches, hashes, verification duration, and before/after page/component screenshots or explicit unavailable/failed/excluded status.
- Git inspection is limited to local `rev-parse`, `status`, and `diff`. Exact target overlap blocks edits; unrelated dirty/index state is preserved. No-Git projects use local history.
- When the target line changed outside Reframe, the first Apply remains blocked and the toolbar offers `Save resize safely`. The recovery control is hidden until actionable; confirming it checkpoints the user's current bytes before changing only the mapped width.
- Selection, cancellation, and restore actions are locked while an edit is checkpointing. Every accepted edit refreshes history even if page state changed, preventing a saved edit from leaving stale selection state or a disabled Restore button.
- Restore Previous validates metadata and every artifact, re-hashes current files, creates a safety checkpoint, restores exact bytes/mode, verifies the route, records success, updates the pointer, and reloads the browser. Verification failure reapplies current bytes and records recovery.
- The toolbar now shows Previous, Current, no-Git/dirty disclosure, and Restore. Corrupt/incomplete/degraded states are not presented as complete.
- Not implemented: Phase 8 AI editing, branching history, commits, staging, reset, merge, push, remote Git, Design DNA, Time Machine, or later-phase UI.

## Changed files

| File | Change | Purpose | Pre-existing user/earlier-phase changes preserved |
| --- | --- | --- | --- |
| `packages/dev-server/src/history.ts` | Created | Atomic checkpoint, Git inspection, integrity validation, restore/recovery, screenshot policy. | New Phase 7 file. |
| `packages/dev-server/src/source-editor.ts` | Modified | Make checkpoint publication part of acceptance and use Phase 6 rollback on failure. | Yes; Phase 6 mapper/transaction retained. |
| `packages/dev-server/src/proxy.ts` | Modified | Wire history state/restore and route verification. | Yes; Phase 3-6 proxy behavior retained. |
| `packages/dev-server/src/websocket-server.ts` | Modified | Route authenticated history state and restore messages. | Yes; existing connection/edit protocol retained. |
| `packages/dev-server/src/index.ts` | Modified | Export Phase 7 history API/types. | Yes. |
| `packages/shared/src/protocol.ts` | Modified | Add strict history request/state/restore/result schemas. | Yes; existing exact validation retained. |
| `packages/browser-client/src/index.ts` | Modified | Add Previous/Current/Restore and status disclosure. | Yes; Phase 3-6 selection/edit UI retained. |
| `tests/e2e/phase-6-persistence.spec.ts` | Modified | Exclude Reframe-owned `.reframe` data from the source-only regression scan. | Yes; original application-source assertion remains. |
| `tests/integration/phase-7-history.test.ts` | Created | P7-01 and P7-04 through P7-16 strict integration tests. | New. |
| `tests/e2e/phase-7-history.spec.ts` | Created | Real P7-02, P7-03, and P7-08 browser workflows. | New. |
| `tests/performance/phase-7-history.test.ts` | Created | P7-17 1/10/50-file measurements. | New. |
| `scripts/run-phase7-tests.mjs` | Created | Ordered Phase 7 suite and protected-fixture digest. | New. |
| `package.json` | Modified | Phase 7 scripts and leak check entry. | Yes; all Phase 0-6 scripts preserved. |
| `spec/status/phase-7-status.md` | Created | This canonical report and matrix. | New. |

Pre-existing unrelated changes, including the user's `demo/vanilla-demo/style.css` 495px width and the dirty Phase 0-6 worktree, were not reverted, reformatted, staged, or overwritten.

## Operating-system discovery and provisioning

| Environment | Type | Inspection | Result |
| --- | --- | --- | --- |
| Windows NT 10.0.26200.0 | Native host | `[Environment]::OSVersion.VersionString` | Available; all current and regression tests executed. PowerShell 5.1.26100.8655, Node v24.14.0, Git 2.52.0.windows.1. |
| WSL | Compatibility layer | `where.exe wsl`; `wsl.exe --list --quiet` | Executable present; no installed distribution. Not provisioned because the user explicitly directed Unix/Linux verification to be skipped. |
| Docker | Container | `where.exe docker`; `docker version` | CLI present; daemon unavailable and config access denied. Not provisioned. |
| GitHub Actions | Remote CI | Existing `.github/workflows/ci.yml` inspected during preparation | Existing configuration present; no remote run triggered because the user directed Unix verification to be skipped and credentials were not valid. |
| GitHub CLI | Remote runner access | `gh auth status` | Installed; stored GitHub token invalid. No upload or remote action attempted. |
| VM | Virtual machine | Repository/tooling inspection | No documented available VM found. |

The implementation may be complete on the available operating system, but the implementation plan's full cross-platform phase gate has not been verified.

## Canonical test traceability matrix

This is the single canonical Phase 7 matrix.

| Test ID | Requirement and expected result | Test type | Test location | Execution command | Windows environment | Windows result | Windows evidence | Unix environment | Unix result | Unix evidence | Overall status | Notes or blocker |
| ------- | ------------------------------- | --------- | ------------- | ----------------- | ------------------- | -------------- | ---------------- | ---------------- | ----------- | ------------- | -------------- | ---------------- |
| P7-01 | Clean-Git accepted edit publishes one complete checkpoint with correct parent, patches, exact bytes/hashes, route/viewport, four screenshot artifacts, verification, and metadata. | Integration | `tests/integration/phase-7-history.test.ts`, P7-01 | `npm.cmd run test:phase7:integration` | Windows native | Passed | 14/14 integration tests passed; P7-01 validated all required files and hashes; exit 0. | Not run by user direction | Not verified | No Unix execution. | Partially verified | Windows complete; Unix not verified. |
| P7-02 | Restore creates a safety checkpoint and returns exact original source/browser, pointer, and UI state. | End-to-end | `tests/e2e/phase-7-history.spec.ts`, P7-02 | `npm.cmd run test:phase7:e2e` | Windows native, Chrome | Passed | Exact source Buffer restored; browser returned to original 495px user fixture width; pointer/UI reset; 5/5 E2E passed; exit 0. | Not run by user direction | Not verified | No Unix browser execution. | Partially verified | Windows complete; Unix not verified. |
| P7-03 | No-Git edit/checkpoint/restore works and UI explicitly shows no Git. | End-to-end | `tests/e2e/phase-7-history.spec.ts`, P7-03 | `npm.cmd run test:phase7:e2e` | Windows native, Chrome | Passed | `gitAvailable=false`, toolbar displayed `no Git`, restore returned original browser width; exit 0. | Not run by user direction | Not verified | No Unix execution. | Partially verified | Windows complete; Unix not verified. |
| P7-04 | Unrelated staged, unstaged, and untracked work remains byte/status/index-identical through edit and restore, with dirty disclosure. | Integration, Regression | `tests/integration/phase-7-history.test.ts`, P7-04 | `npm.cmd run test:phase7:integration`; targeted `-t P7-04` | Windows native, real Git | Passed | Porcelain status, cached diff, unstaged diff, and untracked bytes matched exactly; targeted rerun exit 0. | Not run by user direction | Not verified | No Unix Git execution. | Partially verified | `.reframe` is locally self-ignored without modifying project `.gitignore`. |
| P7-05 | User modification overlapping the exact target range blocks without write/history. | Integration | `tests/integration/phase-7-history.test.ts`, P7-05 | `npm.cmd run test:phase7:integration` | Windows native, real Git | Passed | `USER_CHANGE_OVERLAP:path:start-end`; user 321px bytes retained; zero checkpoints; exit 0. | Not run by user direction | Not verified | No Unix execution. | Partially verified | Windows complete; Unix not verified. |
| SUP-P7-01 | After the required first overlap rejection, explicit user confirmation checkpoints current source, applies only the mapped width, and enables Restore. | End-to-end, Regression | `tests/e2e/phase-7-history.spec.ts`, SUP-P7-01; P7-05 integration safe-path assertions | `npm.cmd run test:phase7:e2e`; `npm.cmd run test:phase7:integration -- -t P7-05` | Windows native, Chrome, real Git | Passed | Recovery controls were hidden before the rejection. First Apply showed `Source changed outside Reframe`; page clicks produced no discard dialog; `Save resize safely` saved 520px and enabled Restore. P7-05 also preserved the initial rejection before applying the confirmed edit; exits 0. | Not run by user direction | Not verified | No Unix execution. | Partially verified | Corrective Phase 7 regression for user-edited CSS since Phase 6. |
| SUP-P7-02 | User interaction during checkpoint publication cannot detach the accepted edit from its selection/history; Restore enables and a second edit saves. | End-to-end, Regression | `tests/e2e/phase-7-history.spec.ts`, SUP-P7-02 | `npm.cmd run test:phase7:e2e` | Windows native, Chrome | Passed | Deterministically held checkpoint publication, attempted another selection, observed no discard dialog, completed acceptance/history refresh, enabled Restore, and saved a second width; exit 0. | Not run by user direction | Not verified | No Unix execution. | Partially verified | Corrective lifecycle-race regression. |
| P7-06 | Tampered metadata, patch, exact artifact, or screenshot is corrupt and non-restorable. | Integration | `tests/integration/phase-7-history.test.ts`, P7-06 | `npm.cmd run test:phase7:integration` | Windows native | Passed | Four tamper cases rejected and listed invalid; exit 0. | Not run by user direction | Not verified | No Unix execution. | Partially verified | Metadata has independent SHA-256 file. |
| P7-07 | Failure of every required artifact write or final rename publishes no valid history, rolls source back, and cleans temp entries. | Integration | `tests/integration/phase-7-history.test.ts`, P7-07 | `npm.cmd run test:phase7:integration` | Windows native | Passed | Exact bytes, both patches, four screenshots, metadata, metadata hash, and final publish failures injected; each rolled back with zero valid/incomplete entries; exit 0. | Not run by user direction | Not verified | No Unix filesystem execution. | Partially verified | Bounded Windows EPERM/EACCES/EBUSY rename retry is covered by successful suite. |
| P7-08 | Screenshot timeout/truncation never claims complete visual history; degraded UI remains safely restorable. | Integration, End-to-end | Phase 7 integration P7-08; E2E P7-08 | `npm.cmd run test:phase7:integration`; `npm.cmd run test:phase7:e2e` | Windows native, Chrome | Passed | Timeout and invalid PNG produced valid checkpoint with `visualComplete=false`; UI showed degraded state and enabled Restore; exits 0. | Not run by user direction | Not verified | No Unix execution. | Partially verified | Capture policy can explicitly mark privacy exclusion. |
| P7-09 | Source changed after list fails expected-current hash before restore and retains user bytes. | Integration | Phase 7 integration P7-09 | `npm.cmd run test:phase7:integration` | Windows native | Passed | `RESTORE_FILE_STALE`; 777px user bytes remained; exit 0. | Not run by user direction | Not verified | No Unix execution. | Partially verified | Windows complete; Unix not verified. |
| P7-10 | Failed restore verification reapplies current bytes, attempts browser recovery, and records failure. | Integration | Phase 7 integration P7-10 | `npm.cmd run test:phase7:integration` | Windows native | Passed | Apply verification failed, recovery verifier called, 420px current bytes restored, `restore-failed.json` recorded; exit 0. | Not run by user direction | Not verified | No Unix execution. | Partially verified | Windows complete; Unix not verified. |
| P7-11 | Restart detects incomplete temp state, preserves valid history, and UI supplies safe cleanup instruction. | Integration, End-to-end behavior | Phase 7 integration P7-11; browser client history-state handler | `npm.cmd run test:phase7:integration` | Windows native | Passed | `.tmp-crashed` reported while valid current checkpoint remained readable; UI message identifies `.tmp` review/removal; exit 0. | Not run by user direction | Not verified | No Unix execution. | Partially verified | Windows complete; Unix not verified. |
| P7-12 | Two racing checkpoints serialize with consistent parent chain and no overwrite. | Integration | Phase 7 integration P7-12 | `npm.cmd run test:phase7:integration` | Windows native | Passed | Two unique valid checkpoints; current parent references first; first parent null; exit 0. | Not run by user direction | Not verified | No Unix execution. | Partially verified | One project-scoped in-process lock. |
| P7-13 | With network unused, every Git invocation is allowlisted local inspection; no remote/mutating command. | Integration, Security | Phase 7 integration P7-13 | `npm.cmd run test:phase7:integration` | Windows native, real Git plus argument audit | Passed | Audit contained only `rev-parse`, `status`, and `diff`; no push/fetch/pull/remote/add/commit/reset/merge/checkout; exit 0. | Not run by user direction | Not verified | No Unix execution. | Partially verified | No network action occurred. |
| P7-14 | Real Git diff after restore removes only Reframe's change and preserves unrelated/index state. | Integration, Regression | Phase 7 integration P7-14 | `npm.cmd run test:phase7:integration` | Windows native, real Git | Passed | Style diff present after edit and empty after restore; unrelated diff identical; exit 0. | Not run by user direction | Not verified | No Unix execution. | Partially verified | Windows complete; Unix not verified. |
| P7-15 | Twenty edit/checkpoint/restore/edit cycles have no drift, duplicate IDs, invalid entry, temp leak, or corruption. | Regression | Phase 7 integration P7-15 | `npm.cmd run test:phase7:integration` | Windows native | Passed | 20 cycles, original Buffer after each restore, all IDs unique, all checkpoints valid, zero incomplete entries; exit 0. | Not run by user direction | Not verified | No Unix execution. | Partially verified | Test runtime 24.483s in final full integration run. |
| P7-16 | Windows CRLF checkpoint transfers to Linux/LF tooling and exact bytes/index remain correct. | Platform-specific | Phase 7 integration P7-16 | `npm.cmd run test:phase7:integration` | Windows native | Passed | Exact CRLF Buffer restored byte-for-byte; exit 0. | Linux unavailable by user direction | Not verified | WSL has no distro; Docker daemon unavailable; no remote CI run. | Partially verified | Transfer/Linux half is not verified, so the full criterion is not passed. |
| P7-17 | Measure create/restore on 1, 10, 50 files. One-file create p95 <=2s is observability-only; restore must finish safely within 10s. | Performance | `tests/performance/phase-7-history.test.ts`, P7-17 | `npm.cmd run test:phase7:performance` | Windows native | Passed | 5 samples/workload; final p95 create: 36.43/98.18/723.80ms; restore: 2171.88/849.50/1348.64ms; all restore samples <10s; exit 0. | Not run by user direction | Not verified | No Unix measurements. | Partially verified | Observability budget met; it was not converted into a new hard gate. |
| REG-P7-01 | Complete required Phase 1-6 regression chain passes and protected demo/template digest is unchanged. | Regression | Existing Phase 1-6 suites through `scripts/run-phase6-tests.mjs` | `npm.cmd run test:phase7:regression` | Windows native, Chrome, real processes | Passed | Final unsandboxed run exit 0: P6 integration 22/22, P6 E2E 9/9, P6 perf 1/1, Phase 5/4 and mapped Phase 1-3 regressions passed; digest `f86b...e9827` unchanged. | Not run by user direction | Not verified | No Unix regression run. | Partially verified | Initial sandboxed Vite access failure was rerun outside the filesystem restriction and passed. |

## Test-command results

- `npm.cmd run build` — Windows native — final exit 0; TypeScript project references compiled without warnings/errors.
- `npm.cmd run test:phase7:integration` — Windows native — 14 passed, 0 failed, 0 skipped, exit 0, 66.46s. A final affected P7-04 targeted rerun also passed, exit 0.
- `npm.cmd run test:phase7:e2e` — Windows native Chrome — 5 passed, 0 failed, 0 skipped, final exit 0, 25.3s, including SUP-P7-01 overlap confirmation and SUP-P7-02 save-state lifecycle coverage.
- `npm.cmd run test:phase7:performance` — Windows native — 1 passed, 0 failed, 0 skipped, exit 0, 28.65s.
- `npm.cmd run test:phase7:regression` — Windows native, executed outside the filesystem sandbox so Vite could read installed React files — complete Phase 1-6 chain passed, exit 0. The protected fixture digest was unchanged.
- Initial Phase 7 integration run — 12 passed, 2 failed: P7-04 exposed transient Windows directory rename/status behavior and P7-15 exceeded the original test timeout. Implementation was fixed with bounded rename retry/no-Git caching and both IDs then passed.
- Initial Phase 7 E2E run — 1 passed, 2 failed because the test assumed a 320px fixture while the preserved user fixture is 495px. Tests were corrected to assert exact discovered original width; implementation was not weakened.
- Initial sandboxed Phase 6 regression run — failed because Vite/esbuild received `Access is denied` reading installed React CJS files. Unrestricted local rerun resolved the environment failure; one legitimate Phase 7 assertion conflict then found `.reframe` in a source-only scan. The scan now excludes Reframe-owned history and the full chain passes.
- `npm.cmd run verify:phase7-leaks` — exit 1 because pre-existing PID 25560, started before Phase 7 work, is listening on 127.0.0.1/[::1]:4400. Phase 7 tests use reserved random ports and their process harnesses completed cleanup; the unrelated user process was preserved.

## Performance observations

| Workload | Samples | Create p50 | Create p95 | Restore p50 | Restore p95 | Gate/result |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 small file | 5 | 25.79ms | 36.43ms | 241.99ms | 2171.88ms | Create budget 2s observability-only: met. Restore hard functional timeout 10s: met. |
| 10 small files | 5 | 78.78ms | 98.18ms | 844.19ms | 849.50ms | Baseline recorded; restore <10s. |
| 50 small files | 5 | 299.19ms | 723.80ms | 1142.40ms | 1348.64ms | Baseline recorded; restore <10s. |

Environment: Windows native, Node v24.14.0, x64; screenshots excluded as required. No performance result was turned into a stricter gate.

## Acceptance criteria

- Passed on Windows: every accepted edit has a complete parseable checkpoint or explicit visual-capture status (P7-01, P7-07, P7-08).
- Passed on Windows: Restore Previous creates safety history and returns exact source/browser/pointer/UI state (P7-02, P7-10).
- Passed on Windows: unrelated work/index is preserved; overlap and stale current bytes block (P7-04, P7-05, P7-09, P7-14).
- Passed on Windows: corrupt/write/screenshot/Git absence/failure states are visible and recoverable (P7-03, P7-06 through P7-11).
- Passed on Windows: Git operations are local/read-only and contain no staging, commit, reset, merge, checkout, push, fetch, or pull (P7-13).
- Passed on Windows: the Phase 6 milestone edits and restores successfully; complete earlier regression chain passes (P7-02, REG-P7-01).
- Not verified cross-platform: the required Unix execution and CRLF-to-Linux transfer were skipped by user direction (P7-16 and Unix columns).

## Cross-platform gate status

**Implementation complete on available OS; other OS Not verified.** All Windows Phase 7 tests and earlier regressions pass. The full Phase 7 gate is not met because Unix was not executed.

## Known issues and limitations

- Unix/Linux verification is intentionally missing. WSL has no distro and Docker has no running daemon; remote CI was not invoked.
- PID 25560 is a pre-existing user-owned listener on port 4400, so the generic leak script cannot report a clean baseline. It was not created or terminated by Phase 7.
- The product runtime has no native page-screenshot API. Without an injected screenshot provider, checkpoints explicitly use degraded visual status; source checkpoint/restore remains valid. The provider interface supports page/component captures and privacy exclusion.
- The project worktree contains extensive pre-existing Phase 0-6 and user changes. Nothing was staged or committed.

## Exact stopping point

- Implemented phase: Phase 7 only.
- Implementation complete: Yes on Windows.
- Full phase gate met: No; Unix is Not verified.
- Final verified capability: accepted deterministic edits produce durable local checkpoints and Restore returns exact source/browser state while preserving unrelated Git work.
- Last verified named test: P7-17 on Windows; REG-P7-01 confirms the earlier-phase chain.
- Next phase untouched: Phase 8.
- Continue only with an explicit instruction such as `start Phase 8` or `verify Phase 7 on Unix`.
