# Phase 6 status — guarded persistent source edit

Status: **Implementation complete for Phase 6 on Windows; partially verified overall.** The canonical Windows suite is green, including the Vite-served React metadata adapter. The full plan gate is not met only because Unix verification was explicitly skipped/unavailable. Phase 7 is untouched.

## Selected agent and skill

- Agent: **Reframe Phase Implementation Agent** (continued in this Codex task).
- Skill: **ponytail, full intensity**. It kept the implementation on existing Node/Vitest/Playwright tooling, used Node standard-library filesystem operations, added no dependency, and stopped at Phase 6.
- Limitation: Ponytail supplies implementation-discipline guidance; it does not provide an operating system or test evidence.

## Implementation summary

- Added server-owned confidence mapping for Vanilla CSS, React plain CSS, CSS Modules, and static Tailwind width utilities.
- Added exact/probable/ambiguous/not-mapped responses, candidate evidence, explicit shared-impact approval, and an exact-confidence Apply gate.
- Added root/realpath/symlink containment, compare-and-swap hashes/ranges, per-project serialization, same-directory atomic replace, short-write detection, bounded Windows lock retries, transient backups, rollback, and critical recovery reporting.
- Wired mapping and source writes through the CLI proxy, protocol, WebSocket server, and browser panel.
- Selection promotes unstyled child text to the nearest identifiable edit owner, and browser measurements are normalized to whole pixels before protocol validation.
- Added development-only Vanilla metadata to served HTML; metadata is not written to source.
- Added development-only React/Vite response metadata for component, JSX file/range, runtime instance, prop names, mapped style owner, and reuse state; metadata is never written to source.
- Added React component/file/line ownership, route-file and collection-render use locations, and shared-impact disclosure to the server-owned registry.
- Added authenticated browser verification of the post-write rendered width, page errors/Vite overlay state, and post-rollback original width.
- Added recovery-only stylesheet refresh so a rapid write/rollback cannot leave stale CSS rendered.
- Added disposable real-Vite browser milestones and protected the original demos/fixture templates with before/after digests.
- Intentionally did not add Phase 7 history/checkpoints, Git operations, Codex execution, or later-phase features.

## Changed files attributable to Phase 6

| File | Change | Purpose | Pre-existing user changes |
|---|---|---|---|
| `packages/dev-server/src/source-editor.ts` | Created | Mapping, Vite metadata transform, safe source transforms, path guard, atomic transaction, verification/rollback | No |
| `packages/shared/src/protocol.ts` | Modified | Mapping request/result and edit result schemas | File existed from earlier uncommitted phases; preserved earlier behavior |
| `packages/dev-server/src/websocket-server.ts` | Modified | Route mapping/apply results and stale-selection checks | Earlier Phase 4/5 work preserved |
| `packages/dev-server/src/proxy.ts` | Modified | Enable source editor, Vanilla metadata, Vite-served JSX metadata, verification callback | Earlier Phase 3–5 work preserved |
| `packages/dev-server/src/index.ts` | Modified | Export Phase 6 APIs/types | Earlier work preserved |
| `packages/cli/src/run.ts` | Modified | Pass canonical detected project root to proxy | Earlier work preserved |
| `packages/browser-client/src/index.ts` | Modified | Mapping evidence, style-owner/reuse annotations, impact approval, exact-confidence gate, retry/critical UI | Earlier toolbar/selection behavior preserved |
| `tests/integration/phase-5-proposal.test.ts` | Modified | Keep rich proposal fixture conformant to the Phase 6 protocol | Earlier test preserved |
| `tests/integration/phase-6-source-editor.test.ts` | Created | P6-01–P6-20, P6-22, and SUP-P6-01 metadata coverage | No |
| `tests/e2e/phase-6-persistence.spec.ts` | Created | Real Vite/browser P6-01, P6-03, P6-05, P6-10, P6-11, P6-17, P6-18, P6-19, P6-21 | No |
| `tests/e2e/phase-5-selection.spec.ts` | Modified | Keep strict P5-01 at 320→420 with a browser-only fixture override while preserving the user's demo source | Earlier test preserved; user demo source untouched |
| `tests/performance/phase-6-source-write.test.ts` | Created | P6-24 p50/p95 observations | No |
| `scripts/run-phase6-tests.mjs` | Created | Canonical Phase 6 runner and protected-tree digest | No |
| `package.json` | Modified | Phase 6 commands | Earlier scripts preserved |
| `.github/workflows/ci.yml` | Modified | Windows/Ubuntu Node 22/24 Phase 6 matrix | Earlier workflow preserved |
| `README.md` | Modified | Phase 6 capability and commands | Earlier documentation preserved |
| `spec/status/phase-6-status.md` | Created/finalized | This canonical evidence and traceability record | No |

