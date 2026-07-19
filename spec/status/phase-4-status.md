# Phase 4 status and canonical traceability matrix

- State: Implementation complete on Windows; Unix Not verified; full cross-platform gate Partially verified
- Host: Windows native
- Unix: Not verified; WSL has no distro, Docker daemon is unavailable, and configured remote CI credentials are invalid
- Baseline: Phase 1–3 reports retained; only targeted Phase 3 regressions will be rerun

| Test ID | Phase | Requirement and expected result | Test type | Test location | Execution command | Windows environment | Windows result | Windows evidence | Unix environment | Unix result | Unix evidence | Overall status | Notes or blocker |
| ------- | ----- | ------------------------------- | --------- | ------------- | ----------------- | ------------------- | -------------- | ---------------- | ---------------- | ----------- | ------------- | -------------- | ---------------- |
| P4-01 | Phase 4 | Valid bootstrap plus Test Connection completes ready exchange, receives matching pong, and displays Connected. | End-to-end | `tests/e2e/phase-4-connection.spec.ts` | `npm.cmd run test:phase4:e2e` | Windows native, installed Chrome | Passed | Final E2E 6/6, exit 0; automatic ready plus Test Connection showed the exact matching `Pong test_*` correlation and Connected. | Linux via available low-risk environment | Not verified | No executable Unix environment. | Partially verified | Windows complete; Unix unavailable. |
| P4-02 | Phase 4 | Ten refreshes create one active socket each, close old sockets/timers, and recover Connected automatically. | End-to-end | `tests/e2e/phase-4-connection.spec.ts` | `npm.cmd run test:phase4:e2e` | Windows native, installed Chrome | Passed | Ten real reloads each recovered Connected with one active socket; 11 accepted and at least 10 closed; 6/6 exit 0. | Linux via available low-risk environment | Not verified | No executable Unix environment. | Partially verified | Pagehide teardown plus browser socket lifecycle exercised. |
| P4-03 | Phase 4 | Browser started before the endpoint shows Connecting/Reconnecting, uses bounded backoff, and connects without reload when available. | End-to-end, Failure recovery | `tests/e2e/phase-4-connection.spec.ts` | `npm.cmd run test:phase4:e2e` | Windows native, installed Chrome | Passed | Real endpoint initially rejected upgrades; client remained non-Connected and connected on the same page after enable; 6/6 exit 0. | Linux via available low-risk environment | Not verified | No executable Unix environment. | Partially verified | Backoff capped by configured 80ms test ceiling. |
| P4-04 | Phase 4 | Two tabs receive independent connection IDs and do not overwrite each other's selection state. | End-to-end | `tests/e2e/phase-4-connection.spec.ts` | `npm.cmd run test:phase4:e2e` | Windows native, installed Chrome | Passed | Two real pages received distinct IDs; tab-one selection routed only on tab one's counter while both stayed Connected; 6/6 exit 0. | Linux via available low-risk environment | Not verified | No executable Unix environment. | Partially verified | Server keeps no shared selection state in Phase 4. |
| P4-05 | Phase 4 | Malformed JSON, missing/wrong fields, unknown type, and wrong protocol are rejected with stable codes and zero router side effects. | Integration, Invalid input | `tests/integration/phase-4-websocket.test.ts` | `npm.cmd run test:phase4:integration` | Windows native | Passed | Final focused run 7/7, exit 0; five hostile message classes returned stable error/close reasons and routed messages stayed zero. | Linux via available low-risk environment | Not verified | No executable Unix environment. | Partially verified | Windows complete; Unix unavailable. |
| P4-06 | Phase 4 | Missing/invalid token, wrong origin, non-loopback host, and wrong project ID are rejected without metadata or validation-detail disclosure. | Integration, Security | `tests/integration/phase-4-websocket.test.ts` | `npm.cmd run test:phase4:integration` | Windows native | Passed | Five real HTTP upgrade attempts returned 403, accepted zero sockets, and disclosed no token/project metadata; 7/7 exit 0. | Linux via available low-risk environment | Not verified | No executable Unix environment. | Partially verified | Remote address helper also rejects non-loopback; external-host connection is not possible inside this host-only run. |
| P4-07 | Phase 4 | Absolute paths and traversal in string fields are rejected and no filesystem API is called. | Integration, Security | `tests/integration/phase-4-websocket.test.ts` | `npm.cmd run test:phase4:integration` | Windows native | Passed | Six path/traversal variants rejected before routing; connection boundary contains no filesystem import; 7/7 exit 0. | Linux via available low-risk environment | Not verified | No executable Unix environment. | Partially verified | No filesystem authority exists in the Phase 4 module. |
| P4-08 | Phase 4 | Oversized payload is closed/rejected; 10,000 previews keep memory bounded and control messages responsive. | Integration, Security, Performance | `tests/integration/phase-4-websocket.test.ts` | `npm.cmd run test:phase4:integration` | Windows native | Passed | Declared 32KB+1 frame closed 1009; 10,000 real frames rate-limited at least 9,900, heap delta stayed below 64MB, and following ping received pong; 7/7 exit 0. | Linux via available low-risk environment | Not verified | No executable Unix environment. | Partially verified | Preview messages are dropped after a fixed per-connection window; no queue. |
| P4-09 | Phase 4 | Server loss changes status to Disconnected, page stays usable, reconnect authenticates, and no mutation is replayed. | End-to-end, Failure recovery | `tests/e2e/phase-4-connection.spec.ts` | `npm.cmd run test:phase4:e2e` | Windows native, installed Chrome | Passed | Real sockets closed and upgrades rejected while HTTP/app button stayed usable; reconnect authenticated and `edit:apply` count stayed zero; 6/6 exit 0. | Linux via available low-risk environment | Not verified | No executable Unix environment. | Partially verified | No outbound mutation queue exists. |
| P4-10 | Phase 4 | Dropped pong crosses the heartbeat deadline, never leaves stale Connected, and begins bounded reconnection. | End-to-end, Failure recovery | `tests/e2e/phase-4-connection.spec.ts` | `npm.cmd run test:phase4:e2e` | Windows native, installed Chrome | Passed | Real pong suppression crossed 300ms deadline, recorded Disconnected and non-Connected state, then recovered after pong restoration; 6/6 exit 0. | Linux via available low-risk environment | Not verified | No executable Unix environment. | Partially verified | Fault injection changes server frame behavior, not browser state directly. |
| P4-11 | Phase 4 | Only direction-valid and schema-valid initial message types reach handlers with correlation/session IDs preserved. | Integration | `tests/integration/phase-4-websocket.test.ts` | `npm.cmd run test:phase4:integration` | Windows native | Passed | Every initial client message type routed once; server-only types were rejected; ready/pong preserved correlation/session IDs; 7/7 exit 0. | Linux via available low-risk environment | Not verified | No executable Unix environment. | Partially verified | Phase 5 messages are acknowledged only as validated non-filesystem protocol events. |
| P4-12 | Phase 4 | Hostile-test logs contain no canary token or authorization data and errors use safe diagnostic codes. | Integration, Regression, Security | `tests/integration/phase-4-websocket.test.ts` | `npm.cmd run test:phase4:integration` | Windows native | Passed | Canary hostile handshake and malformed frame logged only `AUTH_INVALID`/`MESSAGE_MALFORMED`; no token/protocol authorization string; 7/7 exit 0. | Linux via available low-risk environment | Not verified | No executable Unix environment. | Partially verified | Safe-code logger accepts codes only. |
| P4-13 | Phase 4 | Real IPv4/IPv6 loopback checks on Windows/Linux accept configured local clients and reject non-loopback variants. | Platform-specific, Integration | `tests/integration/phase-4-websocket.test.ts` | `npm.cmd run test:phase4:integration` | Windows native | Passed | Real TCP/WebSocket ready exchange passed on 127.0.0.1 and ::1; non-loopback Host and address forms rejected; 7/7 exit 0. | Linux via available low-risk environment | Not verified | No executable Unix environment. | Partially verified | Windows IPv6 companion is loopback-only. |
| P4-14 | Phase 4 | Record 1,000 sequential ping/pong latency and preview-burst memory/control responsiveness; p95 budget is 100ms. | Performance | `tests/performance/phase-4-websocket.test.ts` | `npm.cmd run test:phase4:performance` | Windows native | Passed | Final run, 1,000 samples: p50 0.095ms, p95 0.268ms; 10,000 previews; heap 13,947,840 -> 20,340,224 -> 20,343,896 bytes; control pong 26.859ms; 9,900 rate-limited; exit 0. | Linux via available low-risk environment | Not verified | No executable Unix environment. | Partially verified | Observability-only 100ms budget; Windows result within budget and no functional starvation. |
| P3-01 | Targeted Phase 3 regression | Vanilla proxy still renders exactly one usable toolbar and changes no project file. | Regression, End-to-end | `tests/e2e/phase-3-toolbar.spec.ts` | `$env:TEMP='C:\tmp\reframe-phase4-regression-20260716'; $env:TMP=$env:TEMP; npm.cmd run test:phase4:regression:e2e` | Windows native, installed Chrome | Passed | Targeted browser run 5/5, exit 0; one toolbar remained usable and immutable fixture assertion passed. | Linux baseline | Not verified | Existing Phase 3 Unix limitation retained. | Partially verified | Unique temp root was verified and removed. |
| P3-02 | Targeted Phase 3 regression | React/Vite HMR still updates while exactly one toolbar remains. | Regression, End-to-end | `tests/e2e/phase-3-toolbar.spec.ts` | `$env:TEMP='C:\tmp\reframe-phase4-regression-20260716'; $env:TMP=$env:TEMP; npm.cmd run test:phase4:regression:e2e` | Windows native, installed Chrome | Passed | Real React/Vite external HMR passed with one connected toolbar; targeted run 5/5, exit 0. | Linux baseline | Not verified | Existing Phase 3 Unix limitation retained. | Partially verified | Required because client lifecycle changed. |
| P3-09 | Targeted Phase 3 regression | Direct upstream and unrelated origins still cannot bootstrap Reframe. | Regression, Security, End-to-end | `tests/e2e/phase-3-toolbar.spec.ts` | `$env:TEMP='C:\tmp\reframe-phase4-regression-20260716'; $env:TMP=$env:TEMP; npm.cmd run test:phase4:regression:e2e` | Windows native, installed Chrome | Passed | Direct upstream and copied unrelated bootstrap both produced zero Reframe roots; targeted run 5/5, exit 0. | Linux baseline | Not verified | Existing Phase 3 Unix limitation retained. | Partially verified | Sensitive bootstrap additions did not weaken origin guard. |
| P3-11 | Targeted Phase 3 regression | Vite-HMR-like and application WebSockets still forward without Reframe consuming them. | Regression, Integration | `tests/integration/phase-3-proxy.test.ts` | `npm.cmd run test:phase4:regression:ws` | Windows native | Passed | Targeted real WebSocket regression 1/1 passed, 5 unrelated tests skipped, exit 0. | Linux baseline | Not verified | Existing Phase 3 Unix limitation retained. | Partially verified | Reframe path routing did not consume either upstream socket path. |
| P3-12 | Targeted Phase 3 regression | Exit still removes all Reframe DOM/listeners/offsets after HMR and restores page behavior. | Regression, End-to-end | `tests/e2e/phase-3-toolbar.spec.ts` | `$env:TEMP='C:\tmp\reframe-phase4-regression-20260716'; $env:TMP=$env:TEMP; npm.cmd run test:phase4:regression:e2e` | Windows native, installed Chrome | Passed | HMR then Exit removed root/global client/socket timers and preserved app behavior; targeted run 5/5, exit 0. | Linux baseline | Not verified | Existing Phase 3 Unix limitation retained. | Partially verified | Socket teardown is now covered. |
| SUP-P3-02 | Targeted Phase 3 regression | CSP-protected page still renders the isolated toolbar with the same-origin Phase 4 socket bootstrap present. | Regression, Security, End-to-end | `tests/e2e/phase-3-toolbar.spec.ts` | `$env:TEMP='C:\tmp\reframe-phase4-regression-20260716'; $env:TMP=$env:TEMP; npm.cmd run test:phase4:regression:e2e` | Windows native, installed Chrome | Passed | Default-src self CSP toolbar/bootstrap passed in targeted run 5/5, exit 0. | Not applicable | Not applicable | Existing supplement. | Passed | Same-origin WebSocket preserves CSP compatibility. |
| SUP-P2-01 | Targeted Phase 2 regression | CLI project orchestration still opens the verified proxy and stops owned project/proxy processes. | Regression, Integration | `tests/integration/phase-2-project.test.ts` | `npm.cmd run test:phase4:regression:cli` | Windows native | Passed | Targeted 1/1 passed, 18 unrelated tests skipped, exit 0; project metadata proxy startup and cleanup succeeded. | Not applicable | Not applicable | Existing supplement is platform-covered by named Phase 2 tests. | Passed | Required because CLI now passes connection project metadata. |
| P1-01 | Targeted Phase 1 regression | Packed root/health and exact opener behavior still resolve all bundled dependencies. | Regression, Integration | `tests/integration/phase-1-cli.test.ts` | `npm.cmd run test:phase4:regression:pack` | Windows native | Passed | Packed targeted group 4/4 passed, 9 unrelated tests skipped, exit 0; shared package resolved from tarball. | Linux baseline | Not verified | Existing Phase 1 Unix limitation retained. | Partially verified | Required because packed shared dependency wiring changed. |
| P1-02 | Targeted Phase 1 regression | Local packed `npx` bin still resolves and reaches ready state. | Regression, End-to-end | `tests/integration/phase-1-cli.test.ts` | `npm.cmd run test:phase4:regression:pack` | Windows native | Passed | Installed tarball invoked through real npx and reached documented ready state; targeted group 4/4, exit 0. | Linux baseline | Not verified | Existing Phase 1 Unix limitation retained. | Partially verified | Required because packed dependency wiring changed. |
| SUP-P1-01 | Targeted Phase 1 regression | Repeated-signal force path remains single-shot after packed dependency changes. | Regression, Mock-based unit | `tests/integration/phase-1-cli.test.ts` | `npm.cmd run test:phase4:regression:pack` | Windows native | Passed | Selected by exact grep substring; packed targeted group 4/4 passed, exit 0. | Not applicable | Not applicable | Existing supplement. | Passed | Incidental but retained in canonical evidence. |
| SUP-P1-02 | Targeted Phase 1 regression | Health-probe cancellation remains graceful and releases its listener. | Regression, Integration | `tests/integration/phase-1-cli.test.ts` | `npm.cmd run test:phase4:regression:pack` | Windows native | Passed | Selected by exact grep substring; packed targeted group 4/4 passed, exit 0. | Not applicable | Not applicable | Existing supplement. | Passed | Incidental but retained in canonical evidence. |

