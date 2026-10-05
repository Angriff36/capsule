# Findings

- The generated `IngredientDemand.recalculate` and `IngredientDemand.supersede` hooks are used by the inventory demand ledger.
- The operator-facing event recalculation route goes through authored `convex/culinaryDemand.ts` via `src/lib/culinaryDemandClient.ts`; the pure material-demand engine is `convex/lib/culinaryModel/demand.ts`.
- Headcount reconciliation is a Manifest reaction path, not a direct UI mutation in the first search results. It must be traced before deciding whether an interactive preview can intercept it.
- UI changes must use the existing CapsuleX neutral canvas, warm orange action, DM Sans, rules, and semantic warning treatment from `DESIGN.md`.