The worktree already contained uncommitted Phase 0–5 work and a user change in `demo/vanilla-demo/style.css`; those changes were preserved. No dependency version was added or changed for Phase 6.

## Operating-system discovery and provisioning

| Candidate | Type | Inspection command | Result |
|---|---|---|---|
| Windows 11 | Native host | `Get-Process node`; Phase 6 commands | Available and used. Node v24.14.0 x64; Chrome channel used by Playwright. |
| WSL/Linux | Compatibility layer | `wsl.exe -l -v` | Exit 1: WSL has no installed distributions. Installing one is host-level provisioning and was not performed. |
| Docker/Linux | Container | `docker info` | Exit 1: client exists, daemon pipe is absent; config access also denied. No usable container runtime. |
| VirtualBox/VMware | VM | `Get-Command VBoxManage,vmrun` | Neither command exists. |
| GitHub Actions | Remote CI | `.github/workflows/ci.yml`; `gh auth status` | Phase 6 Windows/Ubuntu matrix is configured, but local `gh` token is invalid, so it could not be dispatched or inspected remotely. |

**The implementation may be complete on the available operating system, but the implementation plan’s full cross-platform phase gate has not been verified.** React component/reuse behavior and the Vite-served metadata adapter pass on Windows.

## Canonical test traceability matrix