## Evidence log

- Preparation: Phase 4 plan/spec/phasing sections, Phase 3 baseline, repository interfaces, Git status, CI, WSL, Docker, and GitHub CLI were inspected before code changes.
- Skill: Ponytail full selected; no new dependency or future-phase abstraction will be added unless the existing platform cannot safely satisfy a required boundary.
- Shared protocol step: `npm.cmd run build` passed on Windows native, exit 0.
- Socket integration build attempt 1: `npm.cmd install --package-lock-only --ignore-scripts` passed; `npm.cmd run build` failed, exit 1, on a Node Buffer generic inference mismatch at `websocket-server.ts:124`; type annotation corrected without changing runtime behavior.
- Socket integration build attempt 2: `npm.cmd run build` passed on Windows native, exit 0.
- Browser connection step: package-lock refresh and `npm.cmd run build` passed on Windows native, exit 0; token is removed from the DOM after bootstrap and never placed in the socket URL or public diagnostics.
- Phase 4 integration attempt 1: 6/7 passed, exit 1. P4-05's missing-field setup omitted the protocol and therefore correctly reached `PROTOCOL_VERSION_UNSUPPORTED` before schema validation; the case now supplies a valid protocol while retaining missing required fields.
- Phase 4 integration attempt 2: 6/7 passed, exit 1. P4-05 exposed validator-ordering behavior that mislabeled an absent `projectId` as `PROJECT_INVALID`; shared validation now classifies missing/type-invalid fields before comparing a well-formed project ID.
- Phase 4 integration final focused run: `npm.cmd run build` and `npm.cmd run test:phase4:integration` passed; 7/7 tests, exit 0.
- Phase 4 E2E attempt 1 was stopped after P4-09 exceeded its useful runtime. Focused P4-09 exited 1: the fixture button was positioned beneath the fixed 44px toolbar, so Playwright correctly reported pointer interception. The fixture control was moved below the toolbar; connection assertions were unchanged.
- Focused P4-09 rerun: 1/1 passed in real installed Chrome, exit 0.
- Phase 4 E2E final focused run: 6/6 passed in installed Chrome, exit 0; only the environmental `NO_COLOR`/`FORCE_COLOR` warning appeared.
- P4-14 focused performance: 1/1 passed, exit 0; p50/p95 and burst memory/control metrics recorded in the canonical row.
- Targeted regression attempt 1: P3-11 passed 1/1, exit 0. Phase 3 browser setup failed before selected tests because its temporary cross-tree `node_modules` junction made Vite/esbuild traverse a denied ancestor despite intact dependency files. The unique temporary root was moved inside the workspace and the grep was anchored so only P3-01/P3-02/P3-09/P3-12 run.
- Targeted Phase 3 browser attempt 2: no tests selected, exit 1, because Windows `cmd` consumed the regex anchor. The simple known-working grep is restored; its extra `SUP-P3-02` CSP match is explicitly traced as relevant coverage.
- Targeted Phase 3 browser attempt 3: setup still failed before selected tests, exit 1; Vite realpathed the temporary `node_modules` junction and traversed denied ancestors. The test-only Vite config now preserves symlink paths so dependency resolution stays inside the owned fixture path.
- Targeted Phase 3 browser attempt 4: setup still failed before selected tests, exit 1; this sandbox denies esbuild traversal through the directory junction even when Vite preserves its path. The owned temporary fixture now copies only React, React DOM, and Scheduler instead of linking the workspace dependency tree.
- Targeted Phase 3 browser attempt 5: setup still failed before selected tests, exit 1; direct package copies confirmed the failure is sandbox ancestor traversal rather than junction content. All experimental Phase 3 test edits were reverted; the unchanged fixture will be rerun with Windows `TEMP`/`TMP` set to the already writable `C:\\tmp` root.
- Targeted Phase 3 browser attempt 6: direct `C:\\tmp` cache creation was denied by a pre-existing inaccessible cache; a first unique-directory creation attempt was also denied in the restricted sandbox. The approved low-risk run created a unique owned `C:\\tmp\\reframe-phase4-regression-20260716` root, passed 5/5 targeted tests with exit 0, and the verified exact root was removed successfully with exit 0.
- Targeted shared-code regressions: `npm.cmd run build` passed; SUP-P2-01 passed 1/1 with 18 unrelated skips; packed P1-01/P1-02 plus incidentally matched SUP-P1-01/SUP-P1-02 passed 4/4 with 9 unrelated skips; all commands exit 0.
- First final `npm.cmd run test:phase4`: every Phase 4 test and targeted regression passed, fixture digest `f36b1b47...cfda` unchanged, exit 0. Final review then found the browser stopped retrying after eight failures; reconnect now continues with the same bounded delay, and P4-03 waits past the former cutoff before enabling the real endpoint.
- Strengthened P4-03: `npm.cmd run build` and focused real-Chrome P4-03 passed 1/1, exit 0, after the endpoint remained unavailable beyond the old retry cutoff.
- Final post-fix `npm.cmd run test:phase4`: build, Phase 4 integration 7/7, Phase 4 E2E 6/6, P4-14 1/1, P3-11 1/1, targeted Phase 3 browser 5/5, SUP-P2-01 1/1, and packed targeted Phase 1 group 4/4 all passed; protected-tree digest `f36b1b47...cfda` unchanged; exit 0.
- Final safety review: `git diff --check` passed apart from existing LF/CRLF notices; the canonical matrix contains 25 unique rows including all 14 P4 IDs; no duplicate ID, owned temp root, new Node process, or fixed-port test listener remained.

