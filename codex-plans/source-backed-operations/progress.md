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

## Unit-aware prep scaling checkpoint

- Added exact compatible mass/volume conversion to server PrepTask.syncServings and client EventPrepTaskSynchronizer. Imported quarts remain quarts when a template uses tablespoons. No inferred density, batch size, or count conversion. Recipe changes to an incompatible unit update both quantity and unit together; completed work remains untouched.
- PrepTask.refreshGenerated accepts an optional unit so client reconciliation cannot leave a new numeric quantity paired with an old unit.
- Moved imported prep adoption from direct DB patch to generated PrepTask.linkRecipe after full-suite integration guards caught that violation in the preceding checkpoint. Did not weaken guards or tests.
- Initially-zero event dishes with prep templates no longer roll back or generate a phantom single portion. Actual generated runtime proves zero -> 200 creates exactly one linked asparagus prep row at 37.5 lb.
- Actual runtime proves 200 tbsp -> 3.125 retained quarts, receipt replay/preserved method/completed work, and changing the template to pounds updates number and unit together. Client scratch verifies the same volume result and rejects volume-to-weight inference.
- All nine Smore Bar link candidates now pass preview unit validation. This is not a production repair; source formula reconstruction, broader workflow requirements and live verification remain outstanding.
- Full existing suite: 165 files / 1426 tests passed (one additional generated contract case from the new domain command). Formatting passes. Final typecheck running; previous typecheck passed. Generated outputs regenerated only through isolated Builder and proof:emit.
- Final typecheck completed successfully after the generated linkRecipe command. All checkpoint checks are now green; release gates and live proof are still pending for the full goal.

## Actual batch recipes and measured portions

Repair input now accepts actual component yieldQuantity/yieldUnit plus quantityPerServing measured in that yield unit. Component ingredients remain batch quantities. componentBatchScale expresses that measurement as an exact existing DishComponent batch/servings ratio (e.g. 5 gal with 3 fl oz per guest -> 3 batches / 640 servings), without rounding each event to whole batches. Legacy one-serving projected formulas remain supported until individually reconstructed from source.

The repair reuses an existing identical attachment instead of adding it again under a new repair operation, checks reused component yield against source, and rejects incomplete or unrepresentable measured quantities rather than guessing. CLI --projected-recipes accepts independently source-reviewed projections, includes their content in operation identity and previews before the existing hash-checked apply path. This lets the workbook/photo reconstruction use the same repeatable repair mechanism as the older recipes.json extraction.

Actual Convex runtime reproduction: a 5-gallon recipe with the photographed 1-pound butter batch line, at 3 fl oz sauce per guest, yields 3.9140625 gallons prep and 0.7828125 pounds butter demand for 167 servings. Changing to 200 yields 4.6875 gallons and 0.9375 pounds. Repeating with a new operation creates no extra attachment or ingredient demand. This is a single-ingredient scaling verification, not a claimed complete sauce recipe; disputed Gruyere/cornstarch remain unresolved.

Full suite passed: 165 files / 1426 tests. Legacy and projected CLI preview paths pass. Final typecheck running after the CLI changes. No production mutation or release. Next: construct complete source projections and resolve outstanding source conflicts; audit component recipe links, methods, and all remaining requirement groups rather than treating scaling verification as end-to-end completion.
- Also corrected EventDish.requiredBatches / requiredYieldQuantity to include the attachment batch multiplier before rounding. Generated query proof: 300 sauce portions require two whole batches; ingredient demand remains the exact 1.40625-batch quantity. Full suite rerun passes 165/1426 after regeneration. Final typecheck rerunning for the regenerated query code.
- Final typecheck passed after the batch display regeneration. Source heating/serving workbook reread through mac, rolls, infused water and salad for the next reconstruction step.

## Ashley source candidates and internal provenance

