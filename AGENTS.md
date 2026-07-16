# Reframe repository guidance

- Treat `spec/implementation-plan.md` and `spec/description/reframe-spec.md` as the source of truth.
- Implement one phase at a time and stop at its boundary.
- Never edit fixture templates or demo projects from destructive tests; use unique temporary copies.
- Preserve user work and do not introduce later-phase runtime behavior early.
- Use argument arrays for child processes and verify readiness with HTTP behavior.
- Clean every owned process, port, browser context, and temporary fixture after tests, including failure paths.
