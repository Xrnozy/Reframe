# Phase 11 status

Status: **Implementation complete on Windows; full cross-platform gate not verified.** Phase 12 Reference Adaptation remains untouched.

## Selected agent and skill

- Agent: Reframe Phase Implementation Agent (primary Codex implementation agent).
- Skill: `ponytail:ponytail`, full intensity. It kept Phase 11 local-first and dependency-free: native JSON files, `fs.watch`, existing WebSocket protocol, existing Shadow DOM UI, and the repository's Playwright/Vitest harness.
- Limitations: Ponytail does not replace source-of-truth requirements or test evidence. Optional replies, screenshot attachments, arrows, accounts, cloud synchronization, and presence were not added because the Phase 11 minimum does not require them.

## Implementation summary

Phase 11 adds source-anchored asynchronous comments with one versioned JSON file per discussion under `.reframe/annotations`. Users can create pins, comments, and optional highlights; resolve or reopen a discussion; see filesystem/Git-pulled changes; review orphaned, ambiguous, conflicted, invalid, and unsupported records; filter by route/checkpoint; and explicitly promote a comment into a separate Design DNA proposal.

The store validates schema, paths, text, UUIDs, source evidence, and real-path containment. Creates and replacements are atomic and clean temporary files on failure. The browser renders untrusted text with `textContent` inside Reframe's isolated Shadow DOM and never uses screen coordinates as the only persistent anchor. Reframe watches the annotation folder but never invokes Git.

The Phase 7 private-history ignore rule was narrowed from the legacy `*` rule to `history/` plus `.gitignore`, so Phase 11 annotations can be committed. The Phase 11 store atomically migrates only the exact legacy Reframe-generated `*` file; custom ignore policies are preserved.

## Changed files

| File | Change | Purpose | Pre-existing user changes |
| --- | --- | --- | --- |
| `packages/dev-server/src/annotations.ts` | Created | Versioned annotation store, validation, anchoring, atomic I/O, watcher, conflict states, checkpoint filtering, and DNA proposal promotion. | No; Phase 11 file. |
| `packages/dev-server/src/index.ts` | Modified | Exports the Phase 11 store. | File contained earlier-phase work, preserved. |
| `packages/dev-server/src/history.ts` | Modified | Makes annotations Git-trackable while history remains private; fixes legacy compatibility. | File contained Phase 7 work, preserved. |
| `packages/dev-server/src/proxy.ts` | Modified | Owns the store and handles annotation protocol messages and watcher broadcasts. | File contained earlier-phase work, preserved. |
| `packages/dev-server/src/websocket-server.ts` | Modified | Routes validated annotation messages. | File contained earlier-phase work, preserved. |
| `packages/shared/src/protocol.ts` | Modified | Adds strict annotation request/result/state schemas. | File contained earlier-phase work, preserved. |
| `packages/browser-client/src/index.ts` | Modified | Adds isolated Comments UI, pins/highlights, review states, resolve/reopen, and explicit DNA promotion. | File contained earlier-phase UI work, preserved. |
| `tests/integration/phase-11-annotations.test.ts` | Created | Implements P11-03 through P11-14 and P11-16. | No. |
| `tests/e2e/phase-11-comments.spec.ts` | Created | Implements P11-01, P11-02, and P11-15 in real Chromium/Vite/proxy flows. | No. |
| `tests/performance/phase-11-annotations.test.ts` | Created | Implements hard gate P11-17. | No. |
| `package.json` | Modified | Adds Phase 11 build/test/regression scripts. | File contained earlier-phase scripts, preserved. |
| `README.md` | Modified | Documents the Phase 11 comments workflow and storage behavior. | File contained earlier-phase documentation, preserved. |
| `spec/status/phase-11-status.md` | Created | This canonical evidence record and completion report. | No. |

Pre-existing broad working-tree changes from Phases 0-10 and the user's `demo/vanilla-demo/style.css` and `.reframe` data were preserved. No broad formatting or dependency-version rewrite was performed.

