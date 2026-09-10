# Progress

## 2026-09-10 linked staff self-service

The shared scheduling prerequisite is committed/pushed as
631af4ce2541343dc0465aebdd3c7b8b785d6516, exact-range gpt-5.6-sol APPROVE.
This continuation repairs #359's real Clerk identity failure and own-record
policy denials in Shift, Assignment, TimeRecord, dated/recurring availability
and schedule notices. Linked staff can perform their own work while existing
workforce access and manager commands retain their boundaries. An unlinked
legacy identity preserves its existing direct-ID path; a linked Person wins.
The base staff role's workforceSelfAccess action keeps these own-record paths
inside the existing organization workforce switch. A reproduced bypass through
staffAccess was corrected before committing. Disabled-domain reads, lifecycle
commands and governed creates now fail for all seven crew roles and admin,
with no data/event writes; re-enabling restores access. The switch fixture is
isolated because generated first registration remains broken in #360.

Schedule acknowledgement now follows the current Person link. My Day removes
its redundant publication-time subject gate, including its stale request to
ask a manager for a link that already exists. No palette, type, radius or
layout changes were made; DESIGN.md's My Day composition remains authoritative.

Seven crew roles pass the actual generated-runtime qualification. Other-user
writes, private reads, manager-only actions, foreign/unlinked identities,
relinking, old-subject revocation and missing notice snapshots are covered.
Actual MyDayPage/generated wrappers with runtime-snapshot transport pass at
390/900/1440, including linked Person/Shift/Event clock-in arguments, lifecycle,
schedule acknowledgement, conflict retry, keyboard activation and no overflow.
See staff-self-service.md and staff-self-service-qualified.json/browser log.

Final `bun run check` after the capability correction passed (exit 0;
165 files/1,458 tests), recorded in check-staff-self-service-switch-final.log.
Independent gpt-5.6-sol APPROVE covers the corrected code and My Day design;
commit and branch push follow. This is not live Clerk/production proof.
#358/#361 staffing and owner coordination, purchasing,
source/data reconciliation, reports/print, release and affected-data proof all
remain part of the full goal. No production writes or deployment occurred.

## 2026-09-10 shared shift scheduling transaction

The timing checkpoint b33b79dde0bf80e032799cb0fdd2984db4f81adf remains
pushed and independently approved. Staffing investigation confirmed #358's
browser-only assignment/shift handoff and found the generated schedule path
bypasses approved time off. An actual generated-runtime reproduction
confirmed existing issue #75; this checkpoint moves that check into the
transactional ShiftScheduled callback and replaces the UI seam's raw writes
and repeated validation with generated Shift_createViaSchedule.

Active-Person and event-presence requirements now live in Manifest source.
Sixteen runtime flags pass in shift-scheduling-qualified.json, including
creation/receipt/idempotency rollback, enclosing-transaction rollback,
boundaries, training/qualification parity, manual splits and preserved
attendance. Typecheck and full `bun run check` passed (165 files/1,458 tests;
check-shift-scheduling.log, exit 0). Independent gpt-5.6-sol APPROVE covers
the implementation; final committed-range confirmation follows the checkpoint.
See shift-scheduling.md for the exact implementation and qualification scope.