| Test ID | Requirement and expected result | Test type | Test location | Execution command | Windows environment | Windows result | Windows evidence | Unix environment | Unix result | Unix evidence | Overall status | Notes or blocker |
| ------- | ------------------------------- | --------- | ------------- | ----------------- | ------------------- | -------------- | ---------------- | ---------------- | ----------- | ------------- | -------------- | ---------------- |
| P6-01 | Unique Vanilla ID 320→420 changes only its declaration, HMR/reloads to 420, no metadata on disk. | Integration, End-to-end | `phase-6-source-editor.test.ts`; `phase-6-persistence.spec.ts` | `npm.cmd run test:phase6:integration`; `npm.cmd run test:phase6:e2e` | Windows native | Passed | Clicking inner `h2` selected the owning card; a 420.4px preview normalized to 420px; real Vite/Chrome persisted after live update/reload; source HTML had no runtime metadata. Exit 0. | No Unix runtime | Not verified | WSL absent; Docker daemon absent; remote CI unavailable. | Partially verified | Windows behavior passed; Unix required. |
| P6-02 | Unique class changes once; comments, whitespace, EOL, and unrelated matching text remain exact. | Integration | `phase-6-source-editor.test.ts` P6-02 | `npm.cmd run test:phase6:integration` | Windows native | Passed | Golden byte comparison passed. Exit 0. | No Unix runtime | Not verified | Same environment blocker. | Partially verified | Unix required. |
| P6-03 | Duplicate/overridden owner is ambiguous/probable; evidence shown, Apply disabled, disk unchanged. | Integration, End-to-end | Phase 6 integration and E2E P6-03 | Phase 6 integration/E2E commands | Windows native | Passed | Real browser showed `ambiguous`, candidate source evidence, disabled Apply, unchanged bytes. Exit 0. | No Unix runtime | Not verified | Same environment blocker. | Partially verified | Unix required. |
| P6-04 | Invalid widths reject before mapping/write and do not alter acceptance/source state. | Integration, Regression | Phase 6 P6-04; Phase 5 P5-08 | `npm.cmd run test:phase6`; includes Phase 5 regression | Windows native | Passed | Negative, fractional, nonfinite, zero, and >10000 values rejected; proposal-schema regression passed. Exit 0. | No Unix runtime | Not verified | Same environment blocker. | Partially verified | Unix required. |
| P6-05 | React plain CSS identifies component/file/style rule and persists one minimal diff after Vite HMR. | Integration, End-to-end | Phase 6 P6-05 in integration and E2E | Phase 6 integration/E2E commands | Windows native | Passed | Real Vite output carried `PricingCard`, JSX file/range, `PricingCard:annual`, prop names, CSS owner, and reuse state; one `styles.css` diff persisted after HMR. Source JSX contained no metadata. Exit 0. | No Unix runtime | Not verified | Unix was explicitly skipped/unavailable. | Partially verified | Windows implementation complete; Unix required for full gate. |
| P6-06 | CSS Module edit changes only the imported module rule. | Integration | Phase 6 P6-06 | `npm.cmd run test:phase6:integration` | Windows native | Passed | Imported module changed; similarly named global file stayed exact. Exit 0. | No Unix runtime | Not verified | Same environment blocker. | Partially verified | Unix required. |
| P6-07 | Tailwind `w-80`→`w-96` changes only the exact static token. | Integration | Phase 6 P6-07 | Integration command | Windows native | Passed | Token/order/other classes preserved. Exit 0. | No Unix runtime | Not verified | Same environment blocker. | Partially verified | Unix required. |
| P6-08 | Unconfigured 420px becomes `w-[420px]` without inline/global/config change. | Integration | Phase 6 P6-08 | Integration command | Windows native | Passed | One arbitrary token written; no inline style. Exit 0. | No Unix runtime | Not verified | Same environment blocker. | Partially verified | Unix required. |
| P6-09 | Responsive edit requires explicit breakpoint and changes only that variant. | Integration | Phase 6 P6-09 | Integration command | Windows native | Passed | No intent was ambiguous; `md` intent changed only `md:w-80`. Exit 0. | No Unix runtime | Not verified | Same environment blocker. | Partially verified | Unix required. |
| P6-10 | Dynamic class/width is not exact; Apply disabled; expression unchanged. | Integration, End-to-end | Phase 6 P6-10 in both files | Integration/E2E commands | Windows native | Passed | Real React browser showed `not-mapped`, disabled Apply; source bytes unchanged. Exit 0. | No Unix runtime | Not verified | Same environment blocker. | Partially verified | Unix required. |
| P6-11 | Reused component/route impact is shown and blocks until explicit shared/instance choice. | Integration, End-to-end | Phase 6 P6-11 in both files | Integration/E2E commands | Windows native | Passed | Route-file reuse and collection-rendered `PricingCard` reuse were mapped; runtime instance/style-owner/reused metadata was visible; Apply stayed disabled until shared approval. Exit 0. | No Unix runtime | Not verified | Unix was explicitly skipped/unavailable. | Partially verified | Shared-impact branch is proven on Windows; Unix required. |
| P6-12 | External change after mapping returns `FILE_STALE` without overwriting either change. | Integration | Phase 6 P6-12 | Integration command | Windows native | Passed | Hash/range CAS rejected stale plan and preserved external bytes. Exit 0. | No Unix runtime | Not verified | Same environment blocker. | Partially verified | Unix required. |
| P6-13 | Concurrent Applies serialize; second applies after remap or fails stale; no corruption. | Integration | Phase 6 P6-13 | Integration command | Windows native | Passed | Per-root lock produced one accepted edit and one safe rejection; file remained valid. Exit 0. | No Unix runtime | Not verified | Same environment blocker. | Partially verified | Unix required. |
| P6-14 | Absolute/traversal/drive/UNC/encoded/NUL paths reject before read/disclosure. | Integration, Security | Phase 6 P6-14 | Integration command | Windows native | Passed | All attack forms rejected `PATH_OUTSIDE_ROOT`. Exit 0. | No Unix runtime | Not verified | Same environment blocker. | Partially verified | Unix required. |
| P6-15 | Out-of-root symlink/junction rejects; outside file stays byte-identical. | Platform-specific, Integration | Phase 6 P6-15 | Integration command | Windows native | Passed | Real Windows junction rejected; outside bytes exact. Exit 0. | No Unix runtime | Not verified | Linux symlink behavior not executed. | Partially verified | Unix required. |
| P6-16 | Write denial/disk-full/short-write/rename failure preserves original and cleans temp. | Integration, Failure recovery | Phase 6 P6-16 | Integration command | Windows native | Passed | ENOSPC, truncated temp, and rename denial all rejected; source exact; no temp remained. Exit 0. | No Unix runtime | Not verified | Same environment blocker. | Partially verified | Disk-full represented by injected ENOSPC at transaction boundary. |
| P6-17 | Route 500/compile/page error rolls back exact bytes and healthy page returns. | Real HTTP integration, End-to-end | Phase 6 P6-17 integration and E2E | Integration/E2E commands | Windows native | Passed | Real route 500 restored bytes and HTTP 200; real browser page error rejected Apply, restored exact bytes, refreshed stale CSS, and verified the original rendered width. Exit 0. | No Unix runtime | Not verified | Same environment blocker. | Partially verified | Unix required. |
| P6-18 | Verification timeout rolls back at deadline; UI offers retry/reselect and never hangs. | Integration, End-to-end | Phase 6 P6-18 in both files | Integration/E2E commands | Windows native | Passed | 25ms injected stall rolled back; recovery verification is bounded and reports `RECOVERY_UNVERIFIED` if needed; UI offered retry/reselect. Exit 0. | No Unix runtime | Not verified | Same environment blocker. | Partially verified | 10s is configurable production default; shortened deterministic test deadline. |
| P6-19 | Rollback failure retains backup path/hash, reports critical, disables edits, never claims restoration. | Integration, End-to-end | Phase 6 P6-19 in both files | Integration/E2E commands | Windows native | Passed | Real transaction retained backup/hash; browser critical state disabled Apply. Exit 0. | No Unix runtime | Not verified | Same environment blocker. | Partially verified | Unix required. |
| P6-20 | UTF-8 BOM/CRLF/mode/comments/string duplicates preserved; only selected declaration differs. | Integration, Integrity | Phase 6 P6-20 | Integration command | Windows native | Passed | Exact byte/mode assertions passed. Exit 0. | No Unix runtime | Not verified | Same environment blocker. | Partially verified | Unix required. |
| P6-21 | Full React milestone persists in source/browser after hard refresh, remaps, changes no extra file. | End-to-end | Phase 6 E2E P6-21 | `npm.cmd run test:phase6:e2e` | Windows native Chrome | Passed | Real copied React/Vite project reached 420 live and after reload; remapped exact; only `src/styles.css` changed. Exit 0. | No Unix runtime | Not verified | Same environment blocker. | Partially verified | Unix milestone still required. |
| P6-22 | All supported edits repeat 20 times; earlier suites pass; no metadata/process/port/toolbar regression. | Integration, Regression | Phase 6 P6-22; canonical runner | `npm.cmd run test:phase6`; `npm.cmd run verify:leaks` | Windows native | Passed | 80 fresh-copy edits, all Phase 1–5 regressions, metadata idempotence, protected digest `f86b…e9827`, and port leak checks passed. Exit 0. | No Unix runtime | Not verified | Unix was explicitly skipped/unavailable. | Partially verified | Unix repetition still required. |
| P6-23 | Windows/Linux transforms produce equivalent canonical paths/semantics and preserve platform policy. | Cross-environment | Phase 6 path/byte suites | `npm.cmd run test:phase6:integration` | Windows native | Passed | Windows path, junction, BOM/CRLF/mode behaviors executed. Exit 0. | No Unix runtime | Not verified | No WSL distro, Docker daemon, VM, or authenticated CI. | Partially verified | Cross-environment comparison cannot be completed locally. |
| P6-24 | Record mapping/planning and atomic-write p50/p95; verification rolls back by configurable 10s. | Performance | `phase-6-source-write.test.ts` P6-24; P6-18 | `npm.cmd run test:phase6:performance` | Windows native, Node v24.14.0 x64 | Passed | 40 samples: mapping p50 3.582ms/p95 7.681ms; write p50 8.434ms/p95 17.701ms; 10s default deadline and P6-18 rollback. Exit 0. | No Unix runtime | Not verified | No Unix sample. | Partially verified | p95 budgets are observability-only under rule 8; results did not create a hard gate. |
| SUP-P6-01 | Vite-served React metadata includes component, source/range, runtime instance, props, is idempotent, and never changes source. | Integration, End-to-end | `phase-6-source-editor.test.ts` SUP-P6-01; `phase-6-persistence.spec.ts` P6-05 | Phase 6 integration/E2E commands | Windows native | Passed | Two host nodes received exact metadata; repeat transform was byte-identical; real React DOM exposed all fields while source JSX stayed clean. Exit 0. | No Unix runtime | Not verified | Unix was explicitly skipped/unavailable. | Partially verified | Supplementary adapter coverage. |

