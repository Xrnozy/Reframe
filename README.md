# Reframe

Reframe is being implemented phase by phase from `spec/implementation-plan.md`.

Phase 0 establishes the reproducible workspace, canonical demos, immutable fixtures, process harness, and verification baseline. It intentionally contains no project detection, proxy, WebSocket, source-editing, Git-history, or Codex runtime behavior.

## Phase 0 commands

On Windows PowerShell, use the `.cmd` entry point when script execution policy blocks `npm.ps1`:

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd run test:phase0
```

On Linux:

```bash
npm ci
npm run build
npm run test:phase0
```

The complete Phase 0 run uses real demo servers, Chromium, real temporary files, real ports, and real child processes. Test fixture templates are never modified in place.
