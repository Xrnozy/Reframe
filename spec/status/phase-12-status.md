# Phase 12 status

Status: **Implementation complete on Windows; Unix Not verified. Full cross-platform phase gate not met.**

Phase 12 adds controlled Reference Adaptation and stops at the final phase boundary in `implementation-plan.md`. Phase 13 does not exist in the source-of-truth plan.

## Selected agent and skill

- Agent: Reframe Phase Implementation Agent (primary Codex implementation agent).
- Skill: Ponytail, full mode. It kept the implementation inside the existing proxy, AI-review, Design DNA, screenshot, and history systems with no new dependency.
- Important restriction: reuse native/platform features and existing architecture; do not add speculative abstractions or later-phase work.

## Implementation summary

- Added bounded intake for PNG screenshots, site screenshots, hand sketches, Markdown, safe Figma JSON, and approved Design DNA references.
- Added magic-byte validation, active SVG/PDF/archive/compressed-content rejection, PNG metadata stripping, Markdown copy/URL/secret sanitization, Figma tree bounding, explicit persistence consent, canonical storage, and session cleanup.
- Added evidence/confidence for all eight borrowing characteristics. Static-image interaction and responsive evidence remain `Unknown`.
- Added a toolbar Reference workflow with explicit choices, Preserve DNA default, target/placement, uncertainty confirmation, complete plan review, approval, and frozen plan hash.
- Extended the Phase 8 packet, proposal/copy/DNA/scope guards, provider deadline, temporary review, screenshot-first Compare, mobile/tablet/desktop verification, exact Reject/Stop recovery, and accepted checkpoint metadata.
- Added the official synthetic preserve-brand demonstration and named P12-01 through P12-18 tests.
- No Phase 13 or speculative post-Phase-12 feature was started.

## Changed files

| File | Change | Purpose | Pre-existing user changes |
| --- | --- | --- | --- |
| `packages/dev-server/src/references.ts` | Created | Reference validators, sanitizer, analyzer, storage, plan, packet, and copy guard. | No. |
| `packages/dev-server/src/ai-edit.ts` | Modified | Reference packet, plan/DNA/copy guards, responsive verification, comparison screenshot, checkpoint data. | File existed from earlier phases. |
| `packages/dev-server/src/proxy.ts` | Modified | Authenticated reference HTTP endpoints, approved-DNA path, reference-aware generation, comparison image. | File existed from earlier phases. |
| `packages/dev-server/src/history.ts` | Modified | Reference-aware checkpoint metadata. | File existed from earlier phases. |
| `packages/dev-server/src/index.ts` | Modified | Public Phase 12 exports. | File existed from earlier phases. |
| `packages/browser-client/src/index.ts` | Modified | Reference toolbar/dialog, plan review/freeze, upload, approved DNA choice, screenshot-first Compare. | File existed from earlier phases. |
| `packages/shared/src/protocol.ts` | Modified | Optional frozen `referencePlanId` on AI generation. | File existed from earlier phases. |
| `packages/cli/src/screenshot-capture.ts` | Modified | Real 375/768/1280 overflow and basic accessibility verification. | File existed from earlier phases. |
| `packages/cli/src/run.ts` | Modified | Connect responsive verification to the proxy. | File existed from earlier phases. |
| `tests/integration/phase-12-reference-adaptation.test.ts` | Created | P12-01 through P12-17 strict integration coverage. | No. |
| `tests/e2e/phase-12-reference-adaptation.spec.ts` | Created | Official P12-01/P12-14 real Vite/Chrome flow. | No. |
| `tests/performance/phase-12-reference-adaptation.test.ts` | Created | P12-18 hard measurements. | No. |
| `tests/helpers/port-probe.ts` | Modified | Avoid well-known Windows ports and retry high-port collisions. | Shared earlier-phase test helper. |
| `tests/integration/phase-1-cli.test.ts` | Modified | Make P1-06 use its own occupied dynamic port instead of colliding with the user's live port 4400. | Earlier-phase test only. |
| `package.json` | Modified | Phase 12 build/test/regression commands. | Contained earlier-phase scripts. |
| `README.md` | Modified | Reference workflow and verification commands. | Contained earlier-phase documentation. |
| `spec/status/phase-12-status.md` | Created/finalized | This canonical evidence record. | No. |

The user's `demo/vanilla-demo/style.css`, `demo/vanilla-demo/.reframe`, and broad prior-phase worktree changes were preserved and not rewritten for Phase 12.

## Operating-system discovery and provisioning

