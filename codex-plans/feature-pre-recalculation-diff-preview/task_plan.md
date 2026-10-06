# Demand recalculation preview plan

## Goal
Add a non-mutating, side-by-side ingredient-demand preview before every supported recalculation, supersede, or headcount re-derive action, with a single guarded confirm.

## Phases
- [complete] Discover current demand writes, UI entry points, data model, and existing test patterns.
- [complete] Design the shared preview/apply contract and update authored sources.
- [in_progress] Add focused acceptance coverage and run the required regeneration/codegen checks.
- [pending] Verify with focused tests, required repository gate, and temporary Playwright test; remove the temporary test.
- [pending] Inspect final diff and prepare for independent review.

## Constraints
- Preserve unrelated work; do not commit, push, deploy, or alter production.
- Do not hand-edit generated files; use `bun run manifest:regen` when source changes require it.
- Use the existing calculation/write path; no duplicate demand math in UI.
- Keep UI inside DESIGN.md language and run the requested temporary Playwright verification.

## Design decision
- Keep the generated Manifest lifecycle commands authoritative. Authored preview/apply mutations only intercept the UI flow: they fingerprint the relevant event/demand/purchase state, then call `writeReconciledEventDemand`, `Event.changeHeadcount`, or `IngredientDemand.supersede` after verifying the fingerprint. This preserves generated policies, events, reactions, and purchasing updates.