The same baseline reproduced the real Clerk-subject/Person-ID guard failure
in Shift.start (#359). The capability-switch qualification found a separate
first-time registration failure (#360) and uses an explicitly marked isolated
row fixture. Neither issue is fixed by this scheduling checkpoint. Event
crew-window propagation, My Day repair, source-data repair, purchasing,
reports/print, release and authenticated production verification remain
required. No Capsule production writes or deployment occurred.

The next-step generated-runtime baseline also confirms that assigning a
Person without explicit times leaves the Assignment untimed despite a fully
configured Event, and neither assignment nor filling a staff need creates a
Shift. Event-manager assignOwner fails its child assignment's workforce
policy; repeating assignOwner as admin fails the already-assigned child's
initialization guard. See staffing-command-baseline.json and its script.

## 2026-09-10 source-backed timing planner (latest)

The preceding untimed/atomic checkpoint is committed and pushed as
`b3be02e5939e7ed300e424e6e827661497e30234`, with exact-range gpt-5.6-sol APPROVE.
This continuation builds persistent planning on that foundation. Event stores
the explicit service anchor and six durations; Manifest computes onsite,
departure, staff-on, cleanup/return and staff-off times. The same transactional
event callback creates/reuses eight shared timeline milestones and updates
calculated work on reschedule. Manual times, notes, assignments, custom work,
performed/reopened work and removals stay intact. Returning a manual block to
the calculated plan is an explicit action with restored keyboard focus.

The generated runtime reproduces training p4's 11:30/08:30/08:00/07:00 example,
limited-service setup, unknown travel, retry, explicit service-offset moves,
invalid-input rollback, role/tenant/version exclusions and preserved work.
Reviewer gpt-5.6-sol caught a historical-event bypass; source constraints now
protect completed/closed-out/cancelled Event timing and both direct child
commands, including missing/deleted parents. Planning/executing/final edits
and ordinary individual timeline corrections remain available. Seventeen
runtime flags pass in `.artifacts/operations-source-study/timing-planner-qualified.json`,
including ambiguous existing-block selection, a final-child version fault
that rolls back preceding child writes, and executing/final/sales-lock edits.

Actual authored UI with generated command wrappers and isolated runtime
snapshots passes keyboard/save-failure/retry/missing-time/preservation/history
checks at390/900/1440; see `timing-planner-browser-qualified.json` and
`timing-{form,plan,preserved}-*.png` in the same artifact directory. Phone and
desktop images were inspected. The final phone refinement places the manual
timing action below the recorded time so it cannot squeeze the time column.
These are isolated-data browser checks, not authenticated production evidence.

Both full `bun run check` runs exited0 with165 files/1458 tests, including
generated contract additions (no new authored tests). The final run after
UI refinements is `.artifacts/operations-source-study/check-timing-planner-final.log`.
Independent gpt-5.6-sol approves the implementation and history fix; its final
documentation count correction is now applied. Exact final working/committed
range confirmation follows the checkpoint.
Regeneration used only the isolated Builder with Manifest3.6.52; generated
files and referenced baselines remain ownership-controlled.

Issue353 remains open: connect these crew windows to staffing assignments and
shifts, reconcile existing source-specific timeline labels and data, and resolve
the recorded NLT/staffing conflicts from the sources. Eight timing milestones
do not prove the complete staffing workflow. Purchasing/week/reschedule/shared
stock, source recipe conflicts, affected-data application, compiler356,
print357, all report/mobile/print outputs, release and authenticated production
proof remain required. No Capsule production data write or deployment occurred.

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

## Purchasing date handoff and manual event orders

- Follow-up verification exposed that all earlier manual-confirm scratch needs were undated: IngredientDemand.confirm omitted purchasingWeekStart from its event and the PurchaseNeed.create reaction. This allowed undefined dates to match and masked manual-order omission. Earlier quantity/receipt assertions remain useful but did not establish week isolation. Issue #318: https://github.com/Angriff36/capsule/issues/318.
- Confirm now carries the stored demand purchasing date into the need. With that fixed, event-linked manual order supply reproduced the expected failure: draft stayed 0.46875 lb instead of 0.21875 lb after a 0.25 lb manual order. VendorOrder submit/approval now supplies its range start or linked event date to line commitSupply; the corrected runtime passes at 0.21875 lb.
- A subsequent event dated one week later confirms into a separate dated draft; it excludes the previous week pending supply and leaves the earlier draft unchanged. Scratch reproduce-manual-order-supply.ts; evidence purchasing-date-runtime.log, manual-order-dated-before.log. Full suite passes 165 files / 1432 tests. Typecheck/review pending.
- Date work remains incomplete: Event.purchasingWeekStart currently stores exact startsAt, not an actual normalized purchasing week; rescheduling needs downstream date reconciliation; undated historical records need careful repair. On-hand is independently subtracted per week and still needs allocation across competing future requirements. Empty supplemental drafts remain unresolved. No production writes; full source/data/UI/report/release goal remains active.
- Purchasing-date checkpoint final typecheck passed; independent gpt-5.6-sol review APPROVE. Approval covers this date handoff only, not remaining workflow/release requirements.

## Ingredient identity during source reconstruction

Repair no longer creates a second catalog ingredient solely because a source uses ounces where the catalog uses pounds (or another compatible mass/volume unit). It prefers exact units, otherwise requires one compatible same-name active ingredient. Explicit reviewed IDs also allow compatible units. Recipe line quantities/units remain source measurements. Newly created ingredients join the candidates immediately, so mixed units inside one repair also share one identity. No density/count conversion is inferred.

Runtime scratch reproduce-repair-ingredient-units.ts verifies one existing pound Butter receives a 2-ounce dish line, one new Flour is reused across ounce/pound lines, and eight servings add exactly one pound to the existing Butter demand. Full suite 165 files / 1432 tests and typecheck passed; evidence repair-ingredient-units-runtime.log, repair-unit-tests.log, repair-unit-typecheck.log. Issue #319 https://github.com/Angriff36/capsule/issues/319. No production writes. Independent checkpoint review requested; full recipe replacement and affected data repair remain required.

- Additional scratch checks passed for explicit compatible ingredient IDs and ambiguous same-name compatible catalog entries (no silent choice or duplicate creation). Reviewer found one duplicate import, now removed; no behavioral finding.

## Full Ashley ingredient evidence map

Created ashley-recipe-evidence.md from the previously extracted original event costing workbook and event-method workbook: all 15 finished dishes, 71 prep steps, 113 nested ingredient rows, exact source row addresses and service-method cells. 28 steps have no nested ingredient rows in that workbook; this is not a claim that their recipes are unavailable elsewhere. The map separates work, separately prepared component candidates and equipment-dependent work without blindly turning each named step into a component.

Direct inspection found additional material source inconsistencies: salad gorgonzola is costed as fennel; togarashi prep uses grams while costing uses quarts; chicken step says 6 oz each while costing uses 10 oz per serving; bruschetta description requires tomatoes omitted from its costing block. The existing honey-butter photograph has an unspecified tub mass and a different formula. Equipment-dependent fryer oil (53/18 lb by fryer) and one infusion kit per beverage container cannot be scaled as generic per-guest recipes. These join the prior sauce/Parmesan conflicts; do not apply the prep-only candidate as a complete recipe repair.

Evidence map has 13 flagged source steps (some share a root discrepancy), with the complete ingredient rows retained for comparison. Original extraction remains unchanged. Next reconstruct the referenced subrecipes from other source recipe blocks/photos, resolve ingredient conflicts using corroborating source, and preserve existing work before applying data repairs. Previous ingredient-unit checkpoint 63799b51 received final independent gpt-5.6-sol APPROVE after duplicate-import cleanup and was pushed; no production writes or release.

## Historical event catalog-reaction isolation

Actual generated-runtime reproduction showed a completed event's 0.7828125 lb demand changing to 1.565625 lb when its shared recipe ingredient doubled. Issue #321 https://github.com/Angriff36/capsule/issues/321. This is a release/data-repair blocker, not merely a display issue.

EventDish, EventDishComponentSeed and EventIngredientContribution now carry catalog-routing keys. New rows populate them; EventCompleted/EventCancelled refresh them using actual event state. Completed, closed-out, cancelled and deleted events are excluded; active kitchen stages remain connected with no new operating guard. Catalog additions/changes/removals use those routing keys. Runtime now preserves completed demand quantity AND version; existing active recipe-removal/serving/purchasing flow still passes.

Authored reconcileImportedEventRecipeSync provides an administrator per-event backfill, verifies the reviewed event version/tenant, and invokes generated refresh commands only for mismatched keys. Scratch removes fields to simulate old active records: backfill changes3 rows without demand changes; replay changes0. Backfill MUST run for existing active records before production catalog reconstruction, otherwise their absent keys skip catalog reactions. No production migration has occurred. Independent gpt-5.6-sol review APPROVE covers source/generated routing plus migration seam; it is not a full release approval.

Evidence: reproduce-historical-recipe-edit.ts, historical-recipe-before.log, history-sync-runtime.log, history-sync-active-runtime.log under .artifacts/operations-source-study. Full suite 165 files / 1435 tests passed (three generated contract cases); final typecheck pending. Historical recipe displays/costs/reports still derive some live catalog data and need their own snapshot verification. This routing correction does not claim the whole history requirement is solved.

- Final typecheck passed after the migration seam and deleted-event predicate. No authored tests added.

## Explicit source component replacement

Implemented optional componentReplacements in the administrative recipe repair: each mapping names one existing DishComponent, expected version and target source component key. Server validates tenant/dish/version/unique mapping; CLI --component-replacements validates snapshot and includes the mapping in operation identity and reviewed plan hash. No name-only automatic replacement.

Repair initializes legacy routing for affected events, detaches the old contribution, reconnects matching active recipe templates, relinks pending/claimed prep through a generated command, and attaches the new measured recipe. Quantity, notes, status and assignment fields are preserved; started/completed prep and completed/cancelled event references stay on the prior component. The prior component remains available for historical work. Repeat request uses the existing materialization receipt.

Scratch reproduce-component-replacement.ts verifies exact corrected demand 1.565625 lb (not old+new), one active attachment, pending quantity/chef note/claimed state unchanged, completed-event demand exact document equality and old recipe reference, and replay without duplication. CLI preview succeeds with the same scratch snapshot/source/mapping; replacement-preview/plan.json contains the hashed target and explicit old attachment. Issue #322 https://github.com/Angriff36/capsule/issues/322.

Independent gpt-5.6-sol review APPROVE. Full suite passed 165 files / 1436 tests before final nullable-optional argument normalization; final suite/typecheck running. No production writes. Source conflicts, broad migration planning, in-progress/completed-work quantity deltas and historical recipe/cost/report rendering remain part of the full goal, not solved by attachment replacement alone.

- Final typecheck and final 165-file / 1436-test suite passed after optional argument normalization. Replacement runtime proof passed again.

## Source-backed raspberry balsamic batch qualification

Found and cross-checked the complete three-quart raspberry balsamic vinaigrette recipe in original Salad_Dressing.xlsx sheet1 rows336-352 (duplicated in Buffet_Style/Heart_City exports). Its eight ingredient amounts and method are present; no missing density/yield assumption needed. Ashley salad uses two fluid ounces per serving:167 servings=334floz=10.4375qt=3.4791666667 batches. Every ingredient agrees with the event costing rows260-274 to1e-8 in compatible units.

Durable component candidate: recipes/raspberry-balsamic.json; source and ingredient comparison: raspberry-balsamic-source.md. Actual generated-runtime scratch reproduce-raspberry-source.ts creates one measured component, eight ingredient links, stored method and a PrepTask pointing to that component. It verifies10.4375qt prep and all eight event demands at167 servings, then20.875qt and double demand at334 servings. Evidence raspberry-source-runtime.log and raspberry-balsamic-verification.json under .artifacts/operations-source-study. This is a real source example, not an invented one-ingredient fixture.

Only this dressing is reconstructed by the candidate. Salad gorgonzola identity/quantity conflict and other dish ingredients still require resolution. No production write, no rendered UI link verification yet, and no claim of full workflow completion. Existing code unchanged this checkpoint; source candidate and evidence added.

## Existing template component link restoration

Recipe repair previously skipped an existing matching DishTask after checking quantity/unit, even when its componentId was absent. A restored component therefore remained disconnected from the existing template and adopted prep. The repair now fills only an absent template component reference through DishTask.revise, retaining the current name, quantity/unit, category, station, ordering, ingredient link and chef instructions. Existing non-null recipe links still require explicit replacement.

Real-source runtime reproduce-existing-template-link.ts starts with an unlinked raspberry dressing template plus an imported event prep row. Explicit prepLinks adopts that same row (one task, same ID), preserves both template and event chef notes, connects it to the measured component, and verifies all eight source ingredient totals and prep at167/334 servings. Evidence existing-template-link-runtime.log. Full suite passes; final typecheck/review pending. This closes another part of #310 without any production write or UI completion claim.

- Final typecheck passed; independent gpt-5.6-sol review APPROVE. Full suite165 files/1436 tests passes. Resume section in task_plan.md refreshed to current source/implementation state and full remaining scope.

## 2026-09-09 — container packing synchronization in progress

Issue #323: https://github.com/Angriff36/capsule/issues/323. Generated container lines stayed at four after servings changed from167 to300 with a synthetic50-serving capacity (expected six). The capacity is a runtime fixture, not an operational recommendation.

Uncommitted Manifest repair adds event-dish linkage, automatic/manual quantity intent, repeatable container materialization, serving/removal synchronization, retired-template filtering, and preserves physical packed quantities when plans shrink. A shortage reopens a packed item to listed. Focused scratch runtime proves four-to-six scaling, repeat reuse, packed-count preservation, reopening, manual override, and retired templates omitted on a new list.

Regeneration initially failed on ambiguous number property; containerServings now uses int. Then full tests caught loss of createViaAddItem: Manifest initialization selection ranks required-field mutation footprint, not command order. Removing redundant FK mutations from ensureContainer restored the original generated API. Fresh suite passes165 files/1439 tests; typecheck running at this entry. Reviewer first REJECTed missing API and has been asked to re-review corrected tree. Nothing committed, applied to production or released in this packing slice.

Continue before packaging this repair: qualify removal/zero and duplicate menu lines, preserve historical/dispatched records, migrate existing packing links without duplicates, complete additions/catalog-change propagation and parent readiness. Inspect retired-template behavior for existing lists and permission/cascade behavior for logistics roles. Full UI/output/data/release goal remains incomplete.

Packing checkpoint follow-up: typecheck passed. Extended actual-runtime checks pass distinct event-dish lines for the same dish, zero servings, restoration and removal to zero. gpt-5.6-sol independently APPROVED the corrected bounded diff after verifying createViaAddItem restoration. This is not whole-branch/release approval. Evidence: packing-sync-runtime.log, packing-sync-tests.log and packing-sync-typecheck.log in ignored operations-source-study scratch.

## 2026-09-09 — packing additions and readiness

Follow-up to #323: proved a new EventDish added after a pack list opens produces no packing line unless an operator reopens the list. Added EventDishAdded -> active PackList -> container materialization. Generated requirement events now reopen packed/loaded parents to packing if a container shortage exists, preserving previous packing/loading timestamps and delivery identity. Terminal dispatched/cancelled lists are excluded from new-dish materialization.

Actual generated-runtime qualification: .artifacts/operations-source-study/reproduce-container-addition.ts and packing-addition-runtime.log pass automatic addition, serving scaling, manual override preservation, zero/restoration/removal, loaded-parent reopening, repacking without duplicate delivery, and no new lines or changed planned quantity on dispatched lists. Synthetic capacity remains a synchronization fixture only. Full existing suite165 files/1441 tests passes; typecheck passes. gpt-5.6-sol independently APPROVED this bounded diff, explicitly not release approval.

Next packing work remains existing-row adoption/backfill without duplicates, active catalog changes (capacity, retirement, reinstatement) and source equipment quantity reconstruction, plus rendered flows. Full source-backed data/UI/report/release objective remains active and incomplete.

## 2026-09-09 — container catalog changes reconcile packing

Follow-up to #323: actual generated runtime proved changing a container capacity from50 to100 left an existing167-serving packing requirement at4 instead of2. Added template revise/retire/reinstate reactions using the packing line's retained containerServings. Retired templates yield zero automatic requirement; reinstating restores it. Manual quantities and dispatched/cancelled plans remain unchanged.

Kitchen_staff qualification caught a policy rollback when catalog changes reached PackListItem and parent PackList. Shared packing policies now allow kitchenAccess. PackList.open retains its pre-existing logistics/manager authority via a command guard; the existing denial test exposed unintended header creation and passes after correction. No authored tests changed. gpt-5.6-sol independently APPROVED the final bounded diff including that guard.

Evidence: ignored reproduce-container-catalog.ts, container-catalog-before.log, container-catalog-role-before.log, packing-catalog-runtime.log. Scratch proves capacity correction, retirement/reinstatement, kitchen_staff correction, manual override preservation and dispatched planned quantities. Existing suite165 files/1441 tests passes; typecheck final process pending at this entry.

Remaining packing work: safe adoption of existing pre-metadata rows without duplication; new catalog template creation on already-planned events; source-backed capacities/fixed equipment quantities; catalog display details and historical records; rendered end-to-end verification. No production writes/release. The complete original workflow/data/UI/report goal remains active.
`nPacking catalog final typecheck completed successfully (exit0).

## 2026-09-09 — legacy packing adoption WIP and live inventory

HEAD97bbded6 remains last pushed checkpoint. New uncommitted reconcileImportedPackingLinks in convex/lib/culinaryOperations.ts validates explicit parent/item/EventDish/container snapshots, tenant/event/dish identity, duplicate targets and manual-vs-automatic quantity intent. Scratch reproduce-packing-adoption.ts demonstrated preserved physical facts/manual quantity, exact replay with no rewrites, reopening without duplicate materialization, automatic scaling, admin auth and stale/duplicate rejection.

Live read-only inventory refreshed in live-packing-20260909.json:8 lists(5draft,1packing,2dispatched),311 lines,12 container refs,0 eventDish refs,10 active templates. packing-adoption-candidates.json maps the12 by exact IDs:9 active unique candidates and3 historical rows; no unmatched/ambiguous links. This is NOT a migration application. Most311 lines lack container refs and need their own source classification; do not guess them by name.

Current WIP is NOT passing or approved. Reviewer rejected unchecked public adoptContainerLink command. Removing it and performing validated metadata patch inside seam passed runtime review but failed3 existing generated-write integration guards. Restored generated command with explicit identity count guard; regen fails because Convex cannot resolve aggregate expression in guard. Issue #324 filed (related#315). Current source includes this unsupported guard; generated output does NOT have the command, so latest scratch fails missing export. Do not commit/push/release this WIP as passing.

Resume: resolve the supported generated validation/lookup boundary (inspect Manifest projection, no hand edits to generated Capsule code, no guard-test weakening), enforce direct-call identity/history/duplicate/unit/snapshot invariants, regenerate, rerun scratch/fulltests/typecheck and independent review. Previous provisional APPROVE applied only to removed direct-metadata-patch approach, not current code. Latest final tests logged3 integration failures before guard trial; typecheck session84309 was running on the prior patch version and is not final evidence. No new livewrites or deployment. Whole originalgoal remains active.
Refined diagnosis against published3.6.48: docs/spec/builtins.md scopes entity-count scans to reaction params, so extending them to guards is not the necessary fix. Rewrote Capsule adoption guard using supported count_of(filter(self.packList.event.eventDishes, (item) => ...)). Generation succeeds, but runtime fails: undefined is not an object (evaluating __rel_packList.event.eventDishes).

Generated runner hydrates doc.packList.event.eventDishes but evaluates the guard against separately loaded __rel_packList.event.eventDishes. Its lambda also emits item.id rather than item._id. These are concrete projection defects on the supported relationship-aggregate path.

Isolated upstream worktree C:/Projects/Manifest/.worktrees/packing-adoption-guards on branch fix/packing-adoption-guards from origin/main eebf1e2 (published3.6.48). Main Manifest checkout has unrelated dirty changes and is preserved. Dependency installation passed; baseline tests started. No production modifications.

Upstream continuation details: new isolated Manifest worktree has no source edits yet. Baseline pnpm test is live at exec session97418, log manifest-adoption-baseline.log. Early CLI gen-tests failures observed while suite continues; inspect actual final output, do not restart due quiet log. Install succeeded with expected unbuilt CLI bin warnings. Read AGENTS.md fully; began mandatory spec reading (builtins/conformance/README read, adapters output truncated). Before upstream edits still read full compliance matrix, IRschema, semantics, adapters remaining, manifest-vnext and boundary contract per AGENTS. No upstream semantic change is intended: fix hydration/read object mismatch and logical-id lowering. Capsule source currently uses supported count_of(filter(...)) guard, regeneration succeeds, actual runtime fails __rel_packList.event.eventDishes. Current adoption remains uncommitted/unapproved with missing final direct-call invariants (duplicate/history/snapshot protection must also be qualified).

## 2026-09-09 — upstream baseline established

Isolated Manifest worktree C:/Projects/Manifest/.worktrees/packing-adoption-guards at eebf1e2 is still source-clean. Initial baseline16 CLI failures came from unbuilt dist modules. pnpm run build:lib succeeded; rerun left one built-CLI help test failure. pnpm --filter @manifest/cli run build succeeded; fresh full pnpm test now passes312 files/4488 tests,8 files/60 tests skipped. Evidence manifest-adoption-baseline-ready.log (exit0), manifest-adoption-build-baseline.log, manifest-adoption-cli-build.log. No tests weakened and no upstream code edited. Sessions97418,84436,49917 are terminal; do not poll/restart them.

Mandatory upstream reading progress: manifest-vnext.md read fully this continuation; semantics.md lines1-300 read. Earlier builtins, conformance and README read. Still finish semantics301-end, full IRschema, full compliance matrix, adapters (prior large output was truncated) and Manifest/Builder boundary before source edits. Governing known law: relationship traversal must resolve hasMany/belongsTo; arrays filter/count_of are supported in guards. Entity-scoped count scans are reaction-param syntax, so fix supported relationship projection without extending language meaning. Existing Capsule adoption trial exposes __rel_packList versus doc.packList hydration mismatch and lambda item.id versus Convex _id. Full goal remains active; no production writes.

## 2026-09-09 — upstream nested guard fix under review

Mandatory Manifest documentation reading is now COMPLETE: full compliance matrix, IR v1 schema, semantics, builtins, adapters, conformance, vNext, spec README, and Manifest/Builder boundary. Do not repeat these reads on a compaction continuation of this session.

Isolated upstream fix/packing-adoption-guards now has uncommitted source changes in aggregate-hydrate.ts, functions.ts, count-of-preload.ts, expression.ts, and a new nested-aggregate-guard.test.ts. Matrix PARTIAL row, spec Nonconformance, and TODO entry record the defect before implementation. The regression executes the actual generated mutation via TypeScript transpilation and a small DB test double. It first reproduced the exact undefined eventDishes failure; sharing the resolved root relationship fixed the crash and exposed the logical-id guard failure. Entity callback id lowering then made the valid case pass. The test preserves ordinary object id fields, rejects another event's menu line, and rejects cross-tenant rows at list, event and menu-line hops. Tenant test explicitly declares tenantId properties as Capsule does.

Validation: full pnpm test passes313 files/4490 tests,8 files/60 tests skipped (manifest-adoption-test.log). Typecheck passes all projects after replacing unsupported Array.at; lint passes. build:lib passes (manifest-adoption-build.log). docs:check initially failed only generated FEATURE-LIST drift; regenerating through pnpm docs:feature-list. gpt-5.6-sol independent review requested from existing /root/review_purchasing_receipts agent; verdict pending. No upstream commit/push/publish yet; no Capsule dependency/pin changes. Capsule last pushed97bbded6 and adoption WIP remain unapproved and not qualified with the generator fix.

Next: resolve review findings, finish docs gates, commit proof and matrix SHA in proper sequence, publish reviewed registry patch through Manifest workflow; pin Capsule and isolated Builder to that version and regenerate (never file/link dependency or generated hand-edit). Re-run Capsule packing adoption runtime and add missing direct command duplicate/history/version invariants before data application. Entire original source-backed workflow/data/rendered app/release goal remains active; no production writes or deployment.
Upstream checkpoint advanced: implementation/test committed6ea86b6; precise proof documentation committed0a420e2 and branch pushed. PR https://github.com/Angriff36/Manifest/pull/75. gpt-5.6-sol APPROVE covers total diff, including final docs; PR body updated. docs:check final passes (manifest-adoption-docs-final.log). Linux/Windows GitHub CI run34377614573 is in progress. Manifest cut-release workflow reads main, so merge the reviewed green PR before dispatching patch release. Current registry version verified3.6.48. No merge/publication yet.
Upstream PR75 is MERGED at06abb1c0b9cb644539179010591026c373b4f764 after Linux and Windows CI both passed plus independent gpt-5.6-sol APPROVE. Cut Release patch workflow dispatched: run34378180813, source merge06abb1c. Publication not yet verified; expected next patch3.6.49, verify registry rather than assume. Manifest review/merge is complete, Capsule production release is not.

While CI ran, Capsule adoptContainerLink gained required expectedItemVersion/expectedPackListVersion/expectedEventDishVersion/expectedContainerVersion params, active-event/list/container guards, and duplicate packList.items check. Wrapper now carries validated versions and reads current parent version per pending line (earlier sync in the same transaction may reopen it; entire external snapshot was prevalidated). Scratch reproduce-packing-adoption.ts appended direct-command stale/history/duplicate rejection cases. These Capsule edits are NOT regenerated or tested yet; existing generated files still expose old signature. Do not typecheck/claim passing until registry integration and regeneration.

Builder isolated checkout inspection: C:/Projects/builder-source-operations currently has package.json/package-lock.json changes from3.6.41 to^3.6.48 (prior task setup), preserve and update only Manifest pin after publication. Main/shared Builder remains untouched. Its AGENTS.md was read fully; CogniLayer tools are unavailable, ordinary file/source verification used. No memory writes authorized.

## 2026-09-09 — published guard fix integrated; computed callback follow-up

Manifest PR75 merged06abb1c; release34378180813 succeeded, npm3.6.49 integrity verified. Capsule bun add --exact @angriff36/manifest@3.6.49 and bun run manifest:regen (BUILDER_DIR=C:/Projects/builder-source-operations) succeeded; Builder sync installed3.6.49 automatically. proof:emit succeeded. Logs packing-adoption-regen-349.log / packing-adoption-349-runtime.log. Actual adoption runtime now passes manual quantity and packed facts preservation, exact no-write replay, no duplicate materialization, automatic scaling, wrapper auth/stale/duplicate selection, and direct generated stale item/list/menu/container versions, completed/closed/cancelled event history, and duplicate target rejection. No production data changed.

Capsule full suite initially exposed existing reports-routes test flake: two independent Date.now() calls sometimes sorted paid invoice first. Existing fixture now captures one issuedAt for both same-time invoices; no tests added/expanded and no assertion weakened. Focused reports10 tests and fresh full suite165 files/1442 tests pass (packing-adoption-349-tests-final.log).

Integration typecheck FAILED13 generated errors: item.estimatedCost on Doc<eventDishes> in computed.ts/queries.ts. 3.6.49 filtered collection inference assigned a stored Doc type to a callback reading hydrated computed fields. Do not claim Capsule typecheck passes or commit/release current generated output.

Upstream follow-up in same isolated worktree, NEW branch fix/aggregate-computed-lambda-types from origin/main62f5a4c (v3.6.49). Mandatory docs remain fully read in this session. Fix count-of-preload.ts: lambdaReadsHydratedField includes computed-property names as well as relationships; callback-free entity detection still supports logical id lowering. Added real TypeScript createProgram + runtime total regression in parent-child-computed-hydrate.test.ts:74-117. Important: virtual-source host normalizes resolve(name); getPreEmitDiagnostics includes missing-source failures. Test reproduced TS2339, now passes.

Upstream4491 tests passed,60 skipped; typecheck/lint/docs gates pass. Implementation2a4798d, proof docs a8a7c9d committed and pushed. gpt-5.6-sol APPROVE implementation; final doc-only review requested. PR https://github.com/Angriff36/Manifest/pull/76 created. Must wait both CI platforms green and final review, merge, dispatch cut-release patch, verify npm (likely3.6.50), integrate Capsule/Builder via normal regen, re-run actual scratch/full suite/typecheck and Capsule independent review. Upstream processes70762/73763/49634 terminal exit0. Capsule typecheck49334 terminal exit2. No running local processes remain from this continuation.

Whole original source-backed workflow/data/UI/release goal remains active. All current Capsule adoption, pin, generated and report-test edits uncommitted; last pushed97bbded6. No Capsule production release or live data repair performed yet.

Follow-up status: Manifest PR76 HEAD17ea8b5 has final gpt-5.6-sol APPROVE after correcting a stale prior-publication label (6ea86b6 shipped3.6.49; new2a4798d remains unpublished). CI run34379390471 on that HEAD is still running. Capsule authored adoption diff against97bbded6 also independently APPROVED by gpt-5.6-sol, explicitly bounded/not full release approval; known generated3.6.49 typecheck issue remains until PR76 is published and integrated.

Packing source inventory refinement (read-only existing snapshot): the12 container-linked rows span9 active/3 historical; active9 include6 Mendenhall/Jarvis rows plus Corporate/TEST rows. Templates for Mendenhall have half-pan capacities58/59 and own-GF-vessel59; these must not be accepted as source-proven physical capacities merely from row presence. Current live catalog scripts/tpp-mendenhall-jarvis-catalog.ts has different preset capacity values (many20/25, dispensers49). Investigate actual event source before choosing automatic adoption intent; keep fixed event quantities distinct from reusable container capacity. No data changes. eventMenuLineFields.ts parses leading event notes such as1 Half pan/3 Foil wrap as containerCount; this is event quantity, not physical capacity proof.

## 2026-09-09 — Manifest3.6.50 integrated

PR76 green Linux+Windows and final independent APPROVE merged b8d38b9663670c3a770c8a5c0df0b67abe450341. Release34379987176 succeeded; npm3.6.50 and dist integrity verified. Capsule installed exact3.6.50, Builder synced automatically, manifest:regen and proof:emit passed. Logs packing-adoption-350-regen.log/runtime.log/tests.log/typecheck.log. Actual adoption runtime again passes all preservation/replay/scaling and direct rejection cases. Fresh existing full suite165 files/1442 tests passed exit0. Current typecheck session43271 is still running with no diagnostics yet; inspect actual completion before commit. Earlier350 test session83436 and regen95921 terminal success.

Manifest upstream current branch remains fix/aggregate-computed-lambda-types at17ea8b5 (merged/released, isolated worktree not yet synced to release); no uncommitted upstream changes expected. Capsule remains uncommitted adoption checkpoint on fix/source-backed-catering-workflow last pushed97bbded6, with all intended authored/generated changes plus exactpin/bun.lock and existing timestamp fixture stabilization. Independent gpt-5.6-sol APPROVE covers authored adoption and upstream patches; final generated integration confirmation still needed after typecheck. No production Capsule writes/deployment. Whole original goal remains active.
Final3.6.50 integration typecheck completed exit0 (session43271 terminal). Capsule runtime and full tests/typecheck are now green for this bounded adoption checkpoint. Full bun run check, rendered desktop/mobile validation, complete source data repair and production release remain outstanding for the overall goal.

Packing adoption checkpoint COMMITTED and PUSHED418670c7 on fix/source-backed-catering-workflow. Final typecheck exit0,165 files/1442 tests pass, actual adoption runtime passes, and gpt-5.6-sol final generated-integration APPROVE. Precommit secret scan clean3126 tracked files; branch pre-push manifest-regen-check confirms generated output current. No production deployment/data writes. This paragraph is the only post-commit tracked WIP; preserve ignored/untracked baseline caches.

Resume full source-backed goal beyond this checkpoint: source-qualify Mendenhall fixed container counts vs physical capacities and Ashley299 non-container-linked packing rows; implement source-backed equipment quantities/catalog additions and safe reviewed adoption application. Also continue all task_plan requirements for recipes/data repair, purchasing/history, prep/report links and hierarchy, event/staff/MyDay screens, rendered desktop/mobile verification, full check, final whole-branch independent review, authorized Capsule release and authenticated production proof. Do not describe full goal as complete. All local validation sessions are terminal; no remaining tool process to poll. Upstream PR75/76 are merged and published through3.6.50; no further upstream repair currently pending.

## 2026-09-09 — Ashley packing quantities and associations reconstructed

Read-only source work continued beyond pushed418670c7. New durable packing-source-reconciliation.md records original cells/pages, quantities, missing associations and unit errors. Four ignored scratch extraction/comparison scripts now reproduce JSON evidence; no authored application changes or live writes this continuation.

Corrected grouped XLSX parser to recognize food/drygoods/Cambro/beverage/Catering Kit headings instead of attaching headings as item notes.160 grouped items;234 live Ashley items;218 live rows match158 source identities. Five small total differences are two-decimal report rounding, not quantity corruption. Five chafers and10 Sterno reconcile as per-dish allocations. BOH trash3+1scullery reconciles4. Good Shuffle Pro Order1 missing; Nutella0 omitted;16 equivalent/unspecified-equipment live rows have no source match and remain preserved.

Coordinate-aware REF-pack-list.pdf extraction produced221 allocation rows with page/bbox, true multiline association headings and per-column notes. Match qualification yields191 unique source associations (141 recover Show Association),27 ambiguous and16 no-source-match.184 total live rows contain Show Association (168 in grouped-name matches+16unmatched). Do not confuse all311packingitems /299withoutcontainerrefs with Ashley234. Do not assign identical physical rows by array order.

Five confirmed fluid volume import errors: BaconJam10.5fl oz,Caramel83.5,Chocolate83.5,chickenCreamSauce167,BalsamicGlaze10.5 all stored as mass ounce. UnitOfMeasure lacks fluid ounce but supports tablespoon/cup/quart; use exact volume conversion with required+packed quantities, never density guesses. No repair applied. Source quantities are event facts, not proven reusable container capacities. Source by-dish ingredients still conflict with costing/prep quantities, so grouping recovery does not resolve those conflicts.

Resume next: implement source-qualified non-container packing repair and actual future packing model through proper authored Manifest commands/seams, without treating food/ingredients/equipment all as DishContainer. Preserve snapshot versions, physical work and history, carry provenance internally, qualify ambiguous associations separately. Continue whole original task_plan scope (source recipe/data reconstruction, completed-work deltas,purchasing/history,UI/reports/MyDay,desktop/mobile,fullcheck,finalreview,authorizedrelease/authenticatedprodproof). Current tracked WIP progress.md plus new packing-source-reconciliation.md only; scratch ignored. All commands this turn terminal. No running validation process. Do not claim overall completion.

## 2026-09-09 — fluid-volume repair and future import correction

Implemented source-owned PackListItem.correctImportedFluidOunces plus unitCorrectionSource provenance and culinaryOperations.reconcileImportedPackingFluidOunces. Reviewed non-template ounce rows convert required and packed quantities /8 to cups, preserving description, status and packing timestamps. Direct command rejects stale/history/template/already-corrected rows; wrapper prevalidates batch and exact source-marker replay returns changed0 without rewriting. Five-row before/after snapshot payload .artifacts/operations-source-study/packing-fluid-repair-preview.json prepared, NOT applied.

Tracing future entry found CapsuleMeasureUnit.toCapsuleUnit discarded the Oz - Fld qualifier and all three event bundle prep/packing/purchasing paths used artificial minimum1 quantities. New paired toCapsuleMeasure preserves volume and positive fractions; prep retains explicit0, pack/order0 creates no phantom requirement, missing/unknown measurements surface warnings instead of each1. Removed unused wholeQuantity helper. Supply pairs purchase quantity with purchase unit, avoids zero-only vendor orders and no longer creates unknown-unit ingredients as each.

Actual generated mutation reproduction packing-fluid-runtime.log passes repair volume/physicalfacts/replay/stale/history/auth and future bundle prep20.875cups,0.03gallon,pack1.3125cups,purchase0.0625cups through actual commands. Full existing suite165files/1443tests passes; final typecheck exit0 (session89863 terminal). Initial typecheck27996 terminal0 too. Regeneration/proof emit succeeded with isolated Builder. No new/expanded authored tests. Independent gpt-5.6-sol APPROVED bounded repair; review of additional future-import mapper changes pending. Do not commit until final review resolved. New issue https://github.com/Angriff36/capsule/issues/325 remains open for release/live repair.

Whole goal still active: source-qualified association and food/equipment model, full recipe/data reconstruction, performed-work deltas,purchasing/history,UI/reports/MyDay,desktop/mobile,fullcheck,finalwholebranchreview,authorizedrelease/authenticatedproductionproof remain required. No live data writes or Capsule production release. Current checkpoint WIP includes authored unit import/repair changes, generated ownership/proofs, source reconciliation doc and progress. Preserve unrelated baseline caches.
Final gpt-5.6-sol independent review APPROVES the connected import measurement changes as well as the generated fluid repair. Final typecheck passed and reviewer notified. Targeted formatter passes. Issue324 updated with published3.6.50 integration evidence; issue325 tracks fluid-unit/fractional import repair through eventual release/live application. This is checkpoint approval, not full-goal release approval.
Checkpoint e30b0a36 COMMITTED and PUSHED on fix/source-backed-catering-workflow. Precommit secret scan3137trackedfiles clean; prepush manifest-regen-check current. Final independent gpt-5.6-sol APPROVE covers both source unit repair and future import mapping. Full165files/1443tests, typecheck, actualgeneratedruntime, targetedformat allpass. No Capsule production write/deploy. Final commit/push sessions10443 and push command terminal success. No running local validation handles remain.

Resume full goal from e30b0a36. Unit correction five-row payload exists but applies only after authorized release and fresh snapshot validation. Source missing packing associations and appropriate future food/equipment representation remain next; don't treat this unit-only command as completion of packing repair. All prior task_plan requirements remain. Current sole postcommit tracked change is this progress entry; unrelated untracked baseline caches preserved. Upstream Manifest3.6.50 remains integrated; no new upstream work pending.

## 2026-09-09 — new catalog containers reach existing packing lists

Previous goal turn e30b0a36 was concrete progress, not blocked. Re-read goal attachment this turn. New runtime reproduction showed DishContainer.define after PackList.open left0items(expected1). Implemented Defined/Revised/Reinstated -> active EventDish.requestCatalogPacking -> every active PackList.requestDishContainers -> existing idempotent ensureContainer. EventDish shared policy admits kitchen for these catalog-triggered helpers; all menu composition manage guards remain, and confirmFromProposal explicitly retains manage/sales authority. Corrected policy comment for this path.

A second actual runtime case showed template revision rewrote completed-event requirement4to2. syncContainerServings now excludes completed/closed_out/cancelled/deleted event history. It preserves physical quantities/status/timestamps; generated no-op invocation can still increment version/updatedAt, so do not claim byte-identical historical docs. New event routing uses existing recipeSyncDishId lifecycle key; legacy data needs the already-built reconciliation/backfill before source catalog application.

Scratch reproduce-packing-new-template.ts / packing-new-template-runtime.log pass: newtemplate into existing list; kitchen addition across2active lists; removed menu line ignored; completed event requirementpreserved; manual7packed4/status/timestamps preserved; repeat no duplicates; kitchen cannot use confirmFromProposal to change servings; reinstatement creates missing2rows for line added while retired, preservingmanual7. Capacity50/100 are synthetic isolation values, NOT proposed source capacities.

Regeneration and proof emit pass with Builder C:/Projects/builder-source-operations. Full165files/1444tests pass (packing-new-template-tests.log), typecheck70349terminalexit0 (packing-new-template-typecheck.log). Tests87196 and combinedregen68186 terminalexit0. Independentgpt-5.6-sol APPROVE bounded full authored/generated checkpoint, noUI. Last source edit was comment-only then finalregen/proofemit logs. Issue323 updated with evidence. No Capsule production writes/deploy. Full originalgoal remains active: packing source associations/model/data, recipes/purchasing/history/performed-work/UI/reports/MyDay/desktopmobile/fullcheck/finalreview/release/authenticatedproof allremain.
Checkpoint09ef6f4f COMMITTED and PUSHED on fix/source-backed-catering-workflow after independentgpt-5.6-sol APPROVE, full165files/1444tests,typecheck and actualruntime pass. Secret scan3146trackedfiles clean; prepushmanifest-regen-check current. No running localprocesses: commit64794andpushterminal0. No productionwrite/deploy. This paragraph is the solepostcommittrackedWIP. Next stillfullsource reconstruction/data application/UI/reports/performedwork/purchasing/history/desktopmobile/fullgates/finalreview/release/authenticatedproof; don'tnarrowgoaltofinishedpackingcascade. Sourceassociations141unique and5fluidrepairpayloadremainunapplied. Use09ef6f4fasnextHEADandpreserveuntrackedbaselinecaches.

## 2026-09-09 — salad gorgonzola source conflict resolved

Previous09ef6f4f turn was concrete implemented/pushed progress. Goal attachment re-read. Source filenames live under codex-plans/source-backed-operations (not scratch): ashley-recipe-evidence.md and raspberry-balsamic-source.md. Current branch/HEAD remain fix/source-backed-catering-workflow/09ef6f4f; no app code changes this continuation.

Read exact costing salad rows228-274, production workbook C32/E32, service E72, menu and packing identity; visually rechecked menu-with-prep.pdf page1. Gorgonzola resolved: prep83.5 dry oz =5.21875lb at167, printedprep5.22lb corroborates, menu/packing distinguish gorgonzola from fennel. Original nested leaf row244 wrongly says Fennel5.21875 Oz-Dry; don't let it add fennel demand. Use distinct Gorgonzola Cheese Crumbs .03125lb per serving. Packing5.177lb isn't the prep recipe authority; preserve original evidence.

New tracked recipes/mid-summer-salad-source.json is a source-qualified PARTIAL reconstruction, NOT an apply payload: greens/strawberries each .09375lb per serving, fennel .015625lb, gorgonzola .03125lb; linked complete dressing file; source service assembly method; walnut ingredient evidence and missing method/yield explicitly separated. No finished walnut yield invented from work quantity. Asked owner asynchronously for walnut candying method (ingredients toastedwalnuts/water/cayenne/salt/whitesugar); question pending, no answer recorded.

Scratch reproduce-salad-source.ts executes existing generated dish repair and scaling. salad-source-runtime.log passes separate four direct ingredients at167, linked dressing8ingredients and3qtbatch method, all12demand quantities double at334, gorgonzola prep5.21875->10.4375lb. This is isolated qualification, NOT complete salad live repair; no real data writes. Updated ashley-recipe-evidence.md and task_plan.md to stop treating gorgonzola as unresolved. Remaining source/application/UI/reports/purchasing/performedwork/fullcheck/finalreview/release/authenticatedproof scope unchanged.

Current WIP: these source-data/docs changes and postcommitprogress. No running process handles. No new tests/appcode/deploy, so no repeated fullsuite required for this evidence-only continuation. Next continue reconstructing usable source recipes and appropriate packing associations; wait for owner walnut method before claiming usable walnut component. Other source conflicts remain as recorded.
Independentgpt-5.6-sol APPROVE for source-data checkpoint: reviewer independently inspected workbook extracts and rendered menu-with-prep.pdf page1, checked exact arithmetic and separation from packing rounding, and confirmed no invented walnut method/yield or misleading apply-ready claim. JSON formatting completed. No appcode changed; priorfullgatesremainlastappcodeevidence, new isolatedsaladruntimepasses.
Source-data checkpoint9a7648c7 COMMITTED and PUSHED. Secret scan3147trackedfilesclean; branchprepushgenerationcurrent. Commit80325andpushterminalsuccess; revieweridle. No production data/application release. New source correction docs and JSON are durable; walnut method question remains pending. Next can continue independent prep hierarchy/linkedrecipe UI work (read DESIGN.md and applicable system docs first) while awaiting missingrecipeinstructions, alongside remaining full task_plan data/model requirements. Fullgoalunchanged. This paragraph is solepostcommittrackedWIP; preserve unrelatedbaselinecaches.

## 2026-09-09 Event prep hierarchy checkpoint

Replaced EventPrepTab's flat task list with EventPrepList: exact EventDish groups show course/prep category, dish link, servings, event instructions, work quantities, human-readable task status, station, named assignment, blocking reason, task instructions/notes, completed quantity and actual component recipe links. Current menu lines without tasks remain visible. Explicit eventDishId never falls through to another selection of the same dish; only a missing reference with exactly one dish match gets the legacy fallback. Unmatched/removed-line work remains visible without attaching current servings. Existing recipe quantity warnings render once per dish, with individual task warnings retained. No domain mutations, policy additions, recipe inventions, token changes or production data writes.

Read DESIGN.md, the culinary/events/production system owners, Galley recipe reference and the supplied prep-sheet hierarchy before implementation. React quality pass: no new dependencies or effects, approved generated hook types, map indexes for repeated lookups, reactive subscriptions remain at the tab, semantic headings/lists, existing tokens, minimum 44px recipe/dish links and responsive rows. Existing tests first caught an unapproved direct data-model type import and source-location requirements for warning JSX; both were fixed in implementation without changing tests. Reviewer caught a damaged loading ellipsis; corrected before approval.

Verification: bun run typecheck passed; bun run test passed165files/1444tests. Ignored qualify-prep-list.tsx exercises the actual grouping/component render: Ashley15menu lines/71tasks; repeated-dish exact reference; removed completed task; ambiguous and unique legacy fallback; empty menu line; visible instructions/notes, named assignment, completed quantities, source warning and correct component route. Independent gpt-5.6-sol reviewed both source files and DESIGN.md and returned APPROVE after the encoding correction. This approval is for the UI checkpoint only.

Rendered qualification used this checkout's existing Vite process33836 on7813 (7811 and7812 serve other worktrees). Ignored prep-layout.html imports actual EventPrepList and app CSS/fonts with captured Ashley data. Desktop1366x900 and mobile390x844 screenshots were visually inspected at output/playwright/event-prep-{desktop,mobile}.png; all71tasks remain present, mobile has no horizontal overflow. This is component/layout evidence, not authenticated live-flow proof. The captured data still has unlinked Drive Recipe names; supplying usable actual recipe relationships remains required, and those gaps are not concealed by this UI change. Missing source recipe methods/quantities remain pending owner evidence.

Standalone bunx vite build passed in13.47s (existing large-chunk advisory). No deployment command ran. Whole-goal bun run check, final review, release and authenticated live-data proof remain outstanding.

## 2026-09-09 Root classification and standalone batch repair

Previous turn was concrete progress: reviewed event prep UI dd632c28 committed/pushed, with actual captured-data layout evidence. This continuation re-read the full goal, traced the recipe repair path and found a separate classification failure: raw217-root TPP recipes include dishes, actual subrecipes, equipment, packaging and menu placeholders, but the default repair script projects every root into a Dish. The captured production catalog already contains active Raspberry Balsamic Vinaigrette, Half Hotel Pans and White Box For Individual Packaging Dish records. Raspberry has the same original source fingerprint as its source export and has no corresponding Component in the snapshot. This is not hypothetical future-import risk. Opened issue326: https://github.com/Angriff36/capsule/issues/326.

Added repairImportedComponentRecipe in the existing culinaryOperations seam, sharing the existing ingredient identity and component materialization implementation with dish repair. A reviewed measured batch creates/reuses a published Component, preserves source internally, records an idempotent receipt and never creates a Dish. The dish repair path still validates quantity-per-serving for an attachment; standalone batches have an actual kitchen yield but no invented guest count. Existing matching components and subsequent cook edits are reused, not overwritten. Missing batch method/ingredients/yield is not published as a complete source reconstruction. This is an administrator migration seam; ordinary kitchen recipe creation remains unchanged.

Added scripts/repair-tpp-component-recipes.ts: preview by default from reviewed batch JSON/source reference/catalog snapshot, content hashes and explicit existing-dish/event-line pointers, apply only to explicit authenticated tenant/URL. Its reference coverage is explicitly only EventDish; it does not claim complete retirement readiness and does not retire existing dishes. Raw recipe-root --apply in repair-tpp-recipes.ts now stops before network access and directs the operator to source-reviewed dish projections or the measured-component path. Raw preview explicitly warns that root classification is not established. This does not classify the full source corpus by filename or introduce a tiny allowlist; the full affected-data classification/repair remains required.

Verification: standalone source raspberry runtime creates1component/8ingredient links/3qtbatch with usable method and0dishes; exact replay changes no component/ingredient rows; new operation reuses the same source component; missing method rejects; subsequent dish repair attaches the existing component and every ingredient demand plus linked prep scales correctly167->334. Existing165testfiles/1444tests and typecheck pass after the refactor. Evidence: ignored reproduce-standalone-component.ts, standalone-component-runtime.log, standalone-component-tests.log, raspberry-component-repair/plan.json. The preview names the existing dressing Dish; no production write or retirement occurred. Source-method and other ingredient conflicts remain pending while independent repair work continues.

Independent gpt-5.6-sol first rejected the new CLI because it lacked the existing dish tool's reviewed-plan hash boundary. Corrected: full planned document SHA is emitted to plan.sha256 and required by --expected-plan-sha256 before auth/network; operation identity includes the full source+recipe payload digest as well as canonical component key. Actual subprocess changed one ingredient quantity while retaining formula.key: old plan hash rejected before auth/network, and operation identity changed. Reviewer then returned APPROVE for the bounded code checkpoint. Legitimate raspberry preview hash: f59a3cf2e0370a6ba666e86c15872d1ce36d1861a0ce654a27e6e9fd24509c1e. Do not use this stale preview for later live-data work without refreshing/reviewing inputs. No production changes, full-goal release or completion claim.

## 2026-09-09 Existing recipe classification repair qualification

Previous goal turn was progress: standalone source batch path a1a7289b committed/pushed after runtime/gates/review. This turn re-read the full objective and queried the production catalog/references read-only. Optional sourceDish now lets repairImportedComponentRecipe materialize the reviewed component and retire an explicit misclassified, unreferenced Dish in the SAME transaction. It checks tenant, active state, version, normalized name and original source fingerprint, then all13current tables with dishId plus incoming/outgoing Dish edition/merge pointers before any write. Original source text, method and other historical fields remain on the retired Dish; ordinary Dish retirement is unchanged. CLI --reclassify-dish-id binds exact id/version/fingerprint to the full payload and reviewed plan hash. Referenced records still require real relationship reconciliation, not blind retirement.

The first standard list-query read omitted soft-deleted rows. This was caught and not treated as complete historical proof. Used read-only `bunx convex data --deployment impartial-mule-193 <table> --limit10000 --format json` for13Dish-bearing tables plus dishes; every result was below10000 (0to2823), so no result hit the cap. These reads include3deletedEventDishes,2deletedDishIngredients,1deletedDishComponent and8deletedEventIngredientContributions. No current or archived references point to raspberry dressing Dish ks7a2vk5ax6b2gfzcz5c5zn8kn8dpncv. Its stored version is3 and original fingerprint700eb26d3c99bf320a4b867887d31f172a19f554c09f0fc9874a387dbca38e07. Evidence: ignored all-<table>.json, raspberry-all-reference-check.json and classification-live-20260909.json. Half Hotel Pans also has no visible refs; White Box has oneDishTask. Their correct supply/equipment reconstruction must not invent inventory quantity/ownership; it remains part of the goal.

Qualification in reproduce-component-reclassification.ts: source Dish atomically retired only after the3qt/8ingredient dressing exists; original method/source fields unchanged; exact replay stable; linked component still supports all8demands/prep at167/334; stale version and newEventDish reject with candidate unchanged. Initial code used a nonexistent contribution index, corrected to its actual tenant index. Independent gpt-5.6-sol caught omitted IngredientDemand/ComponentSeed checks; corrected using the actual demand by_dishId and seed tenant index. Separate isolated-demand and isolated-seed runtime cases now both reject retirement without changes. Final existing165testfiles/1444tests and typecheck pass. Independent gpt-5.6-sol then APPROVED the bounded code and source recipes.

Added source-qualified recipes/other-vinaigrettes.json: Sherry2qt/5ingredient lines (Salad_Dressing.xlsx rows282-295), Raspberry3qt/9lines (390-407), WhiteWine2qt/7lines (443-458). Methods paraphrase source faithfully; fluid ounces converted as volume. Actual runtime preserves all21quantities/units and batch yields/methods without creating dishes. Source rows reveal other still-unresolved batches: Caesar lists Pepper2tbsp twice; chicken cream sauce method seasons with unquantified salt/pepper; garlic butter yield10lb conflicts with8lbmargarine+2.5lbgarlic before other inputs. Investigate those sources; do not silently sum/drop duplicate rows or invent a yield. They are not declared owner-deferred.

Raspberry classification preview with explicit sourceDish has hash fbd3ec605bb5acdcea21ec120d6bcaece5e20078e76ac92a071c868936900ee0; later live apply must refresh/review current inputs. No production writes/deployments occurred. This qualification is not whole-goal completion: linked salad/other recipes, affecteddata application, supply/equipment, purchasing remainingcases, reports/forms/staffing/MyDay, fullcheck/finalreview/release and authenticatedproductionproof remain required.

## 2026-09-09 Purchasing calendar and shared-stock runtime failures

Re-read the full objective. Previous classification repair checkpoint ba7eb160 remains pushed and tracked tree was clean at the start. This turn made no production writes or deploys. Added an ignored actual-generated-command reproduction, `.artifacts/operations-source-study/reproduce-purchasing-week.ts`, using the existing convex-test/proof-kit harness rather than expanding authored tests.

Confirmed #327 (https://github.com/Angriff36/capsule/issues/327): 5 kg physical flour stock, two events July20/21 at19:00UTC with10kg demand each, same supplier. Event.planEngagement stores each exact startsAt as purchasingWeekStart. Two drafts each subtract5kg, ordering10kg total instead of15kg. Existing event-weekly-purchasing runtime test starts both events at the exact same timestamp and misses it. Source owners: src/operations/event.manifest lines560/733/771; src/procurement/event-purchasing.manifest weekly match460 and aggregates480-484; src/procurement/order.manifest ensureWeeklyLine. Canonical week alone will not resolve reuse of physical stock across separate periods or vendor drafts. Reservations and stock use-by/units need to be accounted for without changing submitted/received history.

Confirmed separate #328 (https://github.com/Angriff36/capsule/issues/328): Event_reschedule moves July20 event toJuly27; event week becomes1785178800000, but IngredientDemand and PurchaseNeed remain1784574000000 and original draft stays. There are zero EventScheduleChanged handlers in authored manifests. The same ignored reproduction asserts both failures. Fix needs date propagation through EventDish/component seeds/contributions/demand/needs and recalculation of old/new editable drafts while preserving placed orders and completed work. No fix claimed.

Asked owner asynchronously for purchasing-week start and timezone (Monday-Sunday Pacific or Sunday-Saturday Pacific; free text available). No answer as of this entry. Existing app conventions conflict: financial trends, workforce utilization/overtime and TPP reports Monday; several My Day/weekly views Sunday. Authoritative training extraction names TPP Week View but no found explicit purchasing week boundary. Event Manifest comment recommends UTC Monday but implementation stores exact timestamps. Do not pretend this is established kitchen policy. Continue independent work while awaiting answer.

Manifest3.6.50 installed dist runtime supports customBuiltins; searched docs and installed implementation and found no calendar startOfWeek/dateAdd builtin or projection builtin import option. Runtime plugin support alone does not prove Convex code generation can project an injected calendar function. Do not hand-edit generated files or invent a fixed UTC offset that fails Pacific DST.

Additional traced unresolved calculation: src/features/inventory/reorderSuggestion.ts invents coefficient-of-variation padding capped50percent from differently sized event demand and computes demand*(1+buffer)+par shortfall; it does not subtract available stock from demand. PurchasingPage passes each need plus all inventory/demands. No authored tests directly reference this helper. This is a separate source-evidence/UX reconciliation task, not yet changed or fully qualified. Procurement system doc still describes an older manual handoff and calls receipt-to-stock open despite current branch runtime work; update documentation with verified final behavior.

Full objective remains active. No tests/typecheck rerun this turn because authored application code is unchanged. Next work: settle supported calendar representation, implement shared-stock and schedule propagation in source owner(s), regenerate, qualify different-day/cross-week/submitted/received/reservation cases, and repair live affected rows only with complete reviewed evidence. Recipe/data/packing/report/staffing/My Day/full-app desktop-mobile/final gates/review/release/live-proof scope remains required.

## 2026-09-09 Purchasing unit isolation implementation

Implemented the distinct unit aggregation defect tracked in #329 (https://github.com/Angriff36/capsule/issues/329). In src/procurement/event-purchasing.manifest, open/ordered/fulfilled need sums and stock sum now filter unit == payload.unit, matching the existing order-line identity and pending supply filter. Compatible quantities continue to normalize to the catalog unit upstream; unresolved cross-dimension source amounts are not added as if cups were kilograms. No new command guard or user step. Regenerated through bun run manifest:regen with BUILDER_DIR=C:/Projects/builder-source-operations, then bun run proof:emit; generated files were not hand-edited.

Actual runtime qualification .artifacts/operations-source-study/qualify-purchasing-unit-isolation.ts: same ingredient/week needs10kg and10cups plus5kgstock yield distinct5kg and10cup lines; repeated mass recalculation remains5kg with volume need open, ordered, and fulfilled. Existing165files/1444tests pass. Independent gpt-5.6-sol APPROVE for this bounded checkpoint; confirms catalog normalization preserves compatible measures and no user tedium added. Typecheck still running at entry time; terminal result will be recorded before commit.

This does not resolve #327 shared-stock/calendar allocation or #328 date propagation. Those failures and the complete remaining source-backed workflow/data/release scope remain active. No production mutation or deployment.

Typecheck completed successfully (exit0) before this checkpoint commit. Checkpoint b27f5ad7 pushed successfully to fix/source-backed-catering-workflow; pre-push manifest-regen-check passed.

## 2026-09-09 Further source classification and ready-ingredient portion repair

Previous goal turn was progress: b27f5ad7 purchasing unit isolation pushed after tests/typecheck/review. Re-read full objective this turn. Shared-stock allocation and rescheduling still require a connected repair that accounts for reservations, consumption, and placed orders; simply shifting an order's week would misrepresent shared submitted supply. Asked owner asynchronously whether explicit reservations then earliest event should receive stock first. Earlier week-boundary question also remains pending. No answer is treated as authorization for an invented operating rule; continue independent source/data work.

Read all217 export root names/yields and actual raw source for24 classifications (including previously qualified vinaigrette formulas). Added recipes/root-classification-review.json containing ALL217 roots/fingerprints/source files with24 explicitly reviewed classifications and193 pending in this ledger. Pending is not an owner deferral or a repair allowlist. The review distinguishes actual measured component batches, ready-food portions, serviceware, packaging, equipment, cake-cutting service, and additional-guest pricing. Classification alone never authorizes deleting referenced records or applying an incomplete formula.

Read Side_Items.xlsx's complete cell-addressed extraction (14pages), plus source raw for packaging/service cases. Confirmed further exact discrepancies: 10-inch pizza box root points to14-inch box in allthree source exports; honey0.75fluidounce root versus0.5fluidounce task; guacamole2fluidounce yield versus3/16quart (6fluidounce) input; huckleberry BBQ mixing two1fluidounce inputs claims1fluidounce yield; aerosol cream2fluidounce root versus6gram task without conversion. These are recorded as unresolved source quantities, not silently corrected. Ranch and creamy balsamic source subrecipes have no ingredient rows/method; cannot substitute the independently qualified vinaigrettes by name similarity.

Whipped Butter is fully resolvable: Side_Items.xlsx A664-A679 declares1dryounce portion, a portioning task, and1/16pound ready whipped-butter ingredient. Added recipes/ready-ingredient-portions.json with one reviewed Dish projection, one direct ingredient, one measured portioning task, and no Component. The generic projector currently retains this as unresolved batch text because its yield is a weight rather than guest count; this explicit reviewed portion corrects its operational use without relabeling a prepared batch as a dish.

Actual qualification .artifacts/operations-source-study/qualify-ready-ingredient-portions.ts: repairImportedDishRecipe produces10.4375lb demand/167oz prep at167portions and20.875lb/334oz at334, preserves readable source method in PrepTask.specialInstructions, creates no Component, and exact replay adds no task/ingredient rows. Initial scratch assertion used nonexistent PrepTask.instructions; corrected to actual schema specialInstructions, no production-code change. Preview against classification-live-20260909.json selects existing Dish ks75mchsg88rr75nj8vt2eg4818dqd0s version3; no new dish, no component. Evidence ready-portion-preview/plan.json andplan.sha256. Snapshot is point-in-time and must refresh before liveapply. No production data writes/deploys. Independent source review requested from gpt-5.6-sol; verdict pending at entry time.

Full source/data repair, purchasing allocation/calendar/rescheduling, connected reports/forms/staffing/MyDay, authenticated desktop/mobile verification, full gates/final review/release/live data proof remain required. No whole-goal completion claim.
Independent gpt-5.6-sol APPROVE: all217 source identities/hash and24 reviewed-count entries verified; whipped-butter classification, source method, direct ingredient and scaling are correct. Approval is for these source artifacts, not remaining classifications or live application.

## 2026-09-09 Complete first-pass root review and green-onion portion qualification

Previous turn was progress (862a35fb source review/whipped-butter payload pushed). Re-read full objective; tracked checkout was clean. No production data mutation/deployment this turn. Examined main descriptions, declared yields and work/material tables for all217 export roots, recovering truncated excerpts separately. Expanded root-classification-review.json to217 reviewed roots with39 explicitly unresolved target classifications. First-pass root classification is not full ingredient/method verification or permission to apply. Counts:129dish,9dish_portion,7component,12meal_bundle,3meal_package,4dish_selection,1menu_selection,2commercial_modifier,2equipment,3packaging,1packaging_service,1service,2service_modifier,2serviceware,39unresolved_catalog_entry.

Concrete distinctions: Heart City packages explicitly select two meats plus sides/beverage; never make all listed meats compulsory demand. Individually packaged meals include separate food dishes and packing supplies. Order/pickup/receive of the same pie/macaroons is repeated work, not repeated purchases. Pizza and passed-app source often repeats cleaning/marinating/cooking quantities for the same food; fryer oil refers to equipment capacities, not a guest-consumption formula. Records without description/formula/context retain an unresolved target instead of classifying by filename or generic1Recipe yield.

Additional source conflicts recorded per entry: pizza table versus heating garlic/salt/oregano amounts; Basic Cheese/Pepperoni methods name cheeses absent from measured rows; Lobster Corn Dog1Each root has2tails and2cups batter; Philly slider kosher salt3/5pound versus pepper3/5gram; quinoa meal1quart black beans per serving; boxed-meal work includes Minutes;12slice cakes and10/12-person platters must not become one-guest amounts. These remain active quantity/relationship qualification work.

Looked for available Drive search connector and actual recipe URLs in extracted source. No callable Drive search tool was available. Google Docs matches in Contact_Task_&_Notes are a customer form, not recipes; the charcuterie link is an internal TPP menu page. Asked owner for the kitchen Drive recipe folder URL (Alfredo/creamy garlic/ranch/candied walnuts examples). Existing source-quantity and purchasing questions remain pending; no answer is inferred. This search does not prove recipes absent from all possible external storage.

Added Green Onions to ready-ingredient-portions.json after checking complete Side_Dish.xlsx sheet1 cell-addressed extraction: A8=.5dryounce dicing/portion task; A16=1/32pound Green Onions. Model remains one Dish portion, one direct ingredient, one dicing task, no Component. Actual repair qualification at167/334servings produces5.21875/10.4375lb demand and83.5/167oz prep; readable specialInstructions matches source; replay adds no task/ingredient. Existing whipped-butter qualification still passes. No app implementation change or new authored test.

Two-projection preview against point-in-time classification-live-20260909.json targets existing Butter ks75mchsg88rr75nj8vt2eg4818dqd0s and two Green Onions records ks7av40b28f79cae1vesrz6ewn8dqe0b / ks78eh2wmsx2m4yr1whypn0b9h8dpes6, eachversion3. Does not merge them or create new dishes. Plan hash aa5339b0005405d00e6c594ee853e8104d0d18452b69db295e03ce7816bfcf4b; refresh snapshot/source and review before any liveapply. Independent gpt-5.6-sol source review requested; pending at entry time.

Full goal remains active: no narrower completion around root review or ready portions. Purchasing calendar/shared-stock/date updates, all affected data/recipes/packing/outputs/staff workflows, authenticated rendered proof, fullcheck, finalreview/release and production data proof remain required.
Independent gpt-5.6-sol APPROVE:217 source identities,39 unresolved targets, explicitly limited classification scope, meal/package distinctions, and green-onion source quantities/method/scaling verified. This is artifacts-only approval, not live application or whole-goal completion.

## 2026-09-09 Recipe report connected methods and batch ingredients

Re-read full objective. Fixed #330: Menu Item Recipes previously printed dish.description as Preparation and omitted linked component recipes. The authored report resolver now uses dish.recipeInstructions, direct ingredient quantities per serving and selected menu quantity, and each linked component's yield, batch-scaled ingredients and actual method. Missing source information remains explicit. Recipe links carry typed dish/component identities; component sections use subordinate semantic headings and methods preserve line breaks.

Extracted existing pure kitchen recipeNoteLines/readableRecipeAmount helpers into src/lib/recipeDisplay.ts, retaining imports/re-exports through RecipeNotes.tsx. Backend and kitchen now use identical practical fraction/four-decimal formatting without changing calculations. No generated files changed; no new authored tests.

Actual convex-test qualification .artifacts/operations-source-study/qualify-recipe-report.ts passed: ready butter/onion portions at167/334, raspberry balsamic3quart batch and8ingredients,167serving output10.4375quart, actual methods rather than descriptions, typed links and replay behavior. Existing165files/1444tests and typecheck passed after final extraction. Fresh actual-query JSON rendered through actual TppReportResult in isolated fixture on verified checkout Vite7813. Visually inspected output/playwright/recipe-report-component-mobile.png (390x844) and recipe-report-desktop.png (1366x900): readable quantities, component hierarchy and responsive rows. Initial screenshot caught stale ignored JSON; final captures use fresh v2 fixture/data. Fixture evidence does not prove authenticated app routes, link destinations, or print pagination.

Independent gpt-5.6-sol APPROVE after reading DESIGN.md and mandatory design/tedium criteria. Initial bare h4 and overly precise quantities were corrected before approval. Approval covers this bounded checkpoint only.

Opened #331 with actual reproduction: Master Food Production Worksheet is routed through purchasing needs/vendor rows and returns no rows for an event with prep tasks but no PurchaseNeed. This remains required report/prep work. No production mutation/deployment. Full source/data repair, purchasing/calendar/rescheduling, packing and staff outputs, authenticated desktop/mobile/link/print proof, fullcheck, finalreview/release and production evidence remain required.

## 2026-09-09 Production worksheets use connected prep work

Previous goal turn made progress: recipe report checkpoint776f699c committed and pushed with manifest-regen-check passing. Re-read full objective this turn. Fixed #331 in authored report resolver: Master Food Production Worksheet reads date-range events and their actual prep tasks, independently of PurchaseNeed. Event Menu Item Production uses the same projection. Both now show event/date/guests/venue, dish selection and servings, course/menu notes, actual prep quantities, category/station/status/owner/due time, completed quantity, both instruction and operational notes, blocked reason and typed dish/component recipe links. Missing prep or unavailable recipes remain explicit.

Extracted existing groupEventPrep unchanged into pure generic src/lib/eventPrepGroups.ts, keeping UI import/re-export compatibility. Explicit eventDishId never falls through to another selection; legacy dish fallback requires a unique selection. Work retained after a menu-line removal stays visible without borrowing current servings. Optional document exportTable lets the existing Excel/CSV exporters consume the same projected facts while print/screen preserve hierarchy. No generated files or authored tests changed/added.

Actual ignored qualification .artifacts/operations-source-study/qualify-production-report.ts passed: butter/onion167->334 scaling/replay still correct; master and selected-event projections match;334oz butter prep appears even with zero purchasing rows; linked component,10.4375quart completed quantity and both note sources survive actual query and actual Excel blob export; removed menu-line prep keeps quantity334 with no invented current servings; internal menu packet is omitted. The current schema requires eventDishId, so unsuccessful scratch attempts to create absent/null/empty legacy IDs were invalid fixtures; legacy ambiguity was instead checked through the actual extracted pure grouping helper. These failures caused no application code changes or production mutations.

Existing165files/1444tests passed; first typecheck passed. Final typecheck following the print-only adjustment is running at this entry. Fresh actual-query fixture on verified Vite7813 visually inspected desktop1366x900 and mobile390x844: output/playwright/production-report-desktop.png and production-report-mobile.png. Initial malformed separators from shell/Python encoding were corrected; UTF-8 source restored and freshv2 data/render captured. Actual Excel exporter XML includes prep quantities/notes/component name. PDF inspection initially found a split prep method; shared TppReportDocument now avoids breaking sections/rows inside a printed page when they fit. Recaptured output/playwright/production-report.pdf and inspected page2: completed dressing task, method and component recipe remain together.

Independent gpt-5.6-sol APPROVE after DESIGN.md and mandatory tedium/design review, including shared print correction. Reviewer notes existing pre-filter2000event limit and per-event/task reads need large-tenant qualification. Fixture evidence is not authenticated full app/link-destination proof; full Ashley density, repeated event context and all reports/print layouts remain required. This is a bounded report repair, not full output qualification or release approval. No production writes/deployment. Full source/data/purchasing/calendar/rescheduling/packing/staff/MyDay/gates/release/live-proof scope remains active.
Final typecheck passed (exit0) before checkpoint commit.

## 2026-09-09 Full Ashley production print qualification

Previous turn made progress: production worksheet checkpoint7d634b16 pushed and manifest-regen-check passed. Re-read complete objective. Used existing point-in-time prep-layout-data.json (15selections/71tasks) through actual reports.events.run handler and a read-only snapshot database adapter, then rendered its actual result. Adapter evidence is layout/projection qualification, not Convex schema/authenticated/live query proof. Unused encrypted event contact fields were blanked in the scratch adapter to avoid needing production decryption for layout. Other event/menu/prep facts were preserved.

Actual full-event PDF exposed12landscape pages, excessive repeated metadata, and missing event context on later pages. Added production-template-specific print styling: named portrait letter page,12mm margins,10pt body/11pt headings, compact ruled rows, existing typography/colors, same section/row break protection. Named page must also apply to body because the existing global print region is absolutely positioned. Other report templates retain their existing print sizing. Each dish carries print-only event/date/headcount context.

Shared category is shown once per dish only when every step has that exact category; shared station/status/assignee metadata likewise collapses only when every step matches. Differing facts stay per task (Ashley dinner rolls demonstrate claimed/assigned butter beside pending/unassigned rolls). All per-task facts remain in Excel export. This does not hide missing links or change quantities, methods, status or assignments.

Fresh output/playwright/ashley-production-report-v4.pdf has6portrait pages instead of12landscape. Inspected all6rendered pages (ashley-production-v4-print-1.png through-6.png): every page has event identity, all15dish sections/71steps remain, rows are legible and task content stays together. Source prep document is3pages; matching its exact page count is not established and would require further compactness/notes reconciliation. Actual full-event snapshot still shows0component-linked tasks, duplicate menu instructions propagated to steps, known source quantity conflicts and a blank venue despite event.venueId. These are required data/resolver work, not fixed by print changes.

Fresh desktop1366x900 and mobile390x844 actual-renderer fixtures inspected at output/playwright/ashley-production-desktop.png and ashley-production-mobile.png. No horizontal overflow seen. Actual runtime/excel qualification re-passed (167/334scaling, component/completed notes, retained menu-line work and legacy grouping); existing165files/1444tests and typecheck passed. Independent gpt-5.6-sol APPROVE after direct DESIGN.md and mandatory design/tedium review, including PDF pages2/6 and unchanged full export facts.

No production data writes/deployment or fullcheck. Authenticated full-app recipe destinations, existing source/data repairs, venue resolution, purchasing/calendar/date propagation, packing/staff/MyDay/output verification, final gates/review/release and deployed data proof remain required. Goal active and not narrowed to paper layout.

## 2026-09-09 Linked venue resolution across event reports

Previous turn made progress:41187831 production print checkpoint pushed. Re-read full objective. Ashley full-event snapshot has venueId but lacks optional venueName/venueAddress snapshots; existing report loaders never dereferenced the venue, so prep/BEO/contact event outputs showed a blank site despite the relationship. Opened #332 https://github.com/Angriff36/capsule/issues/332 with source/output evidence and root cause.

Added shared authored resolveReportEventVenue in convex/tppReports/shared.ts. Preserve nonblank historical event name/address independently; for missing values, normalize venueId and resolve same-tenant nondeleted Venue. Decrypt only required address fields (addressLine1/2,city,region,postalCode,countryCode) through existing report encryption boundary. No Event or Venue writes, no duplicate manual entry. Event range/single loaders and contact event bundles use resolved facts; document venue headers include name plus address. General pending confirmations and financial reports fill missing venue names without unused address decryption. General pending confirmations also decrypts primaryContactName rather than displaying its stored envelope. Existing live/stage/date filters now precede that general report's resolution/decryption.

Actual ignored convex-test qualification .artifacts/operations-source-study/qualify-report-venue.ts passed across master production, BEO, contact Event Menu, pending confirmations and sales forecasting. Created an actual encrypted Venue through its generated command, linked Event with absent snapshots, verified plaintext name/address in appropriate reports and no ciphertext leakage; historical event snapshots win; foreign/deleted venue links contribute no data; report calls do not populate stored Event snapshots. No new authored tests or generated changes. Existing165files/1444tests and typecheck passed; runtime qualification re-passed after the final filter-order-only adjustment.

Independent gpt-5.6-sol APPROVE for complete current diff, including recheck that filter-order adjustment preserves the exact predicate. No new guard/policy/user step and no authored UI or visual-language change. No fullcheck, production writes or deployment. Live affected venue rendering still requires deployed/authenticated proof; source recipe/relationship/data/packing/purchasing/calendar/staff/MyDay/report/link/print/gates/release scope remains active.

## 2026-09-09 BBQ brine source qualification and un-fingerprinted catalog repair

Previous turn made progress:020ddbb6 venue report checkpoint pushed. Re-read full objective. Returned to source recipes and existing-data repair. Recovered Alfredo/creamy-horseradish methods from nested workbook cells and recorded their conflicting quantity/yield variants in source-review.md. Missing formula qualification is distinct from a missing method; earlier broad Drive-recipe missing notes are superseded for those methods. No source quantities were invented or applied.

Added recipes/bbq-chicken-brine.json after direct text and recipe-photo comparison (IMG_20250821_172310473.jpg). One batch is explicitly for5lbchicken, with five measured ingredients and complete source method; water total remains2qt although2cupsareheated first. No invented finished-fluid yield, guest conversion or cooking/brining duration. Existing live catalog vocabulary is used for cooking water/thyme/garlic; freshwholegarlic is stated in instructions.

Preview found existing Dish ks778t6j428eknhfxqjetdjf198dqc4s BBQ Chicken Brine version1 with description1961,5portion and no recipeSourceFingerprint. Existing atomic reclassification only accepted fingerprinted imports. Extended authored repair argument to required string|null; null explicitly expects fingerprint absence, while exactversion/name/tenant/status/all13reference/edition/merge checks still apply. CLI permits an absent fingerprint only for the explicit selected same-name source Dish; present fingerprints must still match the reviewed formula key. No generated edit, new guard, owner prompt or separate user workflow.

Actual .artifacts/operations-source-study/qualify-bbq-brine.ts passed:1batch/fiveingredients/fullmethod, no Dish created by standalone repair,2qttotalwater, replay no duplicates; explicit absent-fingerprint Dish retires atomically into already materialized component and remains a historical row; staleversion, newlypresentfingerprint and EventDish reference reject without retirement. Existing165files/1444tests and typecheck passed. No new authored tests. Cross-model gpt-5.6-sol review requested; verdict pending at entry.

Point-in-time preview .artifacts/operations-source-study/bbq-brine-reclassification-preview/plan.json hash4c6585ff93b8e26355c13f99eac318471fd58b662fdbd9d4a0beb921f8b65bcd targets only that explicit Dish. Twelve readable saved raw reference tables contain no references; all-eventAllergenChecks.json iszero-byte/unreadable, so coverage is incomplete and not current-live retirement proof. Receipt .artifacts/operations-source-study/bbq-brine-reference-check.json records this. Refresh all references/editions/currentversions and reviewed plan before live application; runtime still checks them transactionally. No production writes or deployment.

Full goal remains active: complete affected recipes/relationships/data, source conflicts, purchasing calendar/shared-stock/date changes, packing/equipment/staff/MyDay/forms, authenticated desktop/mobile/recipe destinations, fullcheck/finalreview/release and deployed-data proof remain required.
Independent gpt-5.6-sol APPROVE: source quantities/method/batch basis and explicit nullable-fingerprint snapshot comparison verified; existing reference protection remains. This is checkpoint review, not live-apply/full-goal proof. Classification repair remains under issue326.
Final formatted-source preview supersedes the pre-format hash above: bc873fabe2743ead64b9ff59bf895a8969b1d4bf03091b17c054df33fcb8341b. Formatting changed source-file bytes; recipe quantities/method and selected record are unchanged.

## 2026-09-09: purchasing queue stock facts and readable orders

- Traced and reproduced the unsupported purchasing recommendation: event demand 10 lb, recorded stock 100 lb, par 0, historical event sizes 1/100 lb produced a 15 lb suggestion. Historical event-size variation is not evidence of recipe loss or a buying buffer. Same-session issue: https://github.com/Angriff36/capsule/issues/333.
- Removed the CV/par heuristic and unused demand subscription. Queue now shows exact-ingredient/unit recorded stock shared across events, active reservation totals when known, and stock past its use-by cutoff. Deleted/removed stock is excluded; loading/malformed/missing reservation values remain loading/unknown. These facts do not claim a per-event stock allocation or an order quantity.
- Show all associated order links, deduplicated across direct and join-table demand linkage, with supplier/order labels instead of raw line/order ID suffixes. Existing selection and order actions retained.
- Actual desktop/mobile rendering exposed a pre-existing grid-column error from the selection checkbox. Grouped checkbox and ingredient details in the first column; stock facts now use inherited sans at 12px and existing ink-2. No palette, token, radius, design exception, policy, or approval changes.
- Verification: actual helper qualification `.artifacts/operations-source-study/qualify-purchasing-stock.ts` passed loading/empty, exact-unit isolation, deleted/removed, reservations, past-use-by, malformed quantities, and four-decimal stock facts. Existing 165 test files / 1,444 tests passed; typecheck and check:design-vocab passed. Refreshed rendered fixture screenshots `output/playwright/purchasing-stock-{desktop,mobile}-v2.png` visually inspected; link destinations verified and no invented suggestion remains. Fixture uses actual component/helper, not authenticated purchasing runtime proof. Only console error was fixture favicon 404.
- Independent gpt-5.6-sol reviewed final code/CSS and DESIGN.md: APPROVE, no actionable findings or new user tedium. This is a bounded branch checkpoint, not full goal/release approval.
- Still required: backend shared-stock/week allocation (#327), event rescheduling propagation (#328), connected live-data repairs, full gate, authorized release, authenticated affected-data/runtime proof. No production writes or deployment performed.

## 2026-09-09: rescheduling shared and submitted purchasing evidence

Previous turn was verified progress: purchasing stock checkpoint 6df7addd pushed. Re-read full goal and current sources. Executed generated-command draft/submitted reschedule matrix and scratch candidate probes; detailed evidence in runtime-gaps.md and issue #328. Confirmed all seven downstream collections remain unchanged on reschedule, a later servings edit drives the old date, naive draft rerouting fails the existing reassignment guard, and submitted rerouting ignores prior-date pending supply. This changes the implementation decision: a date-only handler is insufficient; date propagation, draft provenance removal/reconciliation, and supply allocation must be repaired together, preserving completed/history state. No application edits or production writes this turn; complete workflow/repair/release goal remains active.

## 2026-09-09: source-reviewed packing fluid-unit repair CLI

Re-read full objective and current command/generation owners. Previous turn's rescheduling evidence was progress. Coordinated purchasing still needs the buying-week/timezone and shared-stock priority answer; asked specifically while continuing independent source-confirmed work. Verified existing fluid-unit repair is already implemented; added the missing default-preview/exact-plan apply CLI and tracked five-row Ashley source selection instead of duplicating backend logic.

CLI saved-snapshot preview produces 1.3125,10.4375,10.4375,20.875,1.3125 cups, preserving physically packed quantities by the same factor. Preview hash 8642dad9d4623636087daf7ad349be92899e32818807d0cec42119c6c480c7d4. Actual subprocess negative/replay qualification passed; existing generated-command fluid qualification passed; existing165files/1444tests and typecheck passed. Details and apply/readback workflow in packing-source-reconciliation.md. No authored tests added; no production writes or deployment. Full goal remains active, including actual affected-data repair after release.

Independent gpt-5.6-sol final APPROVE after adding listedAt to readback preservation and synchronizing the new preview hash. Bounded CLI/source checkpoint only; authenticated apply remains unverified.

## 2026-09-09: source-owned packing association restoration

Previous turn was verified progress: b6247d17 packing-fluid CLI pushed. Re-read full goal/current owners. Joined source-qualified unique parent names to exact Ashley menu-line names: 141 packing rows across15 menu lines (initial verbal151 count corrected). Retained50 non-menu contexts,27 ambiguous,16 unmatched rows for their proper reconciliation; no array-order guessing.

Added reviewed source/version/PDF-evidence payload in recipes/ashley-packing-associations.json and atomic replay-safe association repair. Initial raw write failed3 integration guards; moved writes to new Manifest restoreImportedAssociation command and regenerated via isolatedBuilder, preserving guard requirements. Independent review identified removed-menu lines and direct-command description/provenance protection; fixed both source and authored orchestration and qualified both access paths. The generated command changes relationships/provenance only, preserving physical quantities/history; receipts preserve original rows internally. Actual two-item safety matrix and full141-row/15-menu source-derived fixture passed, including no-write replay. No production writes or deployment; full goal remains active.

Final verification:165 existing test files/1445 tests passed (one new generated command-contract check emitted by Builder), typecheck passed, ownership ledger check passed. Independent gpt-5.6-sol final APPROVE after source-owned command and review corrections. Bounded branch checkpoint only; live repair and full goal/release verification remain required.

## 2026-09-09: packing recipe association presentation and report completeness

Previous turn was progress:0c8af641 source-owned association repair pushed. Read full goal/current screen/report and DESIGN/logistics authority. Opened issue334: https://github.com/Angriff36/capsule/issues/334. Pack report discarded associations and applied a tenant-wide item limit before selecting the event; it could omit populated event rows.

Pack report now reads live event lists and indexed list items, resolves live same-tenant dishes, adds For/optional Load sheet columns, and emits typed recipe links. Existing table renderer uses the shared CulinaryEntityLink; packing screen links associated dishes too. Shared packingDisplay removes only the trailing exported Show Association button text; original descriptions remain stored. Missing association, unavailable linked dish, and loading are distinguished; no quantity or workflow-action changes.

Actual generated repair plus report projection retained all141 source-selected Ashley rows with named recipe links and unchanged quantities. A second runtime run inserted2101earlier unrelated tenant packing rows and still returned all141selected-event rows. Tests165files/1445tests and typecheck passed. Actual component/report desktop/mobile fixtures visually inspected (`output/playwright/packing-associations-{desktop,mobile}-final.png`); typed link paths and missing/unavailable states checked. Mobile retains existing horizontal table scrolling; this is not a claim of completed mobile operational qualification. Ignored fixture module cache required a fresh `packing-report-layout-v2` filename before final screenshots, which include the unavailable state. No application console errors; only existing React Router future warnings.

Independent gpt-5.6-sol read DESIGN.md and approved final diff after identity/loading correction. This is a bounded branch checkpoint. Authenticated recipe navigation, complete event-context/print qualification, full dataset repair, remaining packing models and full workflow/release proof remain required. No production writes or deployment.

## 2026-09-09: packing print and export context

Packing reports now include event, date, guest count, venue, and the single selected load-sheet name inside the table header. The header repeats on printed pages; multiple-load-sheet reports retain their existing per-row load-sheet column. CSV and Excel exports repeat the same context on every row with readable dates, collision-safe internal column keys, and existing formula escaping. The source button label Show Association is also removed when followed by a parenthetical note, preserving the operational note itself. Stored descriptions and quantities are untouched.

Actual generated association repair plus report projection produced the full captured Ashley dataset:234 rows, including141 source-linked menu allocations and93 remaining rows. Final PDF output/playwright/ashley-packing-final.pdf has10 landscape Letter pages with10mm margins; every page visually inspected with no clipped rows, all repeat event/date/167 guests/load-sheet context, and all234 rows remain. The fixture retains old captured quantities/units and lacks a Venue row: it does not prove applied fluid-unit corrections or absence of the real venue. Earlier15-page and9-page PDFs are superseded. Desktop and390px mobile actual-renderer screenshots were inspected; mobile retains the existing horizontally scrolling table and is not a completed mobile usability claim.

Actual export qualification .artifacts/operations-source-study/qualify-packing-export-context.ts passed234-row CSV/Excel context, date formatting, existing/hidden-key collision preservation, formula escaping and meaningful trailing-note preservation. Existing165 test files /1445 tests, typecheck and check:design-vocab passed. Independent gpt-5.6-sol read DESIGN.md and approved the bounded final diff against7f53646e, finding no design violation or new user tedium. No new authored tests or generated changes.

No fullcheck, production writes or release performed. The overall source-backed workflow goal remains active: affected-data repair/application, unresolved recipe evidence, purchasing/calendar/shared-stock propagation, remaining packing models, staffing/timeline/My Day/forms, authenticated links/mobile/runtime, full gates and final reviewed release still require completion.

## 2026-09-09: executable packing association repair and combined correction proof

Previous turn made verified progress:bc670449 packing print/export context pushed. Re-read full objective and active source/snapshot/repair contracts. Added scripts/repair-tpp-packing-associations.ts to turn the existing141-row source-reviewed plan into a reproducible offline preview and explicit application with per-attempt before/after evidence. Snapshot hash, original expected versions and original operation key remain bound; no inferred links or silent version refresh. Separate receipts preserve mutation uncertainty, acknowledgement and readback; a recovered transaction reports current differences without overwriting later work.

Actual CLI subprocess over a localhost adapter invoking real Convex test commands passed141 associations/readback, five subsequent fluid-unit conversions on overlapping rows with4 fluid ounces already packed per row, preservation of dish/menu links and physical facts, exact replays with no duplicates/writes, and simulated readback failure followed by successful recovery. Runtime file .artifacts/operations-source-study/qualify-packing-association-cli.ts. The initial test stopped before mutation because the standard session helper reloaded the checkout JWT; the qualification now runs from an isolated working directory with a synthetic identity, no Clerk secret and no live backend. Nine offline CLI input/identity/version/history/source rejection cases passed. No new authored tests or generated/UI changes.

Documented apply ordering: associations first, fresh snapshot and fluid-unit preview second. Both touch five records and change versions, so the two old snapshot plans cannot be blindly applied together. Original association replay after fluid correction correctly reports5 current differences while preserving the corrected records. Saved Ashley preview hash ebd0cc40957a566540bc3a036b2ffb0f05a9dfb5c965ee3152ef81dc1b85e307 covers141 rows; refresh/review against live evidence before first production application.

Typecheck and existing165files/1445tests passed. Independent gpt-5.6-sol review requested; pending at entry. No fullcheck, live repair or deployment. Full connected source/data/workflow/desktop/mobile/recipe-link/report/gates/release objective remains active and incomplete.
Independent gpt-5.6-sol APPROVE for the bounded association CLI: snapshot/plan binding, pre-network checks, per-attempt acknowledgement/readback receipts and preservation of subsequent work verified in review. This is checkpoint approval, not evidence that production application or the full goal is complete.

## 2026-09-09: completed-work balance runtime evidence

Previous turn made verified progress:a19e35da repeatable packing repair pushed. Re-read objective and inspected remaining connected prep behavior. Generated-command and actual client reproduction establishes missing supplemental work using source asparagus rate0.1875lb/serving and actual30lb completed output:200servings require7.5lb more;240require15lb; decreases/86/restore/repeat keep open work at0. Completed timestamps/assignee/output survive, although versions change. Ingredient demand correctly follows the total requirement; it must not be multiplied by sequential prep steps.

New evidence changes the next implementation: EventPrepTask client input omits completedQuantity and template matching stores only one task, so a server-only supplemental-row fix would remain inconsistent with client sync. Track cumulative compatible-unit completion and a distinct open balance across both paths. Exact reproduction and saved observations are in runtime-gaps.md and new bug https://github.com/Angriff36/capsule/issues/335. No workaround, production write, authored test or implementation change. This turn is progress through executable evidence that changes the repair boundary; the full goal remains active, not blocked or complete.

## Completed-work repair implementation in progress (2026-09-09)

Added src/lib/prepWorkBalance.ts as the shared calculation foundation for335. It keeps total recipe requirement separate from cumulative actual completedQuantity and remaining work; null historical completion falls back to that completed row's planned quantity, while explicit zero stays zero. It accounts for compatible-unit manual/other open work and identifies one stable generated balance row, preferring work already underway. It returns unresolved task identities for incompatible/invalid work records rather than inventing density or silently subtracting unlike units. Input records remain unchanged. Callers must supply one exact EventDish/DishTask group.

Actual scratch qualification qualify-prep-work-balance.ts passes source167/200/240/120/86/restore, multiple completed rows, pounds/ounces, manual open work, input-order stability, explicit zero, preserved inputs and cancelled/deleted exclusion. Typecheck and165files/1445existingtests pass. No authored tests or generated changes.

This helper is NOT yet connected to mutations or client sync and does not fix335 by itself. Next work is the connected implementation: carry completedQuantity through EventPrepTask/agent loader, group all rows per exact menu-line/template instead of the current one-row map, keep demand based on full recipe quantities, use stable completion-generation identity for new remaining-work rows, and make generated server reactions apply the same balance automatically. Current Manifest3.6.50 count-of-preload only recognizes count_of collections; do not assume sum(self.relation,selector) command hydration from read-time computed support. Reaction-param sum supports stored-field filters and is the existing procurement pattern; confirm the generated implementation before selecting the server design. Completed/dependency/manual/history/recipe-change semantics still require end-to-end proof. Do not deploy this calculation foundation as the completed defect fix.
Independent gpt-5.6-sol APPROVE for the calculation foundation only. Review explicitly retains exact identity grouping, valid PrepTask status inputs, and handling unresolved unit/data cases as integration obligations. Issue335 and the full goal remain incomplete.

## 2026-09-10: client remaining-prep reconciliation

Previous turn made verified progress:0ec8007f shared work-balance calculation pushed. Re-read full objective and connected that calculation to EventPrepTaskSynchronizer, with completedQuantity carried through EventPrepTask, EventMenuSyncController and the agent state loader. Exact event-menu-line/template groups credit actual completed output and reuse a generated pending balance row; when more work is required and no open generated row exists, create only the remaining amount under an identity derived from the completed-row set. Original completion fields and records remain. New work retains recorded kitchen instructions; ordinary refresh preserves its existing notes. Total recipe demand is represented separately from the remaining work quantity/unit.

Actual synchronizer invoking generated mutations passed source asparagus167->200/240/120/86/200/repeat: original30lb completion remains, pending work7.5/15/0/0/7.5lb, full ingredient demand unchanged. Complete a further5lb: next pending row2.5lb with a distinct generation key; subsequent synchronization makes no writes. Add1lb manually edited open work: it remains and generated pending work becomes1.5lb without adding that same-step allowance to total ingredient demand. Artifact .artifacts/operations-source-study/qualify-completed-prep-client.ts and completed-prep-client.json. No authored tests added.

Independent review initially rejected a mixed-unit demand error. Corrected by keeping demandQuantity in template units with separate demandUnit, and requiring exact unit in existing demand lookup. Extended qualification:30lb completed,37.5lb requirement, pending task in ounces ->120oz remaining work,37.5lb demand; an earlier ounce demand is not overwritten. This is actual code-path qualification; live Clerk/backend application remains unverified.

This is a partial integration checkpoint, NOT completion of335. Generated server-only serving reactions still do not create balances and still scale open rows to full recipe quantities; refreshGenerated is pending-only, so claimed/in-progress work needs a source-owned reconciliation command. Atomic coordination across UI/MCP/generated reactions, cancelled supplemental work/idempotency, dependencies, recipe changes, stale/concurrent callers and existing-data repair remain required. Current local code must not be released as the completed-work fix until those paths are integrated and qualified.
Final typecheck and165files/1445tests passed. Independent gpt-5.6-sol APPROVE after the unit correction, explicitly limited to this client checkpoint; full335/server/atomic integration remains outstanding.

## 2026-09-10: transactional server remaining-prep reconciliation

Added culinaryOperations.reconcileEventPrepWorkBalance and authored helper convex/lib/prepWorkReconciliation.ts. The seam reads the current stored event/menu line, complete indexed recipe-step/work groups, and recorded dependencies in one mutation. It credits actual completed quantities and manual/other open work; creates only a missing positive balance; updates the selected generated balance without resetting assignments, status, notes, dates or completion history. Generated query/command policies remain authoritative. Unresolved units/recipe identities propagate through recorded dependencies before writes, leaving unrelated groups usable.

PrepTask.reconcileRemainingWork is source-owned and derives its quantity from stored recipe requirements, completed work and other open rows; it takes no caller-supplied quantity. It validates active generated work and current parent/history/version, compatible units and completed recipe identity. Null/absent legacy optional identities are equivalent. EventDish.prepTasks provides aggregate hydration. Direct arbitrary quantity injection is rejected. Generated output and ownership were regenerated through the isolated Builder.

New and existing pending balance rows retain their recorded sequencing and acquire edges to all outstanding prerequisite work, including manual work already credited in quantity calculation. Old edges and completed rows remain. When a claimed/in-progress/blocked dependent would require a new edge, the planner reports that group unresolved before writes because the existing declaration command accepts only pending dependents. It preserves work state rather than resetting it or rolling back unrelated groups; dependent unresolved state propagates transitively. This is an integration obligation for caller presentation, not a new app permission.

Actual generated-runtime qualifications pass: source asparagus167/200/240/120/0/200/repeat,30lb actual completion, additional5lb completion, manual1lb credit, active9lb remaining with assignment/start/history preserved,142oz corrected to144oz, unlike units unchanged/unresolved, stale/completed/foreign/historical command rejection, absent/null legacy identities and arbitrary quantity argument rejection. Dependency fixtures pass new supplemental sequencing, existing pending dependent with new6-unit plus manual4-unit prerequisites, three-step unresolved propagation while unrelated work is created, and claimed/in_progress/blocked dependent planning with stable replay. These are isolated convex-test records, not live data or new source recipes. Artifacts: qualify-server-prep-balance.ts, qualify-server-prep-dependency.ts, qualify-existing-prep-dependency.ts, qualify-unresolved-prep-dependency.ts, qualify-active-prep-dependency.ts under .artifacts/operations-source-study/.

Correction to earlier implementation note: installed Manifest3.6.50 DOES support command sum aggregates with relation hydration through aggregate-hydrate/functions; the legacy count-of-preload helper alone was not the complete path. Runtime verification exposed separate compiler defects: command-local computes in guards become nonexistent doc fields (#336), and lambda task.id remains id instead of _id (#77). Source guards use stored fields directly; the open-work aggregate sums all open rows and subtracts self.quantity once. No generated file was hand-edited. Issues: https://github.com/Angriff36/capsule/issues/336 and https://github.com/Angriff36/capsule/issues/77#issuecomment-5616196577.

Independent gpt-5.6-sol initially rejected unchecked quantity input, unresolved predecessor fallback, legacy null mismatch, and active dependent edge rollback; each was corrected with actual runtime evidence. Final verdict and final gates are recorded below once available. This is a server foundation checkpoint only: normal UI/MCP/generated reaction wiring, real concurrent-call qualification, cancellation/recipe-change integration, existing-data application and full335 completion remain required. The old serving reaction still runs in the qualification before this seam is explicitly invoked. No production writes, full check, deployment or whole-goal completion.

Final checkpoint verification:165existing test files/1446tests passed; typecheck, ownership ledger, production integration and culinary integration checks passed. Independent gpt-5.6-sol final APPROVE after the active-dependency preflight correction. No authored tests added; one command contract check is generated by Builder. This approval is bounded to the server foundation, not issue335 completion or final release authorization.

## 2026-09-10: transactional event integration in Manifest

Capsule remains at reviewed/pushed server foundation480f22b2. Normal EventDish.adjustServings, syncHeadcount and setHeadcountOverride still emit EventDishServingsAdjusted into the old full-requirement PrepTask.syncServings fan-out. The separate reviewed prep reconciliation mutation is not yet called automatically. Opened distinct integration issue337: https://github.com/Angriff36/capsule/issues/337.

Installed Manifest3.6.50 has no transactional event-handler seam. Reference-runtime EventBus/onEvent delivery occurs after commit and cannot make the parent serving change roll back with required dependent work. An auth-module side effect or UI-only callback would be the wrong boundary. Added optional eventHandlerImport to Manifest in isolated C:/Projects/Manifest/.worktrees/convex-event-handler; the primary Manifest checkout and its dirty work were preserved.

Manifest source15c5a38 and evidencea025618 are pushed in PR https://github.com/Angriff36/Manifest/pull/78. The binding adapter contract specifies exact stored event payload/time/identity, own-emission order after declared reactions, child handlers before parent handlers, no replay on cached idempotency, all three command creation/instance paths, and full transaction rollback on handler failure. Public ConvexCommandEvent exports through the supported package entry point. Independent gpt-5.6-sol rejected the initially missing public export, then approved the corrected final brancha025618.

Actual generated modules using convex-test pass13 focused cases. Full Manifest suite314files/4504tests passed with8files/60tests skipped; typecheck, lint, format, docs, cycles, root/CLI builds and strict built-package subpath type smoke pass. The fresh checkout initially lacked root/CLI dist; building them resolved the subprocess failures before the final green run. Remote Linux/Windows PR CI and registry publication remain pending at this checkpoint; no Capsule pin or generated files have changed.

Next: finish the reviewed Manifest registry release, update Capsule and its isolated Builder to the same registry pin, wire an authored handler to the reviewed prep helper, replace the old serving fan-out and qualify real generated serving/headcount commands without a separate follow-up mutation. Preserve historical prep without turning ordinary historical menu corrections into a new policy denial. Coordinate the manual sync UI with the server reconciler so stale global catalogs cannot re-create or overwrite balanced work. Unresolved unit/recipe/dependency groups still need usable presentation. This is progress toward335, not completion. No production writes, Capsule release or deployed-flow proof.

Additional isolated runtime qualification: .artifacts/operations-source-study/qualify-concurrent-prep-balance.ts invokes the reviewed server reconciler six times concurrently after the source asparagus serving change. Exactly one7.5lb supplemental task is created, completed history remains byte-for-byte unchanged, and six concurrent repeats produce no writes. This proves behavior under convex-test transaction scheduling, not a live Convex OCC or deployed-flow claim.

Manifest release checkpoint: PR78 passed remote Linux and Windows CI, then merged as1288ba13285d0db90d964cee884538e9d8ff5741 with final independent gpt-5.6-sol APPROVE covering8e48737..a025618. Authorized cut-release workflow34463865041 succeeded and published3.6.51: https://github.com/Angriff36/Manifest/releases/tag/v3.6.51. Registry metadata and a fresh npm installation confirm the version. The fresh package compiles source through its public compiler/projection imports, generates the opt-in handler with event identity/command/index metadata, retains the unconfigured path, and typechecks ConvexCommandEvent plus ConvexProjectionOptions through the documented package subpath. Scratch evidence: C:/Users/Ryan/AppData/Local/Temp/manifest-event-handler-smoke-a8691a3fb6a64f6a89aaca0f6cf03ed2/{probe.mjs,probe.ts}. Initial npm ETARGET immediately after publication cleared with a prefer-online retry.

The next required implementation is Capsule/isolated-Builder registry pin3.6.51, authored event handler plus replacement of the old serving reaction, regeneration, manual-sync coordination and generated-command full-flow proof. Capsule runtime remains480f22b2; subsequent branch commits only record progress. No production data writes or Capsule deployment occurred.

## 2026-09-10: automatic serving/headcount prep integration

Previous goal turn was a status-only no-progress turn. Re-read the complete objective and current source, then consumed published Manifest3.6.51 in Capsule and its isolated Builder. Configured transactional eventHandlerImport with authored convex/lib/operationalEvents.ts. EventDishServingsAdjusted now invokes the reviewed group reconciler after generated demand/packing reactions inside the originating transaction. Removed the old full-requirement fan-out and the obsolete public PrepTask.syncServings command from authored Manifest and regenerated exports/discovery. PrepTask.reconcileRemainingWork remains the source-owned quantity command. No generated output was hand-edited.

Factored one read-only planner for both reconciliation and the reactive eventPrepWorkReview query. Incompatible units/quantities, changed completed recipe identities and unresolved prerequisite groups return named reasons. EventPrepWorkNotice presents the reasons on Event Prep and both desktop/mobile kitchen dashboard compositions; completed/closed/cancelled event prep returns a preservation notice without blocking otherwise allowed historical menu corrections. Manual UI sync calls the canonical server reconciler through the established safeCulinaryOperations transport seam; it no longer uses tenant-wide browser prep/template catalogs to calculate or create rows.

MCP add_event_dish_and_sync_prep now performs the generated EventDish.addToEvent command and reads its current prep result. It does not replay host creation/refresh using an old request quantity after an idempotent add retry. Its state loader uses complete indexed dish/event queries. Removed the obsolete demandCount:0 response because it described old host writes and could falsely imply missing generated demand. Two existing architectural/coordinator test cases were updated in place for the actual new integration; no authored test cases were added or removed. The generated export contract dropped one case because the obsolete command was removed (1446 ->1445 total).

Actual generated-runtime qualification passes source asparagus167/200/240/120/0/200/repeat, actual30lb completion, additional5lb completion, manual1lb work, in-progress9lb remainder with preserved assignment/start/history, compatible ounce conversion, unresolved unlike units, named reactive review and clearing after correction, foreign/stale/arbitrary-quantity rejection, historical menu corrections and stale browser target999 ignored in favor of stored servings. Completed rows are compared byte-for-byte including versions. Additional generated Event.changeHeadcount/override/clear/86/restore checks isolate two selections of the same dish, retain full ingredient demand60lb, and preserve history. Six concurrent repeat calls are stable under convex-test scheduling. Actual MCP cached add replay preserves later200servings without any host prep commands.

A required generated PrepTask.open failure (blank task name in an isolated inconsistent template fixture) rolls back every table after the parent serving/demand reactions; correcting the fixture permits retry with the same idempotency key. New supplemental prerequisites, existing pending dependents with manual prerequisites, claimed/in_progress/blocked unresolved dependents and transitive unresolved groups pass. Unrelated prep remains usable. Scratch scripts qualify-automatic-prep-balance.ts, qualify-automatic-prep-headcount.ts, qualify-automatic-prep-dependency.ts, qualify-automatic-active-prep-dependency.ts, qualify-automatic-unresolved-prep-dependency.ts and qualify-existing-prep-dependency.ts are under .artifacts/operations-source-study/.

Independent gpt-5.6-sol review rejected missing desktop notice/heading order, then a misleading stale demandCount. Each was corrected. Final verdict APPROVE for the bounded diff againstbe59a970, including the complete DESIGN.md review; no visual-language replacement or disproportionate new policy. Browser qualification renders the actual shared notice using generated-runtime review data at390/1440: named recipe link, keyboard focus, h1/h2 order, no horizontal overflow, reactive clearing/reappearance and no browser errors. Screenshots prep-review-390.png and prep-review-1440.png were visually inspected. This is isolated component/query-fixture proof, not an authenticated full-app or deployed claim.

Final bun run check passed with165files/1445tests, coverage ratchet, typecheck, format, secrets, integration/design/ownership checks, local Vite build and baseline-decay. First run exposed direct-feature-hook architecture violations, resolved through the existing transport seam without weakening guards. Next runs exposed formatting in19 ignored earlier browser snapshots plus a source comment, then Windows resolving bash to unavailable WSL. Formatted those scratch snapshots and the source comment. Prepended installed Git/bin to PATH for the full passing run; no machine settings changed. Environment command-path issue338 tracks the WSL problem: https://github.com/Angriff36/capsule/issues/338. The checked build script and environment selected only local Vite; no Convex deployment occurred. Log: check-event-prep-integration.log.

This is a substantial integration checkpoint, not whole issue335 or goal completion. Cancellation/removal/substitution and recipe relationship changes against performed/manual work, affected-data repair, purchasing normalization/reschedule/shared-stock, remaining source recipes, staffing/timeline/forms/battleboard/My Day, complete desktop/mobile/recipe navigation and print verification, final release and authenticated production proof remain required. No Capsule production writes or release occurred.

Checkpoint74df2dc19661f905cd7022fcd4bab807eb849d61 committed and pushed to origin/fix/source-backed-catering-workflow; pre-push Builder regeneration check passed and remote SHA was checked. Final independent gpt-5.6-sol APPROVE coversbe59a970..74df2dc1 including docs and all10 current content-addressed Builder baselines; baseline filename/content hashes match. Existing unrelated/unreferenced untracked baselines remain untouched.

## 2026-09-09: recipe-template propagation draft and compiler blocker

After the reviewed/pushed automatic-serving checkpoint74df2dc1 and evidence13bc028d, actual runtime inspection found that DishTask revision leaves existing prep on its old ingredient/name/instructions even after quantity-only manual sync; retirement leaves pending generated prep. Issue339: https://github.com/Angriff36/capsule/issues/339. Current uncommitted draft adds template snapshots and guarded source commands for unstarted generated work, preserves edited/underway/completed rows, identifies unresolved identity changes, and releases dependencies of retired unstarted requirements without pretending that cooking was completed. Removal/cancellation callback work filters completed/cancelled rows to preserve their entire history. This draft is not reviewed or fully qualified.

Recipe repair creates templates before linking reviewed imported prep. Its internal DishTask calls now request synchronizePrep:false so that existing repair coordination can preserve imported quantities and notes before creating genuinely missing rows. Actual import qualification still yields4 prep rows where2 are expected because Manifest3.6.51 createVia drops command computes and emits command-only bindings as doc fields. Generated DishTask_createViaAdd destructures the flag but emits doc.syncPrepRequested; the instance runner emits the correct local. Issue341: https://github.com/Angriff36/capsule/issues/341. Evidence: reproduce-prep-adoption.ts and recipe-events-adoption.log under .artifacts/operations-source-study. No generated file was edited by hand.

Owning Manifest fix is isolated in C:/Projects/Manifest/.worktrees/convex-create-event-bindings, branchfix/convex-create-event-bindings, base7252a7f (3.6.51). Current source draft executes createVia compute/mutate actions in declaration order on one working copy and retains parameter/compute locals for emits/reactions. Actual generated-runtime checks pass false/true/omitted flags, same-named input versus post-action field, compute chains across mutation, stored/reaction/callback payloads, absence of persisted locals, and idempotent replay, with callback both enabled and disabled. All26 focused Convex test files/270cases passed. Full Manifest gates and independent gpt-5.6-sol review are in progress; no release/publication or Capsule consumption claim yet. Primary Manifest dirty checkout is untouched.

Next: qualify/review/publish owning compiler fix, consume exact registry version through Capsule Builder regeneration, then rerun imported-prep adoption and the existing source-backed prep/repair qualifications. Resolve retirement dependency replay and preserve imported custom notes; update template UI wording for existing-event propagation. Full purchasing/calendar/shared-stock work, affected live data repair, unresolved source recipes, staffing/timeline/forms/battleboard/My Day, complete UI/recipe-link/print verification and final gated Capsule release remain required. No Capsule production data writes or deployment.


## 2026-09-10: compiler released and recipe propagation runtime qualified

Manifest source300f2ea and evidence88abe7a received independent gpt-5.6-sol
APPROVE. PR https://github.com/Angriff36/Manifest/pull/80 passed Linux/Windows CI
run34469788758 and merged as735aa917. Successful cut-release run34470306158
published3.6.52; registry gitHead db385089432f8067650d252898a6633510e56d03 and
GitHub v3.6.52 release were verified. Manifest full suite4506 passed/60 skipped,
typecheck/lint/docs/root+CLI builds and generated-runtime matrix passed.
Primary dirty Manifest checkout stayed untouched.

Capsule installed exact3.6.52 and regenerated through isolated Builder; no
hand-edited generated files. The previously failing import adoption now retains
exactly2 existing prep records rather than4, preserves custom notes and original
completed/planned amounts, replays without duplicates, scales pending work on
later servings changes and rolls back stale reviewed input. Actual runtime
recipe propagation verifies snapshots, pending/claimed automatic replacement,
retained assignment, manual/underway/completed/historical byte-for-byte
preservation, imported custom notes, named unresolved review and retirement.

Additional actual-runtime evidence found and fixed two draft defects: initial
EventDishAdded prep omitted the template station; and a retired prerequisite
was copied onto newly created supplemental work. Source reaction now carries
station, and reconciliation recognizes prior retirement across later runs.
Released dependency history and completed/retired task rows remain byte-for-byte.
A generic recipe step's missing ingredient identity no longer wrongly treats
richer linked work provenance as a replacement. Explicit conflicting identities
still require operational review; no fabricated food or cross-dimension unit
conversion is used.

Admin and event_manager remove/cancel both cancel unfinished work while
preserving whole completed and already-canceled records. All six prior automatic
serving/headcount/dependency qualification scripts pass against3.6.52, including
completed output, manual allowance, incompatible units, active assignment,
stale/foreign/history behavior, distinct same-dish menu lines, MCP replay, and
whole-transaction rollback. Ten scripts/logs ending -3652 provide this evidence.
UI copy now explains current-event propagation and preservation on retirement;
no visual-language change.

Full bun run check passed with165files/1448tests (three new generated export
contract cases, no new authored cases), coverage, typecheck, format, secrets,
integration/design/ownership checks, localVite build and baseline-decay. Log:
.artifacts/operations-source-study/check-recipe-events.log. Git/bin PATH ensured
local bash, and Vercel production environment was absent.11 current Builder
baselines were hash-verified; only these will be included, leaving older
untracked baselines intact. Capsule independent gpt-5.6-sol review is in progress
at this entry. This is a bounded checkpoint: no Capsule production data writes
or deployment, and live repair/purchasing/source/operations/UI/report/final
release proof remain required for the full goal.

Independent gpt-5.6-sol APPROVE for the bounded final diff against13bc028d,
including direct DESIGN.md review. The reviewer confirmed template/retirement/
removal paths preserve legitimate work, staged repair still materializes missing
rows after links, and the copy changes introduce no design violation or new
user tedium. This verdict does not claim live repair, deployment or whole-goal
completion.

Checkpoint7a88b39f962734fe331b28966eb73560afd6a73d committed and pushed to
origin/fix/source-backed-catering-workflow; git ls-remote verified the exact SHA
and pre-push manifest-regen-check passed. Final independent gpt-5.6-sol APPROVE
covers13bc028d..7a88b39f, including committed evidence documents and all11
content-addressed Builder baselines. Reviewer independently confirmed matching
local/remote SHA and baseline hashes. Issues335/339/341 have progress comments;
they do not claim production application. Tracked worktree was clean after the
checkpoint. Overall goal stays active; the next work continues the remaining
source-backed purchasing, affected-data and complete operational workflows.

## 2026-09-10: purchasing cancellation failure reproduced and repaired locally

At ee414406, actual generated Event_cancel failed in six of eight purchasing
scenarios: fulfilled/already-cancelled needs failed Guard 0, and event_manager
with open/ordered needs failed Guard 2. All failed transactions rolled back.
The earlier prep-removal qualification had no purchase needs and therefore did
not cover this failure. Issue342 records the reproduction and related draft
allocation defect: https://github.com/Angriff36/capsule/issues/342.

PurchaseNeed.standDownWithEvent now requires an already-cancelled parent and
cancels only open/ordered needs, using the parent's recorded reason. The
transactional operational handler skips deleted, fulfilled and previously
cancelled needs entirely. The human purchasing cancel command retains its
existing authorization. Source changes were regenerated through the isolated
Builder; generated files were not edited by hand.

Twelve isolated actual-runtime scenarios now pass: admin/event_manager crossed
with open, ordered, fulfilled, previously cancelled, partial receipt and full
receipt. Entire settled needs, committed orders/lines/demand links, receipt lots,
stock and the other event's needs are unchanged; repeated stand-down performs
no writes, and independent stand-down on an active event is rejected. Evidence:
reproduce-purchasing-cancellation.ts, purchasing-cancellation-baseline.json,
qualify-purchasing-cancellation.ts, purchasing-cancellation-qualified.json/log
under .artifacts/operations-source-study. Full gates and independent review are
pending at this entry.

The shared draft remains wrong after cancellation: two 10 kg requirements and
5 kg stock produce a 15 kg draft, which still contains both live links and 15 kg
after one event is cancelled. Draft contribution/quantity reconciliation is
still required; this checkpoint does not claim to fix it. The date propagation
and cross-week stock defects in327/328 also remain. No Capsule production writes,
deployment or full-goal completion.

The purchasing cancellation checkpoint passed full bun run check:165files,
1449tests, coverage, typecheck, format, secrets, generated ownership/proof and
integration/design checks, localVite build and baseline-decay. Only the generated
new-command export contract adds a case; no authored tests were added. Log:
.artifacts/operations-source-study/check-purchasing-cancellation.log. The prior
four prep-removal/history scenarios also pass with the combined callback.
Independent gpt-5.6-sol APPROVE covers this bounded diff against ee414406 and
explicitly excludes a claim that shared draft/date/stock reconciliation is
finished. Nine new current Builder baselines are content-hash verified; older
untracked baselines remain untouched.


## 2026-09-10: shared purchasing drafts preserve buyer choices and cancel cleanly

At 2c468d05, two 10 kg requirements and 5 kg stock produce a 15 kg draft.
A buyer changes it to 20 kg at 2 per kg. Raising one event to 120 servings
then overwrites the buyer quantity with 17 kg. Issue343 records this actual
runtime reproduction: https://github.com/Angriff36/capsule/issues/343.

The source now stores the calculated requirement separately from the ordered
quantity. Buyer quantity changes stay manual through later event updates;
price-only updates preserve the current quantity mode. Older lines recover
provenance from recorded command events; absent history keeps the existing
quantity and shows a review note. The purchase-order page offers Edit quantity
and an explicit Use calculated quantity action with optimistic versions.

Cancellation retires only the cancelled requirement's editable draft links,
reduces the previous calculation by that requirement, and clears the cancelled
need's active draft pointers. Historical links remain recorded. The other
need and committed orders/receipts/stock stay intact. Duplicate links for one
requirement are not subtracted twice; incompatible measurements retain the
quantity and show a review note. This preserves existing stock coverage; it
does not fix the separate weekly normalization/allocation issues327/328.

An interim independent review correctly rejected leaving an empty automatic
zero-quantity order available for submission. Source-owned retirement now
removes such a line only when it has no live requirements, buyer quantity,
or receipt, then cancels an empty automatic draft. Manual and committed orders
remain intact. Final review is pending at this entry.

All 15 shared-draft runtime scenarios passed against the final regenerated
source: automatic, manual, legacy automatic, legacy manual and unknown history,
each through remaining-order submission, all-event cancellation, and explicit
return to automatic calculation followed by a servings change. Stale choices
make no writes. The 12 admin/event_manager lifecycle/receipt scenarios also
pass. Separate duplicate-link and incompatible-measurement qualifications pass.
Evidence is under .artifacts/operations-source-study:
qualify-shared-draft-cancellation.ts, shared-draft-{submit,all,use-plan}-*.json,
qualify-shared-draft-edge-cases.ts, shared-draft-edge-*.json,
qualify-purchasing-cancellation.ts and purchasing-cancellation-with-drafts-qualified.json.

Actual VendorOrderPage rendering and command wiring passed at 1440/390 px;
VendorContractsPage, which shares the row CSS, passed at 390/900/1440 px.
Mobile content no longer overlaps, action targets are at least 40 px, and
quantity editing supports keyboard opening and Escape. Screenshots were
visually inspected. The sibling preview initially used a stale Vite transform
of an ignored fixture; a revisioned module request proved and resolved that
qualification failure. These previews use isolated runtime records with mocked
hooks, not authenticated backend/deployment proof. The receipt banner now
correctly says line receipts update stock, avoiding duplicate delivery entry.

Full bun run check and final independent review are pending. No Capsule
production writes or deployment have occurred. Existing affected-data repairs,
remaining purchasing/date/stock work, staffing/timeline/battleboard/My Day,
recipe links, reports, complete desktop/mobile/print workflows, release and
production verification remain required by the full goal.


The final full bun run check passed:165 files/1453 tests, coverage, typecheck,
format, secrets, ownership/proof/registry/integration/design gates, local Vite
build and baseline-decay. The first run found one stale receipt-copy assertion;
its existing expectation now matches the verified line-receipt behavior. No
new authored test cases or assertions were added or removed. The four additional
cases are generated command export contracts. Final log:
.artifacts/operations-source-study/check-shared-purchasing-drafts-final.log.

Independent gpt-5.6-sol APPROVE covers this bounded diff against2c468d05,
including direct DESIGN.md review, the corrected existing copy assertion and
all10 new current Builder baselines. The reviewer verified guards/source,
transactional cleanup, history and buyer preservation, mobile improvements,
no new design violation and no disproportionate policy friction. All20 current
ownership baseline hashes were verified; only the10 newly referenced files
will be committed, leaving older untracked baselines untouched.

Additional browser checks verify the unknown-history review message, conflict
feedback with unchanged quantity, and successful retry clearing the message.
Current reschedule reproduction still proves old dates on seven downstream
record groups for draft and submitted orders; a later servings edit still uses
the old date. Fresh evidence: qualify-reschedule-current.ts and
reschedule-{draft,submitted}-shared-draft-checkpoint.json. This checkpoint does
not solve that confirmed next defect. No Capsule production writes/deployment.

## 2026-09-10: closing events preserves stock, logistics and billing history

The shared purchasing checkpoint83b544eaa080ff668a602c8deadb857e3ef372e3 is
committed/pushed and independently approved. Tracked state was clean at the
start of this work. Reschedule tracing exposed unconditional terminal-record
fan-outs in other event lifecycle paths; date/allocation work remains open.

At83b544ea, Event_cancel/Event_complete failed on released or consumed stock
reservations in8 of12 admin/event_manager cases. Completion fixtures start at
the required final stage. Consuming2 of5 kg leaves3 kg, which must remain.
Issue344: https://github.com/Angriff36/capsule/issues/344.

The sibling audit reproduced22 failures of32 logistics/billing cancellation
cases. Dispatched/cancelled pack lists and delivered/failed/cancelled deliveries
hit active-only guards; event_manager also hit the extra logistics-manager
gate on active work. Paid, partial and voided invoices failed Invoice.markVoided.
Payments were actually recorded and settled through generated commands.
Delivery states use generated lifecycle commands with a fixture-assigned real
Person driver; delivery-only cases soft-delete the pack header to isolate that
handler. Issues345/346:
https://github.com/Angriff36/capsule/issues/345
https://github.com/Angriff36/capsule/issues/346.

The callback now selects active stock holds and eligible unpaid invoices before
calling their existing generated commands. Source-owned PackList/Delivery
standDownWithEvent commands require a cancelled parent and use its reason;
human logistics cancellation permissions remain intact. Completed logistics,
settled reservations, paid/partial invoices, payments, packed quantities and
assignments remain recorded. Deleted and foreign-tenant rows are excluded.
Event cancellation does not infer a refund or replenish consumed stock.

All writes remain inside the originating event transaction. A failed later
stock release rolls back the earlier release, parent change and audit events.
Direct cleanup on a live event fails; new logistics commands likewise require
a cancelled parent. Repeated cleanup makes no record/history writes. Source
guards govern the actual changes; generated files came through Builder.

Qualification passed:24 reservation role/lifecycle/state cases,2 reservation
rollback/direct-call cases,32 logistics/invoice state cases,12 deleted/foreign
logistics/invoice cases and12 connected cancellation cases with purchasing,
consumed stock,2 of4 packed chafers, a loaded list/scheduled delivery, a paid
invoice/payment and an unpaid invoice. Committed purchasing, receipt lots,
stock, paid amounts, packed quantities and other event needs remain unchanged.
Evidence under .artifacts/operations-source-study:

- reproduce-event-reservation-lifecycle.ts and event-reservation-lifecycle-baseline.json
- qualify-event-reservation-lifecycle.ts and event-reservation-lifecycle-qualified.json
- qualify-event-reservation-rollback.ts
- reproduce-event-logistics-invoice-cancellation.ts and event-logistics-invoice-cancellation-baseline.json
- qualify-event-logistics-invoice-cancellation.ts and its qualified/foreign/deleted JSONs
- qualify-event-connected-cancellation.ts and event-connected-cancellation-qualified.json/log

Final full `bun run check` passed (165 files/1455 tests), including typecheck,
formatting, secrets, ownership/generation, integration/design checks, coverage,
Vite build and baseline decay. The first run found two stale assertions that
expected inline generated cancellation effects; those existing assertions now
verify the flat event's transactional callback without adding/removing cases or
assertions. Final process exit was0. Independent gpt-5.6-sol review: APPROVE.
The reviewer found no material implementation issue or disproportionate policy.

Two additional admin/event_manager qualifications inject a mismatched draft
contribution after creating active and consumed stock holds, loaded packing,
delivery, paid/unpaid invoices and payment history. The existing purchasing
consistency failure surfaces and rolls back all prior stock release, logistics,
invoice, event, recipe and audit changes byte-for-byte. Evidence:
qualify-event-connected-cancellation-rollback.ts and
event-connected-cancellation-rollback.json. An earlier scratch attempt using a
negative required quantity did not induce that failure; it is not rollback
evidence and was replaced with the explicit contribution mismatch.

No new authored tests or UI changes; command export contracts are regenerated.
No Capsule production writes or deployment. These repairs do not complete the
goal or resolve purchasing week/
timezone, allocation/expiry, rescheduling, affected-data repair, staffing,
timeline, My Day, usable recipe links or reports.

## 2026-09-10: usable component methods and scaled measurements (#347/#348)

Previous goal turn made authoritative progress: eaf2c89c was committed/pushed,
full check passed, and independent gpt-5.6-sol approved its exact range. Re-read
the full goal and rechecked this clean branch. Rescheduling remains coupled to
the unresolved buying-week/timezone and shared-stock priority choices; no new
business rule or date-only purchasing repair was invented. Continued the required
recipe-link workflow while those choices remain pending.

Actual generated Component draft/ingredient/step commands created the source's
three-quart Raspberry Balsamic Vinaigrette with eight measured ingredients and
its two method sentences as ordered ComponentStep rows. Added steps in reverse
insertion order and removed a third qualification step; a second component owns
an unrelated method. Generated queries return the two live scoped steps, but
the existing ComponentDetailPage only read Component.instructions and said
"No method recorded" after actual EventPrepList keyboard navigation. Baseline
at1440/390px proves issue347: https://github.com/Angriff36/capsule/issues/347.

The page now reads and orders live component steps, preserves separately recorded
prose/durations, and suppresses prose only when its complete whitespace-normalized
text equals the ordered steps. Loading method/ingredient queries show loading,
not absent data. Empty and prose-only components remain supported.

Source-recipe scaling also exposed issue348:
https://github.com/Angriff36/capsule/issues/348. At0.01quart of a3quart recipe,
the one-tablespoon lemon juice line incorrectly read0.00tablespoon and the
factor read0.00. Shared readable amounts and meaningful factor precision now
show0.0033tbsp and0.003333. Fractional/zero yield previews and reset make no
record writes. The shared formatter retains positive values below its usual
four-decimal display threshold; eight exact examples and80 positive-value cases
pass. This changes presentation only, not stored recipe quantities or methods.

Desktop inspection found ingredient names spilling into preparation notes.
The existing Composition-column collapse now applies below800px, and component
ingredient labels wrap without changing the shared default truncation behavior.
The sibling IngredientDetailPage uses the same list CSS and was inspected too.
Actual-page browser checks pass at1440/900/390px: ordered source steps, exact
prep link/keyboard navigation, missing/prose/duplicate/distinct/duration states,
independent loading, scaled/zero/reset quantities, no writes, no intersecting
ingredient-row regions and no horizontal overflow. Both pages' screenshots
were captured. Fixtures use generated-runtime records with substituted hooks
and a fixture-only provider; this is not authenticated production proof.

Evidence under .artifacts/operations-source-study:

- qualify-component-method-data.ts and component-method-fixture.json
- qualify-component-method-browser.mjs and component-method-baseline/qualified.json
- component-method-baseline/fixed-{1440,390}.png and fixed-900.png
- component-method-ingredient-{1440,900,390}.png
- component-scaling-baseline.json and qualify-recipe-display-precision.ts

The first fixture bring-up needed its Convex provider, and Vite cached the ignored
fixture module until its URL revision changed. An inline HTML proxy also failed;
the fixture uses a versioned script URL. Those were qualification-fixture failures,
not product regressions, and the final complete browser matrix passed.

DESIGN.md (front matter authoritative), culinary system instructions, and stored
recipe desktop/mobile references were read before UI changes. Independent
gpt-5.6-sol read DESIGN.md and approved the four-file implementation, finding no
new policy friction or visual-language replacement. Full `bun run check`
passed with exit0:165 files/1455 tests, typecheck, formatting, secrets,
ownership/generation, integration/design checks, coverage, Vite build and
baseline decay. Log:check-component-method.log. Final sibling qualification
at390/900/1440px passed; current component desktop and ingredient mobile
screenshots were visually inspected after the layout change.
No authored tests were added or expanded. No production writes, data repair,
Capsule deployment or full-goal completion is claimed.

### 2026-09-10 — live prep amounts on usable recipe links

The preceding status-only turn was no implementation progress. Re-read the full
goal, confirmed d93ad60d on the working branch and origin, and resumed the owned
unfinished prep-context changes. The full catering objective remains active.

Event prep, My Day, mobile event prep, the production board, and the kitchen
deck now link the component with its stored prep-task identity. The component
page reads that task and event through generated hooks. The source's three-quart
Raspberry Balsamic Vinaigrette produces generated prep amounts of10.4375 and20.875
quarts for167/334 guests; each link opens the correct amount and event backlink.
No quantity is copied into the URL, no new records are written by previewing,
and no density or portion-to-volume conversion is invented.

Live quantities update an untouched preview. A cook's deliberate preview stays
local, with Use prep amount and Recipe batch controls. Overrides belong to the
component/task/recipe unit so one event or unit cannot inherit another's amount.
Malformed, unavailable, deleted, changed-component, and incompatible-unit states
keep the recipe readable without scaling from unrelated data. Completed and
cancelled work shows its recorded amount against the current recipe, not a
historical edition claim. Ingredients and method now precede cost, nutrition,
and import provenance. Raw event/dish identifiers were removed from the two
changed prep fallbacks. Issue349 tracks the missing links/context:
https://github.com/Angriff36/capsule/issues/349.

Generated-runtime role checks exposed a connected access failure: kitchen staff,
leads/managers, logistics staff and workforce staff received no Event records,
although their operational views consume those reads. Event.read now uses
staffAccess, following docs/architecture/domain-gating-restraint.md. Regenerated
with BUILDER_DIR=C:/Projects/builder-source-operations and bun run manifest:regen,
then proof:emit. All20 owned files and the6 changed baseline digests match.
The same five roles now receive the two same-tenant fixture events. Foreign,
anonymous and deleted records remain hidden; kitchen pricing changes are denied
with the event unchanged. Event write/execute/manager guards remain intact.
Issue350: https://github.com/Angriff36/capsule/issues/350.

Browser qualification uses actual authored surfaces with isolated generated
runtime records and substituted data hooks, at390/900/1440px. It verifies each
surface's recipe link and keyboard/event return, both guest-count amounts,
live updates, manual preview preservation/reset, route and unit changes, exact
cup/quart conversion, zero/fractional previews, incompatible units, missing/
loading/mismatched/settled contexts, method order, no writes and no body overflow.
Final screenshots include all five surfaces and component detail. Phone recipe,
phone My Day and desktop kitchen deck were visually inspected. The initial
fixture captured a preceding route and omitted parent-owned CSS; it now waits
for the committed route and imports the real My Day/kitchen styles. Those
initial images are not final multi-surface proof. The completed-amount assertion
also initially used qt instead of the formatter's quart; corrected fixture
assertion passes. Convex-test synthetic IDs are normalized to lowercase only
in the browser fixture so they satisfy the existing real-ID route check.

Evidence under .artifacts/operations-source-study:

- qualify-prep-recipe-context-data.ts and prep-recipe-context-fixture.json
- prep-recipe-context-reads-baseline/qualified.json
- prep-recipe-context-data-baseline/qualified.log
- qualify-prep-recipe-context-browser.mjs and prep-recipe-context-qualified.json
- prep-recipe-context-layout.tsx/html and prep-recipe-context-hook-fixture.ts
- prep-recipe-{event-prep,my-day,mobile,production,kitchen,detail}-{390,900,1440}.png
- regen-prep-event-context.log and check-prep-event-context.log

Full bun run check passed with exit0:165 files/1455 tests, typecheck, formatting,
secrets, ownership/generation, proof/integration/design checks, coverage, local
Vite build and baseline decay. No authored tests were added or expanded.
Independent gpt-5.6-sol reviewed the implementation and DESIGN.md and APPROVED.
The reviewer initially objected to broad Event reads, then explicitly withdrew
that rejection after checking the binding owner read-wide rule and the existing
shared operational consumers. No new policy friction or design drift remained.
Commit/push state is recorded by the following checkpoint; there is no Capsule
production deployment, affected-data write, authenticated production proof, or
whole-goal completion in this checkpoint. The broader unresolved workflows,
source conflicts and pending operational choices remain in task_plan.md.

### 2026-09-10 — crew timeline execution and trusted completion attribution

The previous prep-context checkpoint is committed and pushed as
c65e70e5407ceb42d880512e97cf8ddc1ca191e6. The next generated-runtime comparison
found that kitchen, logistics, workforce and general staff saw four activities
in the event-day briefing but no generated timeline rows, and could not complete
the same work. Event staff could complete it while forging the recorded Person.
Issues351 and352 record those failures:
https://github.com/Angriff36/capsule/issues/351 and
https://github.com/Angriff36/capsule/issues/352.

EventTimelineActivity now uses staffAccess for shared reads and execution.
Schedule/adjust/remove retain the prior event-staff/manager requirement on
their commands; complete/reopen do not require a planning role. Completion
uses the authenticated user.personId. The optional completedByPersonId input
remains compatible with existing callers but cannot select the recorded actor.
An unlinked staff account can complete work without a fabricated Person.
Tenant/deletion filters, optimistic versions, and plan data remain intact.
RunOfShowPage uses classifyCommandFailure and the existing FailureBanner;
conflicts offer Refresh, denial messages are accurate, and Dismiss is keyboard
accessible. The scoped existing danger-soft token makes the banner readable
over the established photographic Event Day surface. DESIGN.md is unchanged.

Regenerated with BUILDER_DIR=C:/Projects/builder-source-operations and
bun run manifest:regen, then bun run proof:emit. No generated files were
hand-edited. All20 owned file hashes and their baselines match; only the six
newly referenced baseline files belong to this checkpoint. No authored tests
were added or expanded.

The runtime fixture creates its event, four source-example timeline blocks and
Person-linked staff through generated commands. The training guide p4 example
has07:00 staff call,08:00 departure,08:30 onsite and11:30 buffet service; the
fixture's calendar date is illustrative and does not assert a live event time.
All eight staff-role cases now read four activities and complete/reopen with
trusted attribution. Planning permissions retain their original boundary.
Schedule, end time, assignments, notes/site notes and order stay byte-equal
through execution. Stale-version, foreign/anonymous and deleted-row attempts
preserve stored work; an unlinked staff actor completes with no Person value.
Fixture corrections used briefing.activities and nullish optional attribution;
they did not change product behavior to satisfy an incorrect fixture.

Browser qualification renders the actual RunOfShowPage and thin command
wrappers using runtime-derived before/completed/reopened records and substituted
hooks. At390/900/1440px, keyboard completion/reopen, current command versions,
actor arguments, conflict refresh, denial classification, keyboard dismissal,
no body overflow and no page errors pass. Final phone conflict and desktop
timeline screenshots were inspected. A final fixture-only update uses the
actual generated policy message; the complete browser qualification was rerun
successfully afterwards. This is isolated-data browser evidence, not an
authenticated production session.

Evidence under .artifacts/operations-source-study:

- qualify-crew-timeline-runtime.ts, crew-timeline-baseline.json/log and
  crew-timeline-qualified.json/log
- crew-timeline-browser-data.json, crew-timeline-layout.html/tsx and
  crew-timeline-hook-fixture.ts
- qualify-crew-timeline-browser.mjs, crew-timeline-browser-qualified.json/log
  and crew-timeline-{fixed,conflict}-{390,900,1440}.png
- regen-crew-timeline.log, proof-crew-timeline.log and check-crew-timeline.log

Full bun run check passed, exit0:165 files/1455 tests, including typecheck,
formatting, secrets, ownership/generation, proof/integration/design, coverage,
local Vite build and baseline decay. Independent gpt-5.6-sol read DESIGN.md,
source and generated output with the required presentation/tedium instructions
and APPROVED this bounded diff from c65e70e5. The exact committed range and push
are verified at the checkpoint boundary. No Capsule production write, deployment,
affected-data repair or whole-goal completion is claimed.

The next confirmed failure is issue353:
https://github.com/Angriff36/capsule/issues/353. The standard run builder saves
28 timestamps from hard-coded group windows. An11:30 service anchor puts
Buffet Open at13:04. Training p4 calls for explicit service, measured travel,
setup and load facts; its example does not authorize a guessed complete
timetable. Source-backed planning, existing/custom/performed-work preservation,
and partial-create/retry qualification remain required. Full staffing, binder
reports, purchasing/rescheduling/allocation, existing affected data and final
release/live proof remain incomplete alongside the unresolved source choices.

### 2026-09-10 — untimed work and atomic run-of-show selection

The prior turn made concrete progress: crew timeline execution was committed,
pushed and independently approved at3cd7b2321eca496c5e66425f1e78002b618c2128.
This continuation re-read the full goal, verified that checkout, refreshed
DESIGN.md and the relevant source evidence, and inspected training guide p4.
The source requires actual service timing and measured travel. Its full-service
example is07:00 staff call,08:00 departure,08:30 onsite and11:30 service; those
facts do not authorize28 times spread across generic group windows.

Additional runtime baseline failures were reproduced: create rejected a missing
startsAt; the tracker treated the creation audit stamp as current work; and a
failed second browser-style create left the first block saved. Individual
templates also used event start or Date.now. Issue354 tracks partial creation
and the disappearing retry action. The Timeline editor's start/end fields were
blank even for timed records, while omitted updates could not clear a time.

Current source permits untimed work and explicit start/end clearing. Templates
no longer fabricate timestamps. Run of Show offers a selection of standard
blocks on both empty and populated runs, plus the owning Timeline editor for
times and custom work. The selected batch is one transaction invoking generated
commands. Existing matching name/category records are reused without changing
their times, notes, assignments or performed history. Operation keys survive a
retry; repeated selections do not create duplicate matching blocks.
Explicit removal followed by a new selection creates fresh work and preserves
the deleted record. No generated files were hand-edited.

Untimed rows stay visible and completable, but never drive current/next/late
alerts. Battle board, Event Day timeline sheet and mobile event timeline also
use only operational starts. The editor pre-fills saved times, preserves exact
timestamps on unrelated edits, and can clear a time or note. Reordering mixed
untimed/completed work preserves times. The transaction omits unchanged time
arguments, so legacy invalid windows do not prevent order or note/assignment
edits. Fully timed, uncompleted runs retain existing slot remapping.

Runtime qualification exposed a separate baseline defect: adjust accepted an
end before the stored start. The baseline generated helper does not enforce the
declared entity window constraint; the initial assumption that it checked old
state was corrected after inspecting the helper from HEAD, including issue355's
body. Time edits now enforce the effective window; unknown starts/ends and
unrelated edits on legacy records stay valid. A constraint expressed through
preceding computes revealed Manifest3.6.52 issue356: those names become absent
doc fields and are checked before their bindings. This command uses an equivalent
direct argument/stored-value expression. That bridge is not a compiler fix.

Fourteen actual generated-runtime qualification flags pass: untimed creation,
stable template identity under reordering, atomic rollback, repeat/retry,
existing-work preservation, untimed completion/reopen, no audit-stamp alerts,
role/tenant boundaries, explicit time changes/clearing, mixed reorder,
non-resurrection, legacy note edits, legacy reorder and end-only planning.
All20 ownership hashes and seven newly referenced baselines verify.

Actual authored UI and thin command wrappers pass isolated-runtime-data browser
qualification at390/900/1440px: selection and failure retry retain the same
payload, matching blocks are identified, keyboard completion/reopen works,
times pre-fill and clear, unrelated edits omit timestamp changes, individual
templates/manual work allow blank times, and all changed sibling projections
show unknown timing honestly. No page errors or body overflow. Browser fixtures
were corrected to use the real Edit block/Apply labels and wait for projection
mounting; those fixture errors were not product failures. The first focus check
did catch a product defect: focus ran while the opener was disabled. It now
returns after rendering; initial focus enters the picker heading. Visual
inspection also replaced viewport-based two-column squeezing inside the430px
Event Day frame with container-fit columns, and put Add/Cancel/select-all in a
sticky toolbar. Final phone/desktop picker and phone timeline images inspected.

The actual battle-board PDF contains all three Time not set labels, normalized
across line wrapping. It also exposed an existing narrow print containing block
(issue357). The one-page isolated fixture is not full print/binder readiness;
real populated/multipage output and print layout repair remain required.

Evidence under .artifacts/operations-source-study:

- qualify-untimed-timeline-baseline.ts and untimed-timeline-baseline.json/log
- qualify-untimed-timeline-runtime.ts and untimed-timeline-qualified.json/log
- untimed-timeline-browser-data.json and untimed-timeline-layout.html/tsx
- qualify-untimed-timeline-browser.mjs and untimed-timeline-browser-qualified.json/log
- untimed-{picker,run,timeline,projections,battle}-{390,900,1440}.png
- untimed-battle-print.pdf, untimed-battle-print-page1.png and untimed-battle-print-qualified.json
- regen-untimed-timeline.log, proof-untimed-timeline.log and untimed-timeline-new-baselines.json

An initial full bun run check passed165 files/1455 tests. After final UI fixes,
the explicit final gate stopped at tsc with exit5 and no compiler diagnostic.
Direct node tsc and then the unchanged standard bun run typecheck both passed.
The final full gate rerun then passed with exit0:165 files/1455 tests, typecheck,
formatting, secrets, ownership/generation, proof/integration/design, coverage,
local Vite build and baseline decay. Exact log:
check-untimed-timeline-final-retry.log. The unexplained exit5 remains in the
preceding failed log; it was not a reported TypeScript diagnostic. No authored
tests were added or expanded. Independent gpt-5.6-sol APPROVED the final bounded
source/UI diff, including legacy reorder, with DESIGN.md and the required
tedium review. Exact committed-range confirmation follows the checkpoint.

Source-backed service/setup/travel/load/return/unload inputs and calculation
remain required under issue353. Untimed work is a foundation for that planner,
not a replacement for the full workflow. Compiler356, print357, staffing,
purchasing/rescheduling/allocation, affected live data, full reports and final
release/authenticated production proof remain incomplete. No Capsule production
write, deployment or whole-goal completion is claimed.