## Selected agent and skill

- Agent: Reframe Phase Implementation Agent (continued in the current task).
- Skill: Ponytail full. It was used to reuse the existing proxy/browser lifecycle, Node standard library, Vitest, and Playwright; no WebSocket dependency or future-phase abstraction was added.
- Limitation: Ponytail did not reduce security validation, cleanup, cross-platform evidence, or any named test requirement.

## Implementation summary

- Added shared versioned runtime schemas and stable safe error codes for every Phase 4 message type.
- Added a random 256-bit per-run token, random non-secret project/session IDs, same-origin bootstrap delivery, and token removal from the DOM after bootstrap. The token is absent from URLs, logs, diagnostics, and project files.
- Added a standard-library WebSocket handshake/frame server on the random Reframe proxy path. Vite HMR and application WebSockets still route upstream unchanged.
- Added exact loopback, Host, Origin, token, session, project, protocol, direction, schema, UTF-8, frame-size, and path-like-field validation before routing.
- Added one bounded per-connection preview limiter with no preview queue, safe counters, heartbeat in both directions, truthful toolbar states, bounded-delay reconnect that continues after long outages, independent tab IDs, Test Connection, and full teardown.
- Phase 5 selection, preview/resize UI, proposals with behavioral state, source mapping, and every filesystem edit remain untouched.
- No prerequisite product repair was needed. The only earlier-test issue was restricted-sandbox access to Vite's normal temp dependency traversal; the unchanged regression passed outside that restriction.