## Test command results

Final canonical evidence:

| Command | OS/environment | Category | Result | Exit |
|---|---|---|---|---:|
| `npm.cmd run test:phase6` | Windows native | Full Phase 6 + regressions | Build passed; Phase 6 integration 22/22; Phase 6 E2E 9/9; performance 1/1; Phase 5 integration 3/3, E2E 15/15, performance 1/1; Phase 4 integration 7/7, E2E 6/6, performance 1/1; selected Phase 3/2/1 regressions passed; protected digest `f86b…e9827` unchanged. | 0 |
| `npm.cmd run test:phase6:integration` | Windows native | Current phase | 22 passed, 0 failed, 0 skipped. | 0 |
| `npm.cmd run test:phase6:e2e` | Windows native Chrome + real Vite | Current phase E2E | 9 passed, 0 failed, 0 skipped. | 0 |
| `npm.cmd run verify:leaks` | Windows native | Cleanup | Ports 4510 and 4511 bindable; no owned test listener remained. | 0 |
| `npm.cmd run test:phase6:performance` | Windows native | Performance | 1 passed; 40 samples recorded. | 0 |
| `npm.cmd run test:phase5:e2e` | Windows native Chrome | Targeted regression during development | 15 passed. | 0 |
| `npm.cmd run test:phase5` | Windows native Chrome | Earlier-phase regression | Phase 5 integration 3/3, E2E 15/15, performance 1/1; Phase 4 and selected Phase 3/2/1 regressions passed. | 0 |
| `git diff --check` | Windows native | Final diff | No whitespace errors; only Git CRLF-conversion warnings. | 0 |

