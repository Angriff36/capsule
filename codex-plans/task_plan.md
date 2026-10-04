# Demand calculation provenance repair

## Goal
Implement a truthful, policy-enforcing expandable provenance panel for ingredient demand rows, preserving existing work and generated ownership.

## Phases
- [complete] Inspect current implementation, required docs, and missing references.
- [complete] Repair authored Manifest and Convex provenance data/history/query seams.
- [complete] Repair ledger UI, extracted view model, and styles.
- [blocked] Regenerate owned output and run focused/static gates (the commit-required drift gate cannot pass on the pre-existing uncommitted diff).
- [blocked] Run disposable Playwright verification and remove it (the temporary test was removed, but the worktree has neither a configured local app nor an isolated Playwright runner).

## Errors
- Initial inventory command failed due to PowerShell `$_:` interpolation; rerun with `${_}`.
- `bun run check` stops at `check:wiring-drift` because owned generated files are intentionally uncommitted; `manifest:regen:check` reports the same commit-required condition.
- The disposable Playwright invocation resolved conflicting parent-checkout Playwright packages and found no runnable tests; the temporary spec was deleted.