## Operating-system discovery and provisioning

| Operating system | Environment type | Discovery/inspection | Provisioning attempted | Result |
| --- | --- | --- | --- | --- |
| Windows 10 | Native host | PowerShell/Node/npm and native Playwright Chromium were available in the workspace. | Not needed. | Used for all Phase 11 tests and affected regressions. |
| Linux through WSL | Compatibility layer | Existing WSL command was inspected during preparation. | Not run because the user explicitly directed this project to skip Linux/Unix verification. | Not verified. |
| Linux container | Container | Docker availability was inspected during preparation. | Not run by user direction; no new infrastructure was created. | Not verified. |
| Existing CI | Remote runners | `.github/workflows/ci.yml` was inspected. | No remote upload/dispatch was authorized. | Not used. |

The user-owned Reframe process on port 4400 was preserved. Test fixtures used unique temporary copies and no Phase 11-owned process or port remained after testing.

## Canonical test traceability matrix

This is the single canonical Phase 11 traceability matrix and is derived only from executed evidence.

| Test ID | Requirement and expected result | Test type | Test location | Execution command | Windows environment | Windows result | Windows evidence | Unix environment | Unix result | Unix evidence | Overall status | Notes or blocker |
| ------- | ------------------------------- | --------- | ------------- | ----------------- | ------------------- | -------------- | ---------------- | ---------------- | ----------- | ------------- | -------------- | ---------------- |
| P11-01 | Create a mapped pin/comment/highlight; restart; one valid file and the exact card/route are restored. | End-to-end | `tests/e2e/phase-11-comments.spec.ts` - P11-01 | `npm.cmd run test:phase11` | Windows native, Chromium | Passed | Combined E2E 3/3, exit 0; UUID file, exact pin/highlight, restart, and unchanged source verified. | Not run by user direction | Not verified | No Unix execution. | Partially verified | Windows behavior complete. |
| P11-02 | Resolve and reopen; only that annotation file changes and the intact thread survives restart. | End-to-end | Same file - P11-02 | Same | Windows native, Chromium | Passed | Combined E2E 3/3, exit 0; status/history survived two restarts and comment stayed intact. | Not run by user direction | Not verified | No Unix execution. | Partially verified | Windows behavior complete. |
| P11-03 | Git-pulled annotation loads in clone B after a watched change; Reframe performs no synchronization. | Integration | `tests/integration/phase-11-annotations.test.ts` - P11-03 | `npm.cmd run test:phase11:integration` | Windows native | Passed | 13/13, exit 0; real bare remote/two clones/push/pull, one watcher load, exact anchor; legacy ignore migrated so annotations were trackable. | Not run by user direction | Not verified | No Unix execution. | Partially verified | Git invoked only by test harness. |
| P11-04 | Moved source relocates only from unique high-confidence source evidence, never old coordinates. | Integration | Same file - P11-04 | Same | Windows native | Passed | Unique source-line hash relocated `index.html` to `moved.html` with explicit evidence. | Not run by user direction | Not verified | No Unix execution. | Partially verified | No coordinate fallback. |
| P11-05 | Deleted or indistinguishable targets remain Orphaned/Ambiguous and are not guessed onto an element. | Integration | Same file - P11-05 | Same | Windows native | Passed | Deleted source became orphaned; duplicate evidence became ambiguous with no resolved source. | Not run by user direction | Not verified | No Unix execution. | Partially verified | Browser also requires one unique fingerprint match. |
| P11-06 | Malformed JSON, conflict markers, wrong types, and unsupported versions are isolated/reported while valid files remain. | Integration | Same file - P11-06 | Same | Windows native | Passed | All invalid cases reported independently; valid annotation loaded; all five files remained. | Not run by user direction | Not verified | No Unix execution. | Partially verified | Per-file degradation verified. |
| P11-07 | Duplicate IDs report both filenames and overwrite neither file. | Integration | Same file - P11-07 | Same | Windows native | Passed | Both duplicate views named both files; neither file changed. | Not run by user direction | Not verified | No Unix execution. | Partially verified | Windows passed. |
| P11-08 | Script/event/unsafe-protocol/huge content is rejected or rendered safely with no execution/navigation. | Integration, Security | Same file - P11-08 | Same | Windows native | Passed | Unsafe payloads rejected, 4,097 chars rejected, and permitted markup remained literal text for `textContent`. | Not run by user direction | Not verified | No Unix execution. | Partially verified | Validation errors are explicit. |
| P11-09 | Traversal, absolute, symlink/junction escape, device, and unsafe source paths are rejected before outside access. | Integration, Security | Same file - P11-09 | Same | Windows native | Passed | Real Windows junction plus traversal, drive/Unix absolute, backslash, and device cases rejected. | Not run by user direction | Not verified | No Unix execution. | Partially verified | Real-path containment verified. |
| P11-10 | Disk-full/write failure leaves no partial record, retains retry capability, and changes no source/history. | Integration, Failure recovery | Same file - P11-10 | Same | Windows native | Passed | Injected ENOSPC left no JSON/temp; source/history unchanged; retry succeeded. | Not run by user direction | Not verified | No Unix execution. | Partially verified | Atomic cleanup verified. |
| P11-11 | Simultaneous creates/independent updates use separate files and watcher exposes one complete final state. | Integration, Concurrency | Same file - P11-11 | Same | Windows native | Passed | Two UUID files remained distinct; update burst produced one complete debounced state. | Not run by user direction | Not verified | No Unix execution. | Partially verified | Windows passed. |
| P11-12 | Same-file Git conflict is disclosed, both sides remain verbatim, and Reframe never auto-resolves. | Integration, Concurrency | Same file - P11-12 | Same | Windows native | Passed | `ANNOTATION_GIT_CONFLICT` surfaced and raw conflict bytes remained identical. | Not run by user direction | Not verified | No Unix execution. | Partially verified | No auto-resolution. |
| P11-13 | Current/older checkpoint relationships filter or label accurately without changing current source. | Integration | Same file - P11-13 | Same | Windows native | Passed | Related/other labels and route render count were exact; source bytes unchanged. | Not run by user direction | Not verified | No Unix execution. | Partially verified | Windows passed. |
| P11-14 | DNA promotion requires separate confirmation and creates a scoped proposal without rewriting DNA tokens. | Integration | Same file - P11-14 | Same | Windows native | Passed | Unconfirmed action rejected; confirmed action wrote one needs-review proposal; tokens stayed byte-identical. | Not run by user direction | Not verified | No Unix execution. | Partially verified | Phase 9 DNA is not auto-updated. |
| P11-15 | Comments coexist with Direct Edit, HMR, restore, and comparison without duplicate/lost/blocked/source-write behavior. | End-to-end, Regression | `tests/e2e/phase-11-comments.spec.ts` - P11-15 | `npm.cmd run test:phase11` | Windows native, Chromium | Passed | Combined E2E 3/3, exit 0; real Vite reload, edit, comparison, restore, one pin/file, unchanged source. | Not run by user direction | Not verified | No Unix execution. | Partially verified | Windows regression passed. |
| P11-16 | Windows UTF-8 files must remain portable through Linux and back, including IDs, timestamps, paths, anchors, and watcher behavior. | Cross-environment | `tests/integration/phase-11-annotations.test.ts` - P11-16 | `npm.cmd run test:phase11:integration` | Windows native | Passed | UTF-8 author/comment/component, non-ASCII forward-slash path, LF JSON, IDs/timestamps, and exact anchor round-tripped on Windows. | Not run by user direction | Not verified | Linux update/return half not executed. | Partially verified | Full cross-platform gate cannot pass. |
| P11-17 | 1,000 annotation parse/index p95 <=1s; route render bounded; 100-file burst coalesced with no missed final state. | Performance, Hard gate | `tests/performance/phase-11-annotations.test.ts` - P11-17 | `npm.cmd run test:phase11` | Windows native | Passed | 7 post-warm-up samples: p50 204.99ms, p95 219.42ms; parsed 1,000, rendered 50, 100 files, 1 final callback; exit 0. | Not run by user direction | Not verified | No Unix execution. | Partially verified | Explicit Windows hard gate passed; Unix not verified. |
| REG-P10 | Required Phase 10 time-machine regression remains green. | Regression, End-to-end | `tests/e2e/phase-10-time-machine.spec.ts` | `npm.cmd run test:phase11:regression` | Windows native, Chromium | Passed | 14/14, exit 0; P10-14 p95 0.1ms, list 6.6ms, bounded cache 1. | Not run by user direction | Not verified | No Unix execution. | Partially verified | Executed before final annotation-only/ignore compatibility adjustment; shared history then rerun below. |
| REG-P9 | Required Phase 9 Design DNA regression remains green. | Regression, Integration | `tests/integration/phase-9-design-dna.test.ts` | Same regression command | Windows native | Passed | 15/15, exit 0. | Not run by user direction | Not verified | No Unix execution. | Partially verified | No Phase 9 behavior changed afterward. |
| REG-P8 | Required Phase 8 AI edit regression remains green. | Regression, End-to-end | `tests/e2e/phase-8-ai-edit.spec.ts` | Same regression command | Windows native, Chromium | Passed | 1/1, exit 0. | Not run by user direction | Not verified | No Unix execution. | Partially verified | No Phase 8 behavior changed afterward. |
| REG-P7 | Required Phase 7 history/checkpoint/restore behavior remains green after the ignore compatibility fix. | Regression, Integration, End-to-end | `tests/integration/phase-7-history.test.ts`; `tests/e2e/phase-7-history.spec.ts` | `npm.cmd run test:phase7:integration`; `npm.cmd run test:phase7:e2e` | Windows native, Chromium | Passed | Latest runs: integration 14/14 and E2E 5/5, both exit 0. | Not run by user direction | Not verified | No Unix execution. | Partially verified | Directly covers the one shared file changed late. |
| REG-P4 | Required WebSocket regression remains green. | Regression, Integration | `tests/integration/phase-4-websocket.test.ts` | `npm.cmd run test:phase11:regression` | Windows native | Passed | 7/7, exit 0. | Not run by user direction | Not verified | No Unix execution. | Partially verified | Passed in full regression command. |
| REG-P2 | Required project/runtime regression remains green. | Regression, Integration | `tests/integration/phase-2-project.test.ts` | Same regression command | Windows native | Passed | 19/19, exit 0. | Not run by user direction | Not verified | No Unix execution. | Partially verified | Passed in full regression command. |