## Changed files

| File | Change | Purpose | Pre-existing user changes |
| --- | --- | --- | --- |
| `.github/workflows/ci.yml` | Modified | Run the Phase 4-only matrix on Windows/Ubuntu and Node 22/24. | Yes; Phase 3 workflow existed. |
| `README.md` | Modified | Document real Phase 4 connection behavior and commands. | Yes; Phase 3 documentation existed. |
| `package.json`, `package-lock.json` | Modified | Add Phase 4 scripts and workspace dependency edges. | Yes; Phase 1–3 scripts/dependencies preserved. |
| `packages/shared/src/index.ts` | Modified | Export the shared protocol. | Yes. |
| `packages/shared/src/protocol.ts` | Created | Runtime schemas, message types, limits, and stable codes. | No. |
| `packages/browser-client/package.json` | Modified | Declare its shared-contract dependency. | Yes. |
| `packages/browser-client/src/index.ts` | Modified | Add real connection state, ready/ping/pong, heartbeat, reconnect, Test Connection, and socket teardown. | Yes; Phase 3 toolbar preserved. |
| `packages/dev-server/package.json`, `packages/dev-server/src/index.ts` | Modified | Declare/export Phase 4 contracts and server. | Yes. |
| `packages/dev-server/src/proxy.ts` | Modified | Add secure bootstrap metadata and reserve only the random Reframe socket path; retain upstream upgrades. | Yes; pre-existing untracked Phase 3 file preserved. |
| `packages/dev-server/src/websocket-server.ts` | Created | Local authenticated handshake, frame parser, router, rate limiter, heartbeat, diagnostics, and cleanup. | No. |
| `packages/cli/src/run.ts` | Modified | Pass safe project name/framework/capabilities into the proxy. | Yes; pre-existing untracked Phase 1–3 file preserved. |
| `scripts/pack-cli.mjs` | Modified | Include `@reframe/shared` in the packed CLI. | Yes; pre-existing untracked Phase 1 file preserved. |
| `scripts/run-phase4-tests.mjs` | Created | Run only Phase 4 plus targeted regressions and protected-tree hashes. | No. |
| `tests/helpers/raw-websocket.ts` | Created | Real TCP/WebSocket hostile-client test helper. | No. |
| `tests/integration/phase-4-websocket.test.ts` | Created | P4-05–P4-08 and P4-11–P4-13. | No. |
| `tests/e2e/phase-4-connection.spec.ts` | Created | P4-01–P4-04, P4-09, and P4-10 in real Chrome. | No. |
| `tests/performance/phase-4-websocket.test.ts` | Created | P4-14 measurements. | No. |
| `spec/status/phase-4-status.md` | Created | This single canonical matrix and completion report. | No. |

