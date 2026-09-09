# Progress

## 2026-09-09 initial source study

- Read original goal attachment before exploration.
- Verified clean checkout on main at 41363479; created fix/source-backed-catering-workflow.
- Read AGENTS.md, PDF/planning/systematic-debugging skills, no-invented-deferrals and blocker escalation rules. Began Manifest full documentation (first 130 lines only); domain-specific/full remaining reading still required before implementation.
- Located earlier audits and recent recipe-text/My Day commits; have not treated them as completion evidence.
- Rendered and extracted all 7 training/prep/binder PDFs with PyMuPDF to .artifacts/operations-source-study. Read complete guide/prep extraction; viewed guide p4 and prep p1.
- Recorded 18 initial requirement groups and concrete Ashley scaling/packing examples. Source study remains in progress.
- No code or live data changed. No tests or deployment run. Full goal remains active.
- Read all Event Forms One Print extracted text and inspected the current recipe repair CLI plus first 240 lines of its projection. September 8 repair artifacts exist, so fresh live comparison must account for those repairs rather than replaying an older audit's assumptions.

## Tool notes

Large batched source reads exceeded output limits. Continue with bounded per-file/page reads rather than treating truncated output as reviewed.
One targeted search included nonexistent convex/lib/tppRecipeRepair.ts (exit 1); actual seam re-exports repairDishRecipe from another owner. Resolve its import next.
# Continuation: runtime and original workbook evidence

## Connected quantity checkpoint

Implemented shared dish serving authority, remembered whole-event/fixed intent, server prep resize, zero-demand preservation and restoration from per-serving contribution rates. Actual generated Convex runtime reproduction verifies 167/42/334/0 -> 200/42/334/0, asparagus prep/demand 37.5 lb, zero demand, and restored 37.5 lb. Full standard tests passed (1425), typecheck passed, focused proofs and ownership passed. Issues #311 and #312 filed. No live writes or release. See runtime-gaps.md for remaining limitations and isolated Builder path.

- Completed all specified PDF/photo visual review and the 41-minute training transcript; corrected stale resume state in task_plan.md.
- Read full Convex guidelines and traced repair seam through UI/MCP prep synchronization.
- Reproduced duplicate prep locally and filed https://github.com/Angriff36/capsule/issues/310.
- Extracted 90 original migration XLSX files read-only with cell addresses; found exact Ashley ingredient/subrecipe amounts and service methods omitted by the older recipe JSON path.
- New runtime-gaps.md records source unit conflicts, serving-count propagation and batch-yield semantics requiring connected fixes.
- Subsequently reproduced instruction loss on serving resize and fixed EventPrepTaskSynchronizer to retain existing method/event notes. The failing scratch reproduction now passes. Ran 23 existing focused tests (all pass), full typecheck (pass) and targeted Prettier (pass). No new repository tests added. No production mutation or release. Goal remains active.

## Explicit imported prep adoption checkpoint

Implemented optional source-reviewed prep links in the recipe repair seam and CLI. Links retain original names, units, quantities, instructions, assignment/status/completion fields; only recipe references, version and updatedAt change. Snapshot checks reject concurrent changes, conflicting existing references, duplicate plan entries and incompatible units. Previously imported dish methods are preserved when reconnecting work. Receipt replay is nonduplicating.

Actual Convex runtime scratch verification (`reproduce-prep-adoption.ts`) passes: two imported tasks become linked without duplication; pending asparagus scales 31.31 -> 37.5 lb for 200 servings; completed lemon work stays 41.75 each with its completion timestamp; repeat repair does not relink; a stale snapshot rolls back. Existing prep coordinator tests pass (6). Typecheck passed before the final method-preservation edit and is rerunning. No new repository tests or live writes.

Source correction: original sauce photo says 4 quarts Gruyere and 1/4 cup cornstarch per 5 gallons; costing says 4 pounds and 1/4 pound. This contradicts the earlier claim that all formula ingredients match. Owner clarification requested for these and asparagus Parmesan (1 ounce versus 1/16 ounce per serving). Continue independently while unresolved.

A real Smore Bar preview identifies nine source-matched imported rows, but three use quarts while templates use tablespoons. Current repair correctly rejects those links; units must be reconciled in both server and client scaling before applying. The preview is not an applicable migration yet. Also confirmed live Infused Water has 167 servings while original cost source has 334; preserve this discrepancy in the event repair plan rather than assuming the live menu already matches.
- Final typecheck passed after method preservation. Extended scratch reproduction confirms a cook's edited dish method survives a new repair operation. CLI preview accepts a compatible four-link Smore subset and rejects the full candidate at the tablespoon/quart mismatch. This is validation evidence, not a live repair.