## Test-command results

| Command | OS/environment | Category | Result | Exit |
| --- | --- | --- | --- | --- |
| `npm.cmd run test:phase11:regression` | Windows native, Vitest/Chromium | Required earlier-phase regression | P10 14/14, P9 15/15, P8 1/1, P7 E2E 5/5, P4 7/7, P2 19/19; no failures/skips. | 0 |
| `npm.cmd run build` | Windows native | Build | TypeScript project build passed; no compile error. | 0 |
| `npm.cmd run test:phase11:integration` | Windows native, Vitest | P11-03..P11-14, P11-16 | 13 passed, 0 failed, 0 skipped. | 0 |
| `npm.cmd run test:phase7:integration` | Windows native, Vitest | Affected Phase 7 regression | 14 passed, 0 failed, 0 skipped. | 0 |
| `npm.cmd run test:phase11` | Windows native, TypeScript/Vitest/Chromium | Complete Phase 11 gate | Build passed; integration 13/13; E2E 3/3; performance 1/1; no failures/skips. `NO_COLOR`/`FORCE_COLOR` Playwright warning was environmental, not a product defect. | 0 |
| `npm.cmd run test:phase7:e2e` | Windows native, Chromium | Affected Phase 7 browser regression | 5 passed, 0 failed, 0 skipped. | 0 |
| `git diff --check` | Windows native | Diff hygiene | No whitespace error; Git printed existing LF-to-CRLF conversion warnings only. | 0 |