Pre-existing unrelated/uncommitted changes such as `.gitignore`, Phase 0 scripts/helpers, project detection/runtime files, Phase 1–3 tests/status files, package boundary files, and TypeScript configuration remain present and were not reverted or broadly reformatted.

## Operating-system discovery and provisioning

| OS/environment | Discovery or command | Result |
| --- | --- | --- |
| Windows native | Current host; `node`, installed Chrome, real IPv4/IPv6 sockets | Available. Node 24.14.0, win32-x64, 12 logical CPUs; all required Windows evidence passed. |
| WSL | `wsl.exe --list --verbose` | Exit 1: no installed distribution. Installing a distro would expand host infrastructure and was not attempted. |
| Docker/Linux | `docker.exe info --format '{{.ServerVersion}}'` | Client exists; daemon pipe absent, service unavailable, and Docker config access denied. No executable container. |
| Other local runners | `Get-Command podman.exe,multipass.exe,VBoxManage.exe` | Commands absent. |
| Remote GitHub CI | `.github/workflows/ci.yml`; `gh.exe auth status` | Windows/Ubuntu matrix exists and is updated for Phase 4, but configured token is invalid; no remote run claimed. |

## Final command results

| Command | Environment | Coverage | Passed | Failed | Skipped | Exit |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| `npm.cmd run test:phase4` | Windows native, approved normal temp access | Final Phase 4 orchestrator | All child commands | 0 | Only explicitly unrelated targeted-suite tests | 0 |
| `npm.cmd run build` | Windows native | TypeScript project references | Build | 0 | 0 | 0 |
| `npm.cmd run test:phase4:integration` | Windows native | P4-05–P4-08, P4-11–P4-13 | 7 | 0 | 0 | 0 |
| `npm.cmd run test:phase4:e2e` | Windows native, installed Chrome | P4-01–P4-04, P4-09, P4-10 | 6 | 0 | 0 | 0 |
| `npm.cmd run test:phase4:performance` | Windows native | P4-14 | 1 | 0 | 0 | 0 |
| `npm.cmd run test:phase4:regression:ws` | Windows native | P3-11 | 1 | 0 | 5 | 0 |
| `npm.cmd run test:phase4:regression:e2e` | Windows native, installed Chrome | P3-01, P3-02, P3-09, P3-12, SUP-P3-02 | 5 | 0 | 0 | 0 |
| `npm.cmd run test:phase4:regression:cli` | Windows native | SUP-P2-01 | 1 | 0 | 18 | 0 |
| `npm.cmd run test:phase4:regression:pack` | Windows native, real tarball/npx | P1-01, P1-02, SUP-P1-01, SUP-P1-02 | 4 | 0 | 9 | 0 |

