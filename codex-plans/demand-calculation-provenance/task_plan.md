# Demand calculation provenance drill-down

## Goal
Give each ingredient demand row an on-demand, accurate explanation of the live
recipe contribution arithmetic and the recorded recalculation/supersession changes.

## Plan

- [x] Inspect demand aggregation, UI, design, and generated-file boundaries.
- [x] Add source-owned contribution calculation snapshots and history events.
- [x] Regenerate Manifest output and register an authorized provenance read seam.
- [x] Add lazy, accessible demand-row provenance UI in the existing design language.
- [x] Add the requested focused contract test and attempt temporary Playwright proof.
- [x] Run repository gates and leave the branch reviewable (full gate has a tracked tooling blocker).

## Constraints

- Do not hand-edit generated Manifest or Convex files.
- Treat an IngredientDemand as an aggregate; never invent a single source formula.
- Preserve legacy/manual records honestly when no captured snapshot exists.
- Fetch provenance only after the row is expanded.