## Performance observations

| Metric | Gate type | Workload/samples | Environment | Observed | Plan threshold | Completion effect |
| --- | --- | --- | --- | --- | --- | --- |
| Parse/index p50 | Hard-gate measurement | 1 warm-up plus 7 measured loads of 1,000 annotation files | Windows native, Node/Vitest | 204.99ms | Supporting statistic | None; recorded. |
| Parse/index p95 | Hard | Same | Windows native, Node/Vitest | 219.42ms | <=1,000ms | Passed. |
| Current-route render bound | Hard functional condition | 1,000 annotations across routes | Same | 50 current-route entries | Must remain route-bounded | Passed. |
| Watcher burst | Hard functional condition | 100 annotation file writes | Same | 1 coalesced callback; all 100 final files parsed | Coalesced without missing final state | Passed. |

## Acceptance criteria

- **Passed on Windows:** Create, reload, resolve, and reopen a source-anchored pin/comment/highlight. Evidence: P11-01 and P11-02.
- **Passed on Windows:** Each action is isolated to one annotation file and never application source. Evidence: P11-01, P11-02, P11-10, and P11-15.
- **Passed on Windows:** Valid annotations survive restart and a normal real Git clone/add/commit/push/pull flow without Reframe invoking Git. Evidence: P11-03.
- **Passed on Windows:** Movement/removal, ambiguous mapping, malformed JSON, merge conflict, duplicate ID, and unsupported schema remain visible and are not silently misplaced or lost. Evidence: P11-04 through P11-07 and P11-12.
- **Passed on Windows:** Comment content renders safely and file access remains contained. Evidence: P11-08 and P11-09.
- **Passed on Windows:** Route/checkpoint filtering avoids showing irrelevant annotations as current. Evidence: P11-13.
- **Passed:** No account, cloud, real-time cursor, presence, automatic pull/push, or synchronization server was introduced. Evidence: implementation inspection plus P11-03.
- **Partially verified:** Cross-environment portability. Windows half passed P11-16; Linux/Unix half was skipped by user direction.