The only repeated warning was Playwright's environmental `NO_COLOR`/`FORCE_COLOR` warning; it does not indicate a product defect. Final protected-tree digest was `f36b1b479e4380f80dc8a6fe366a283f23bbccbfe49f0f46a3e0b462ce27cfda` before and after.

## Performance observations

| Metric | Gate type | Workload | Samples | Environment | p50 | p95 | Budget | Result and completion effect |
| --- | --- | --- | ---: | --- | ---: | ---: | --- | --- |
| Local application ping/pong | Observability-only | Sequential correlated real socket exchanges | 1,000 | Windows native, Node 24.14.0 | 0.095ms | 0.268ms | 100ms p95 | Within budget; never converted to a hard gate. |
| Preview burst memory/control | Functional resource observation | 10,000 real preview frames then control ping | 10,000 | Same | n/a | n/a | Memory stabilizes; control not starved | Heap 13,947,840 -> 20,340,224 -> 20,343,896 bytes; settled delta 3,672 bytes; control pong 26.859ms; 9,900 previews rate-limited. No functional failure. |

## Acceptance criteria

- Automatic ready exchange and client/server ping/pong: **Passed on Windows; Unix Not verified** (P4-01, P4-11).
- Accurate refresh, initial outage, server outage, heartbeat failure, and reconnect states: **Passed on Windows; Unix Not verified** (P4-02, P4-03, P4-09, P4-10).
- Invalid token/origin/host/project/protocol/message/size/type rejected before routing: **Passed on Windows; Unix Not verified** (P4-05, P4-06, P4-08, P4-11, P4-13).
- Browser messages have no arbitrary path or filesystem authority: **Passed on Windows; Unix Not verified** (P4-07; connection module has no filesystem import).
- Preview bursts are bounded and control traffic remains responsive: **Passed on Windows; Unix Not verified** (P4-08, P4-14).
- Tokens and sensitive authorization data are absent from logs/URLs/project files: **Passed on Windows; Unix Not verified** (P4-06, P4-12, protected-tree digest).