| OS/environment | Discovery or command | Result |
| --- | --- | --- |
| Windows native | Host inspection and all commands below | Available; Node v24.14.0, x64. Phase 12 and Phase 0-11 regression evidence passed. |
| WSL 2 compatibility layer | `wsl.exe --status`; `wsl.exe --list --verbose` | WSL 2 is configured as default, but no Linux distribution is installed. No test environment available. |
| Docker Linux container | `docker version` and repository container/config inspection | Docker CLI exists, but daemon/config access is unavailable. No usable container. |
| Existing CI | `.github/workflows/ci.yml` inspection | Existing Windows/Ubuntu matrix covers Phase 6 only; no existing Phase 12 job or already-exposed remote runner was available. It was not changed or dispatched. |

No paid infrastructure, credentials, external upload, new VM, Linux distribution, or host-level component was provisioned. The user previously directed Unix/Linux verification to be skipped, so all Unix cells remain honestly `Not verified`.

## Canonical test traceability matrix

| Test ID | Requirement and expected result | Test type | Test location | Execution command | Windows environment | Windows result | Windows evidence | Unix environment | Unix result | Unix evidence | Overall status | Notes or blocker |
| ------- | ------------------------------- | --------- | ------------- | ----------------- | ------------------- | -------------- | ---------------- | ---------------- | ----------- | ------------- | -------------- | ---------------- |
| P12-01 | Screenshot borrows only structure/arrangement under Preserve DNA; project traits remain authoritative and reference brand/copy/assets do not transfer. | Integration, End-to-end | `tests/integration/phase-12-reference-adaptation.test.ts`; `tests/e2e/phase-12-reference-adaptation.spec.ts` | `npm.cmd run test:phase12` | Windows native, Chrome | Passed | Integration 21/21 and E2E 1/1; packet has only two evidence keys; plan preserves colors/typography; accepted source uses existing CSS. Exit 0. | WSL unavailable; Docker unavailable | Not verified | No Unix runtime. | Partially verified | Windows behavior passed; Unix gate missing. |
| P12-02 | Markdown sends only sanitized density/navigation sections and preserves unselected traits. | Integration | `tests/integration/phase-12-reference-adaptation.test.ts` (`P12-02`) | `npm.cmd run test:phase12:integration` | Windows native | Passed | Comments, URL canary, CRLF, and unrelated data removed; selected evidence exact. Exit 0. | Same | Not verified | No Unix runtime. | Partially verified | — |
| P12-03 | Approved DNA reference uses local ID/version without duplicating an asset. | Integration | Same (`P12-03`) | Same | Windows native | Passed | `approved-dna` descriptor has ID/version and no local asset path/raw bytes. Exit 0. | Same | Not verified | No Unix runtime. | Partially verified | Toolbar also exposes approved DNA ID/version. |
| P12-04 | Low-resolution sketch labels uncertain/static behavior Unknown and requires confirmation. | Integration | Same (`P12-04`) | Same | Windows native | Passed | Low structural confidence; interaction/responsive Unknown; unconfirmed plan rejected. Exit 0. | Same | Not verified | No Unix runtime. | Partially verified | — |
| P12-05 | Near-limit image records bounding transformation, retains selected evidence, and stays in packet budget. | Integration | Same (`P12-05`) | Same | Windows native | Passed | 6000x6000 accepted within configured pixel bound; ancillary metadata stripped; packet <=256 KiB. Exit 0. | Same | Not verified | No Unix runtime. | Partially verified | Oversized dimensions reject precisely. |
| P12-06 | Spoof/corrupt/password/active/archive/compressed input rejects before persistence/provider/write with no leak. | Security, Failure recovery | Same (`P12-06`, five cases) | Same | Windows native | Passed | Specific codes for spoofed PNG, corrupt Figma, encrypted PDF, active SVG, and archive; source exact; no persisted file. Exit 0. | Same | Not verified | No Unix runtime. | Partially verified | — |
| P12-07 | Missing target/placement/choices/brand/frozen plan names decisions and performs no generation/write. | Invalid input, Integration | Same (`P12-07`) | Same | Windows native | Passed | Exact missing-decision list; draft packet rejected as not frozen; source unchanged. Exit 0. | Same | Not verified | No Unix runtime. | Partially verified | UI enforces the same decisions. |
| P12-08 | Canary logo/brand/copy/tracking/URL/assets do not enter packet/result; copy guard blocks reproduction. | Security, Integration | Same (`P12-08`) | Same | Windows native | Passed | Packet canary scan clean; literal provider transfer rejected `REFERENCE_COPY_GUARD`. Exit 0. | Same | Not verified | No Unix runtime. | Partially verified | — |
| P12-09 | Private metadata/traversal/outside link are rejected or stripped; persistence remains canonical. | Security, Privacy | Same (`P12-09`) | Same | Windows native | Passed | Traversal filename and outside junction rejected; metadata canaries stripped; path under `.reframe/references/<uuid>.png`. Exit 0. | Same | Not verified | No Unix runtime. | Partially verified | Windows junction is real filesystem behavior, not a platform mock. |
| P12-10 | Analyzer timeout/partial output is finite, incomplete, unfreezable, and source-safe. | Failure recovery | Same (`P12-10`) | Same | Windows native | Passed | 10 ms injected deadline returns incomplete descriptor; freeze blocked; source exact. Exit 0. | Same | Not verified | No Unix runtime. | Partially verified | Production default is finite 5 s. |
| P12-11 | Provider failure/Stop/stale/verification failure restores exact source and never accepts. | Failure recovery, Regression | Same (`P12-11`) plus Phase 8 regressions | Same; `npm.cmd run test:phase12:regression` evidence resumed after harness repair | Windows native | Passed | Provider and temporary-verification failures rolled back; Phase 8 25/25; source exact. Exit 0 for final runs. | Same | Not verified | No Unix runtime. | Partially verified | User's live port 4400/process remained untouched. |
| P12-12 | Preserve mode blocks new font/radius/color or DNA mutation. | Design DNA, Security | Same (`P12-12`) | `npm.cmd run test:phase12:integration` | Windows native | Passed | Review reports `DESIGN_DNA_CONFLICT`; Accept rejects; no DNA file appears; Reject restores. Exit 0. | Same | Not verified | No Unix runtime. | Partially verified | DNA proposals remain separate Phase 9 review. |
| P12-13 | Static reference proves no responsive behavior; real mobile/tablet/desktop checks pass or block acceptance. | Responsive, Integration, End-to-end | Same (`P12-13`); E2E responsive callback | `npm.cmd run test:phase12` | Windows native, real Chrome | Passed | 375/768/1280 recorded; injected 375 overflow blocks Accept; official E2E verifies all three against real Vite page. Exit 0. | Same | Not verified | No Unix runtime. | Partially verified | Static evidence omits responsive key. |
| P12-14 | Select→intake→choices→plan→Generate→screenshot Compare→Reject, repeat→Accept; exact rollback and complete checkpoint. | End-to-end, Integration | Integration (`P12-14`); E2E (`P12-14/P12-01`) | `npm.cmd run test:phase12` | Windows native, real Vite/Chrome/files/ports | Passed | Compare displays authenticated before screenshot; Reject byte-exact; second run Accept records reference/plan/hash/traits/responsive metadata. Exit 0. | Same | Not verified | No Unix runtime. | Partially verified | Official synthetic licensed demo. |
| P12-15 | Phases 0-11 remain green with reference dormant and after accepted adaptation. | Regression | All Phase 0-11 suites plus integration `P12-15` and Phase 12 E2E | `npm.cmd run test:phase12:regression` plus resumed exact unique commands after P1 harness repair | Windows native, Chrome/Firefox/WebKit | Passed | 227 Phase 0-11 checks passed; Phase 12 dormant packet assertion and accepted milestone passed. | Same | Not verified | No Unix runtime. | Partially verified | Initial hard-coded 4400 collision and low-port flake were repaired in test-only infrastructure; final affected suites passed. |
| P12-16 | Vanilla, React CSS, CSS Modules, and Tailwind use their existing source conventions; TypeScript remains plan-only. | Cross-framework, Integration | Integration (`P12-16`) | `npm.cmd run test:phase12:integration` | Windows native | Passed | Four real temporary writes entered review and rejected exactly; TSX blocked before write. Exit 0. | Same | Not verified | No Unix runtime. | Partially verified | — |
| P12-17 | Space/Unicode/CRLF/case/path handling remains stable on Windows and Linux. | Cross-environment, Platform-specific | Integration (`P12-17`) | Same | Windows native | Passed | Unicode/space filename retained; CRLF/LF semantic hash stable; session path canonical. Exit 0. | WSL unavailable; Docker unavailable | Not verified | Linux half not executed. | Partially verified | Explicit cross-environment blocker. |
| P12-18 | Intake p95 <=2 s; local plan p95 <=5 s; packet <=256 KiB; finite provider deadline. | Performance, Hard gate | `tests/performance/phase-12-reference-adaptation.test.ts` | `npm.cmd run test:phase12:performance` | Windows native, Node v24.14.0 x64 | Passed | 30 samples: intake p50 0.810 ms/p95 1.591 ms; plan p50 0.045 ms/p95 0.267 ms; packet 1,201 B; deadline 1,000 ms. Exit 0. | Same | Not verified | No Unix runtime. | Partially verified | Explicit thresholds are hard; Windows values pass. |