- Compared all 15 event dishes and 71 prep steps directly with the original event costing workbook and fresh snapshot. Every source step has exactly one matching imported prep row; all 71 quantities agree to the source's two-decimal displayed precision after compatible unit conversion. Added the missing literal Batch unit alias to source projection.
- Extracted all 15 heating/serving records directly from XLSX cell XML, with source cells. Thirteen have methods; Chicken Katsu Bao Bun and Fried Gourmet Mac n Cheese Bites do not in this workbook. Continue other source investigation for those methods.
- Created source-linked candidate artifacts: event-methods.json, ashley-source-comparison.json, ashley-prep-candidates.json, ashley-prep-links.json and ashley-prep-candidate-issues.json under .artifacts/operations-source-study. Candidate scripts are extract-event-methods.py, compare-event-source.ts and prepare-ashley-candidates.ts. These are previews, not finished ingredient/component reconstruction or production changes.
- Explicit outstanding differences: Infused Water source 334 servings versus live 167; Hershey bars source 0.33 each/guest versus restored Smore template 1/3; Smore already has a prior recipe fingerprint/method that must be preserved. The Parmesan and sauce ingredient unit conflicts remain unresolved independently of prep quantity agreement.
- Repair CLI now supports --dish-ids to target exact reviewed records instead of changing other same-named catalog dishes. Ashley preview selects exactly 15 dishes and 71 links, with no new dishes.
- Component now has internal recipeSourceFingerprint/recipeSourceText populated through generated draft. New repair-created component descriptions and task instructions no longer carry import hash markers; direct ingredient prep notes no longer receive filenames/source rows. Original input remains in dish/component source text. Legacy marker lookup remains for existing component reuse; existing visible legacy metadata still needs migration with preserved edits.
- Actual batch runtime verification passes with separated provenance and unchanged calculations/replay. Full suite passes 165 files / 1426 tests. Typecheck running. No production writes, no release.

Important remaining migration requirement: replacing an old per-serving component with a newly reconstructed batch must explicitly reconcile the old attachment/contributions, not merely attach another source key. Same-key replay is now safe, but replacement across different source identities still requires a reviewed migration path. Do not apply a broad reconstruction plan until this is handled.
- Final typecheck and formatting checks passed. Checkpoint is ready for branch commit; overall release and deployed verification remain pending.

## Recipe removal and ingredient-edit propagation

Implemented Manifest reactions for DishComponentDetached and DishIngredientRemoved to retire only matching recipe contributions. Detaching also retires the EventDishComponentSeed so reattachment can create one active seed instead of failing its initial-only guard. ComponentIngredientRemoved retires that ingredient's contribution. Added seed refresh for ComponentIngredientAdded/QuantityAdjusted using current EventDish servings. Unit-change cleanup is order-independent: generated reactions sort by target entity, so unconditional retirement after refresh originally erased a same-unit update; retirePreviousUnit now preserves same-unit contributions.

Actual generated-runtime scratch (`reproduce-component-detach.ts`) proves: detached sauce demand becomes zero; reattachment restores it once; other dishes sharing the component retain demand; direct ingredient removal leaves component demand intact; later serving changes do not restore removed demand; changing component ingredient quantity uses the current 200 servings; removing/readding an ingredient clears/restores demand. Full suite passes 165 files / 1429 tests (generated contract additions). Typecheck running. Issue #313: https://github.com/Angriff36/capsule/issues/313.

Broader unit-flow reproduction (`reproduce-demand-unit-change.ts`) proves an outstanding defect: 0.9375 lb demand/need, then equivalent 16-oz batch ingredient update -> demand 15 oz but PurchaseNeed 15 lb. The existing reviseRequired command copies quantity and keeps its prior unit. Must fix compatible-unit normalization/propagation through needs and weekly lines; also audit mixed-unit contributions. Do not release or apply a broad repair while this is unresolved. No production writes. Explicit component replacement mapping, prep history/recipe relinking and the rest of the full goal remain required.
- Final typecheck passed. Purchasing unit bug tracked separately as https://github.com/Angriff36/capsule/issues/314. Green tests do not cover or resolve that demonstrated defect.

## Purchasing and mixed-unit contribution correction

PurchaseNeed.reviseRequired now receives the incoming demand unit and preserves its existing purchasing unit for compatible mass/volume measurements. Equivalent 15 oz demand remains 0.9375 lb on the need and one weekly order line. Quantity and unit move together for an actual incompatible-unit replacement, but broader cross-dimension handling still needs source-supported conversion information.