## Regression and cross-platform status

- Targeted Phase 3 injection, HMR, unrelated-origin, upstream WebSocket, CSP, and Exit behavior passed on Windows.
- Targeted Phase 2 CLI project orchestration passed on Windows.
- Targeted packed Phase 1 dependency/startup and incidentally selected signal/probe supplements passed on Windows.
- Complete Phase 1–3 suites were intentionally not rerun, as instructed.
- Cross-platform gate: **Implementation complete on available OS; other OS Not verified**.
- The implementation may be complete on the available operating system, but the implementation plan's full cross-platform phase gate has not been verified.

## Known issues and exact stopping point

- Unix execution remains unavailable after the documented low-risk checks. CI is configured but was not remotely executed because authentication is invalid.
- Firefox/WebKit are not Phase 4's named cross-browser gate; no result is claimed for them.
- Three Node processes that predated final verification remain untouched. No new Node process, fixed-port listener, owned temporary fixture, or `C:\\tmp\\reframe-phase4-regression-20260716` root remained after testing.
- Phase 4 implementation is complete on Windows. The full gate is not met because Unix remains Not verified.
- Final verified capability: one real local toolbar authenticates automatically, reports actual connectivity, survives refresh/outage/heartbeat failure, rejects hostile clients, bounds bursts, and cleans up without source changes.
- Last named Phase 4 test: P4-14.
- Phase 5 remains untouched.
- Continue only with an explicit instruction such as `Start Phase 5 only` or a request to verify Phase 4 on Unix.