## Test-command results

- `npm.cmd run test:phase12` — Windows native — build + Phase 12 — 23 passed, 0 failed, 0 skipped, exit 0. This includes integration 21/21, Chrome E2E 1/1, and performance 1/1.
- `npm.cmd run test:phase12:regression` and the exact resumed unique commands — Windows native — Phase 0-11 — 227 passed in the final evidence set, 0 unresolved failures, 0 skipped.
- Final affected Phase 11 rerun: `npm.cmd run test:phase11:e2e` — 3/3 passed, exit 0; `npm.cmd run test:phase11:performance` — 1/1 passed, exit 0.
- Cross-browser regressions: Phase 5 P5-15 and Phase 10 P10-13 passed on Chromium, Firefox, and WebKit.
- `npm.cmd run build` — Windows native — TypeScript project references — exit 0.
- Warning seen in Playwright: `NO_COLOR` ignored because `FORCE_COLOR` is set. It is environment-only and not a product defect.

## Performance observations

| Metric | Gate | Workload/samples | Windows result | Budget | Completion effect |
| --- | --- | --- | --- | --- | --- |
| Intake/sanitization | Hard | 30 synthetic 1280x720 bounded PNG references | p50 0.810 ms; p95 1.591 ms | p95 <=2,000 ms | Passed on Windows. |
| Local analysis/plan | Hard | Same 30 descriptors/plans | p50 0.045 ms; p95 0.267 ms | p95 <=5,000 ms | Passed on Windows. |
| Packet size | Hard | Maximum serialized selected-evidence packet | 1,201 bytes | <=262,144 bytes | Passed on Windows. |
| Provider deadline | Hard finite-deadline requirement | Configured test service | 1,000 ms | Finite/configurable | Passed on Windows. Production AI default remains 30,000 ms. |