Development failures were retained as evidence and fixed rather than hidden:

- Three early `npx.cmd playwright test tests/e2e/phase-6-persistence.spec.ts` runs failed because Vite intentionally ignores `**/test-results/**`; copies were moved to `.reframe-test-artifacts` and the milestones then passed.
- One expanded E2E run failed three fixture assertions/geometry checks; candidate matching and top-of-page event dispatch were corrected, then 5/5 passed.
- `npx.cmd playwright test ... --grep "P6-03|P6-10|P6-11"` exited 1 because Windows command parsing treated `|` as shell operators; no test result was claimed and the complete suite was run instead.
- One full runner after adding timeout recovery failed P6-18 with transient Windows `EPERM` during rollback rename. A bounded retry for `EPERM`/`EACCES`/`EBUSY` was added; integration 21/21, E2E 7/7, and the final canonical full runner passed.
- The expanded P6-11 React run initially failed because sandboxed esbuild dependency optimization could not read a parent directory. The exact test passed outside the filesystem sandbox, as did the canonical suite.
- A full 8-test run exposed unsafe cross-file certainty in P6-03 and stale rendered CSS after P6-17 rollback. Cross-file owners now remain ambiguous, and rollback refreshes/reverifies the original rendered width; the next full run passed 8/8.

The recurring `NO_COLOR`/`FORCE_COLOR` Playwright warning is environmental and did not indicate a product defect. No product warning was suppressed.