## Regression and cross-platform status

Phase 1-10 functionality covered by the Phase 11 regression command passed on Windows. After the late shared Phase 7 ignore-rule correction, the complete Phase 7 integration suite (14/14) and browser suite (5/5) were rerun and passed. No regression was detected.

Cross-platform gate status: **Implementation complete on available OS; other OS Not verified.**

The implementation may be complete on the available operating system, but the implementation plan's full cross-platform phase gate has not been verified.

## Known issues and limitations

- P11-16's Linux update-and-return half is Not verified by explicit user direction, so Phase 11 cannot be called fully gate-complete across platforms.
- The migration rewrites only the exact legacy Reframe-generated `.reframe/.gitignore` content `*`. A custom user ignore file that excludes annotations is intentionally preserved and must be adjusted by that user before Git will track annotations.
- Optional reply threads, screenshot attachments, arrows, accounts, cloud synchronization, and presence remain unimplemented because they are outside the Phase 11 minimum.
- A user-owned Reframe server is listening on port 4400 and was deliberately not stopped or modified.
- No test-owned Phase 11 temporary fixture or listener remained after the final test runs.

## Exact stopping point

- Implemented phase: Phase 11 - Async Comments.
- Implementation state: complete and passing on Windows.
- Full phase gate: not met only because required Unix verification was skipped/not verified.
- Final verified capability: create, persist, Git-share, reload, resolve/reopen, safely review, checkpoint-filter, and explicitly promote source-anchored comments without application-source writes.
- Last verified named test: P11-17.
- Next untouched phase: Phase 12 - Reference Adaptation.
- To continue: explicitly instruct `start Phase 12` or request Unix verification of Phase 11.