Hardware context: Windows x64, Node v24.14.0, 12 logical CPUs observed by earlier phase performance tests. Unix metrics were not recorded.

## Acceptance criteria

- Safe adapters or precise rejection for all six §26 categories: **Passed on Windows** (P12-02/03/05/06/09).
- Explicit borrowing and brand choice with Preserve default: **Passed on Windows** (P12-01/07 and E2E UI assertions).
- Complete hash-frozen plan before generation: **Passed on Windows** (P12-01/07/14).
- Preserve-brand result reuses project architecture and selected traits only: **Passed on Windows** (P12-01/P12-14 automated E2E).
- Copy/assets/unselected traits/unrelated files/automatic DNA mutation blocked: **Passed on Windows** (P12-08/12/16).
- Static evidence does not fabricate interaction/responsive behavior: **Passed on Windows** (P12-04/13).
- Accept/Refine/Compare/Stop/timeout/stale/invalid/Reject safety retained: **Passed on Windows** (P12-10/11/14 plus Phase 8 regressions).
- Complete accepted checkpoint: **Passed on Windows** (P12-14 metadata assertion).
- §41/§42 real reversible demo: **Passed on Windows** (P12-14/P12-01 E2E).
- Required Unix confirmation for the full phase gate: **Not verified**.

## Regression and cross-platform status

- Phase 0-11 Windows regression: **Passed** after two test-only harness repairs. All 227 unique checks have passing evidence; no product regression remains.
- Phase 12 Windows: **Passed** (23/23 checks).
- Windows/Unix phase gate: **Implementation complete on available OS; other OS Not verified**.

**The implementation may be complete on the available operating system, but the implementation plan's full cross-platform phase gate has not been verified.**

## Known issues and limitations

- Unix/Linux execution remains unverified because WSL has no distribution and Docker has no usable daemon.
- Native `.fig`, PDF, active SVG, archives, and compressed inputs are deliberately rejected with precise codes. Supported Figma input is bounded JSON export; screenshots are PNG.
- The final worktree contains extensive pre-existing Phase 0-11 and user changes. They were preserved; no commit or broad formatting was performed.
- The user-owned Reframe listener on port 4400 remained running and untouched.

## Exact stopping point

- Implemented phase: **Phase 12 — Add Reference Adaptation**.
- Implementation complete: **Yes on Windows**.
- Full phase gate met: **No; Unix is Not verified**.
- Final verified capability: a selected source-mapped target can use an explicit sanitized reference and frozen borrowing plan, enter a real responsive/screenshot-first reversible review, and Accept into complete local history metadata.
- Last named test: **P12-18 passed on Windows; Unix Not verified**.
- Next phase: **none is defined in `implementation-plan.md`**. No Phase 13 files or behavior were created.
- To continue, explicitly request `verify Phase 12 on Unix`, `fix a Phase 12 issue`, or provide a revised source-of-truth phase plan.