## Performance observations

| Metric | Gate type | Workload/samples | Environment | p50 | p95 | Budget | Effect |
|---|---|---|---|---:|---:|---:|---|
| Mapping + planning | Observability-only | 40 unique Vanilla fixture copies | Windows native, Node v24.14.0 x64 | 3.582 ms | 7.681 ms | p95 500 ms | Recorded; non-blocking under governing rule 8. |
| Atomic transaction write | Observability-only | 40 unique files, real temp/fsync/rename | Same | 8.434 ms | 17.701 ms | p95 100 ms | Recorded; non-blocking under governing rule 8. |
| Verification deadline | Functional rollback deadline | Production default 10s; deterministic P6-18 uses 25ms | Windows native | N/A | N/A | Configurable 10s | P6-18 proved timeout rollback and retry UI. |

## Acceptance criteria

| Criterion | Status | Evidence |
|---|---|---|
| Unique Vanilla width persists and is the only source diff | Passed on Windows | P6-01 real Vite/Chrome and golden source test. |
| React plain CSS, CSS Modules, and Tailwind edit correctly | Passed on Windows | P6-05–P6-09, P6-21, and SUP-P6-01 prove Vite-served component/file/range/instance/props metadata, style ownership, and real HMR. |
| Tailwind preserves conventions and avoids invented inline style | Passed on Windows | P6-07–P6-10. |
| Apply is impossible below exact confidence | Passed on Windows | P6-03/P6-10/P6-11 browser checks. |
| Stale/out-of-root/shared/dynamic/unexpected scope blocks | Passed on Windows | P6-10–P6-15; P6-11 proves route-file and collection-render component reuse with explicit shared approval. |
| Writes are atomic and preserve unrelated bytes | Passed on Windows | P6-02, P6-12–P6-16, P6-20. |
| Failed verification rolls back or reports critical | Passed on Windows | P6-17–P6-19 prove route failure, browser page error, selected-width verification, timeout, rollback recovery verification, and critical fallback. |
| Complete React milestone persists after refresh | Passed on Windows | P6-21. Linux replay not verified. |

## Regression and cross-platform status

- Phase 5 regression suite: passed on Windows (proposal integration 3, selection E2E 15, long-drag performance 1).
- Phase 4 and selected Phase 3/2/1 regressions: passed on Windows through the canonical runner.
- Protected demo/fixture digest: `f86b27d83ebdb37d4eaa42742e9627651590320def979f132425dd5fcc5e9827` before and after.
- Cross-platform gate: **Partially verified**. Windows passed the implemented suite; Unix is Not verified.

## Known issues and limitations

1. Linux/macOS execution was explicitly skipped and is unavailable locally. CI is configured for Windows and Ubuntu Node 22/24, but no authenticated runner result exists.
2. Cross-browser Phase 5 configuration remains in CI; only installed Windows Chrome was available locally.
3. One first combined regression run observed a transient protected-tree digest mismatch. An isolated full Phase 5 rerun and the final canonical Phase 6 rerun both produced identical `f86b…e9827` before/after digests; no source mutation remained.

## Exact stopping point

- Implemented: **Phase 6 guarded persistent source edit**, through a working Windows Vanilla/React plain-CSS milestone, CSS Module/Tailwind transforms, and guarded transaction/recovery behavior.
- Implementation status: **Complete on Windows**, including Vite-served React metadata; overall verification remains partial because Unix was skipped/unavailable.
- Full phase gate: **Not met only because Unix evidence is missing**; the Windows implementation gate is complete.
- Last verified named test: **P6-24** on Windows; overall cross-platform status Partially verified.
- Next phase: **Phase 7 remains untouched.**
- Continue only with an explicit instruction such as `verify Phase 6 on Linux` or `start Phase 7 accepting the recorded Unix limitation`.