IngredientDemand.syncFromContributions now uses per-unit aggregate inputs from the reaction to add compatible contributions in the ingredient's catalog unit. Verified 1 lb + 15 oz = 1.9375 lb in demand and purchasing, and 1 cup + 16 tbsp = 0.125 gal through demand and weekly ordering. Existing source contribution units remain intact for traceability and later recipe edits. Aggregate arithmetic only normalizes when every positive contribution belongs to the compatible dimension; unresolved cross-dimension totals retain the prior path and still require an explicit product/data resolution. Do not claim density/count conversion is solved.

Implementation evidence: .artifacts/operations-source-study/reproduce-weekly-unit-change.ts; purchase-unit-tests-final.log (165 files / 1429 tests pass). Final typecheck running. No new authored tests and no production writes. Issue #314 remains open until released/live verified and remaining unit handling is resolved.

Generator limitation found and reported: #315 https://github.com/Angriff36/capsule/issues/315. Command-local AggregateSum compute expressions were silently omitted, leaving doc.total_... reads. Direct/inverse relation hydration in commands also cannot implement this aggregate. Current source uses the supported reaction-param aggregate path, then pure arithmetic in the command. No generated output edited by hand.

Remaining full-goal work includes submitted/fulfilled purchasing changes without losing order history, source-backed existing-data reconstruction/replacement, historical event preservation, completed-work deltas, prep presentation and links, packing, staffing/timeline/forms, My Day, browser checks and release. Green unit-flow checks do not fulfill those requirements.
- Final typecheck passed after the supported aggregate implementation. Compatible mass and volume end-to-end reproductions pass.

## Changes after order submission and receipt-to-stock connection

- Reproduced EventDish.adjustServings rollback after VendorOrder.submit (PurchaseNeed open-only guard). Issue #316: https://github.com/Angriff36/capsule/issues/316.
- Current needs can reopen for reconciliation after ordering/fulfilment. Previous submitted order lines and their demand-link history remain intact; the need points to its latest editable draft. Weekly shortage includes current open/ordered/fulfilled needs, less stock and outstanding committed supply. Submitted/approval-pending lines record their outstanding supply and week; partial receipts reduce that outstanding amount; cancellation releases it.
- Exact runtime proof across two submissions: increase creates 0.46875 lb extra; decrease zeroes the editable draft; later increase updates that same draft to 1.40625 lb; after submitting it, another increase produces only 0.46875 lb extra. Original submitted quantities and units stay unchanged.
- Receipt proof exposed a missing stock connection (UI records a receipt only). Issue #317: https://github.com/Angriff36/capsule/issues/317. InventoryLot now emits its new stock delta, and InventoryItem.receiveDelivery creates/increments stock with exact compatible-unit conversion. Replaying the same receipt lot emits zero delta, preventing duplicate stock. Receipt conversion must be measured when dimensions differ; no density/count assumption is made.
- Partial receiving now moves 1 lb from outstanding supply to on-hand stock without changing the genuine additional shortage. Full receipt-history reconciliation remains required for existing records before production writes.
- Actual scratch script: .artifacts/operations-source-study/reproduce-submitted-order-change.ts; final runtime log submitted-runtime.log. Full suite passed 165 files / 1432 tests before the final draft-supply guard; final suite/typecheck running after it. No authored tests added and no production writes.

Release blockers still to resolve: backfill committed supply for existing submitted/confirmed orders without changing facts; reconcile existing receipt lots versus stock edits before any backfill; verify/manual event orders without a weekly source range; avoid useless empty supplemental drafts on decreases/no change; show surplus or supplier adjustment work clearly; preserve closed event history. The demonstrated weekly-draft sequence is not proof of those cases. Remaining source/data/UI/report/full-goal requirements still apply.
- Independent checkpoint review by gpt-5.6-sol initially REJECTED two gaps: returned approval drafts retained pending supply and generic managers could not finish the new stock reaction. Both are fixed: VendorOrderChangesRequested releases line supply; inventory stock commands allow managers already authorized to receive orders. Regenerated runtime scratch now receives as a generic manager and proves submit-for-approval -> return-to-draft -> unchanged servings retains 0.46875 lb shortage with no self-subtraction. Reviewer re-review APPROVE (bounded checkpoint only).
- Final reviewed source: full suite 165 files / 1432 tests passed; typecheck passed. Evidence submitted-review-runtime.log, submitted-review-tests.log, submitted-review-typecheck.log. Broader release blockers above remain; no production writes.
