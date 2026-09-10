# Source-backed catering workflow

## Goal and authority

Fulfill the complete request in attachment `6b4eed7c-f119-448b-b84b-b99ee7cb5560/pasted-text-1.txt`: study all relevant event, recipe, report and training sources; repair the connected application and existing affected live data; verify desktop/mobile, calculations, repeatability, preserved work, reports, review, gates, authorized release and deployed behavior. An audit or partial fix is not completion.

Authoritative training: `work/training docs/Ops-training/Mangia_Ops_Final_Lock_Training.pdf`. Prep presentation: `work/training docs/Prep/menu-with-prep.pdf`. Migration source: `.artifacts/tpp-migration-20260905/tpp_migration`.

## Phases

1. In progress: inventory and visually study source pages/photos; build requirements with source/page evidence and worked examples.
2. In progress: trace current runtime, classification, links and live data against every requirement. Prior audits are leads only.
3. In progress: implement connected domain/UI/report repairs and repeatable data repair with preview and before/after evidence; preserve edits, assignments, completed work and history. First bounded correction preserves prep instructions during serving refresh; full connected repair remains required.
4. Pending: verify real examples including guest count, individual servings, substitutions, removals, recipe relationship changes, no duplicate tasks or ingredient double counting, recipe links, desktop/mobile and printed outputs.
5. Pending: required checks, independent cross-model approval, branch push/release through repository process, deployed application and live-data verification.

## Constraints

- Do not invent recipes, yields, quantities, cooking times, operational policies or missing-data conclusions.
- Dishes are finished dishes; components are actual subrecipes; prep tasks are work instructions.
- Preserve provenance internally while showing usable kitchen information.
- Do not add tests beyond owner-authorized acceptance requirements. Existing gates and actual-runtime verification remain required.
- Follow DESIGN.md before UI changes and Manifest regeneration ownership rules before domain changes.
- No manual deploy or external communications unless authorized; repository release and blocker-issue instructions apply.

## Current state

Branch `fix/source-backed-catering-workflow` in `C:\Projects\capsule`; branch checkpoints are pushed through the isolated Builder at `C:\Projects\builder-source-operations`. No production writes or release have occurred. Overall goal remains active and substantially incomplete. `progress.md` is the chronological source of checkpoint implementations, review verdicts and evidence; its latest sections supersede earlier pending-status notes.

All 52 specifically named PDF pages and source photo contact sheets were inspected; the training transcript was read. All90 migration workbooks were extracted with cell addresses; relevant semantic source review continues. Live catalog snapshot and Ashley source comparison are under `.artifacts/operations-source-study/`.

Implemented checkpoints cover serving intent/zero quantities, compatible units, actual batch ratios, explicit imported-prep adoption, recipe-removal propagation, incremental submitted purchasing and receipt stock, purchasing-date handoff, ingredient identity reuse, historical demand routing/backfill, and explicit component replacement. These are not proof of the whole goal. In particular, the new history-routing fields require production backfill before catalog data reconstruction.

## Resume next

Automatic serving/headcount reconciliation and recipe-template propagation now
share the backend planner. Published Manifest3.6.52 fixes createVia parameter
and compute bindings; Capsule consumed it through Builder regeneration. The
current recipe checkpoint updates unstarted generated work, preserves custom
notes and performed/manual work, reports incompatible replacements, retires
unstarted requirements and keeps their dependency releases effective on later
supplemental work. Removal/cancellation preserves entire completed/canceled
rows. Imported-prep adoption again preserves two existing rows without duplicates.
Full bun run check passes (165files/1448tests); final independent Capsule review
and checkpoint commit/push status are recorded in progress.md.

Next required work includes source-backed substitution and component/ingredient
relationship changes across affected data, production concurrency and real event
records. Local recipe/removal proofs do not complete issue335 or the goal.
Purchasing week/reschedule/shared-stock corrections (#327/#328), live repair and
all source/data/UI/report requirements below remain required.

Shared draft cancellation and buyer quantity preservation now pass the full gate
(165 files/1453 tests) and independent gpt-5.6-sol review. Empty automatic orders
retire, manual choices remain, and order/contract desktop/mobile checks pass.
The next purchasing defect is confirmed date propagation: rescheduling leaves
seven downstream record groups on the old date, including subsequent serving
changes. Coordinate draft migration with committed supply and stock allocation;
do not patch dates alone and silently double-buy. See progress.md for the
checkpoint commit/push and current evidence.

Event cancellation/completion now cleans up active stock reservations and
unfinished logistics while preserving consumed stock, completed deliveries,
paid/partial invoices and payment history. The full gate passes (165 files/1455
tests); independent gpt-5.6-sol review APPROVE. Role/state, replay, exclusion and
transaction rollback checks pass in the generated runtime. Issues344-346 track
this branch repair; no production deployment or affected-data repair is claimed.
Resume the coordinated rescheduling/week/stock work above, with explicit
reservations and expiry in the allocation analysis.

Component recipe links now render recorded method steps, distinguish loading
from missing recipes, and preserve small scaled measurements. Full check passes
(165 files/1455 tests), independent gpt-5.6-sol approves, and actual prep-link
navigation plus component/ingredient pages pass isolated-data browser checks at
390/900/1440px. Issues347/348 remain open through release/live verification.
Continue the complete recipe/data flow, including event-quantity context and
authenticated usable links; this does not resolve the remaining source conflicts,
affected-data migration, purchasing calendar/allocation or final release work.


Continue source-backed reconstruction with `ashley-recipe-evidence.md` (15 dishes,71 work steps,113 ingredient rows) and `raspberry-balsamic-source.md`. The dressing component in `recipes/raspberry-balsamic.json` has a complete source batch and all-eight-ingredient runtime verification at167/334 servings. Its remaining salad relationships are not complete. The prep-only Ashley candidates are NOT apply-ready recipes.

Unresolved source conflicts include sauce Gruyere/cornstarch units, asparagus Parmesan quantity, chicken portion/yield, missing bruschetta tomato amounts, and equipment-dependent oil/infusion-kit quantities. Investigate corroborating material; do not invent measurements or classify every work step as a component. Owner clarification on sauce/Parmesan was requested; no answer recorded. Salad gorgonzola is now source-resolved as5.21875lb at167servings (see ashley-recipe-evidence.md); walnut candying method and confirmed finished yield remain missing, with owner method clarification pending. Four direct salad ingredients and all eight linked dressing ingredients pass actual runtime scaling at167/334; the full salad remains unapplied.

The event prep UI now groups by exact menu line and exposes servings, work quantities, instructions, component links and preserved execution facts; captured-data desktop/mobile and scratch rendering checks passed. Authenticated recipe navigation and repaired live records remain unverified.

Root classification issue326 must be handled in the existing-data repair: the raw217-root recipe export contains subrecipes/equipment, and the live snapshot already has dressing/hotel-pan/packaging Dish records. The measured-component repair can now atomically retire an explicit unreferenced misclassified Dish while preserving its source; direct production table reads including archived rows prove the current raspberry candidate has no references. Three additional vinaigrette batches are source/runtime-qualified in recipes/other-vinaigrettes.json; classify and reconcile all affected references before retiring incorrect records.

Remaining connected work includes full affected-data migration preview/application, fixed/equipment quantity bases, performed-work deltas, purchasing week normalization/reschedule/shared-stock allocation and empty drafts, historical display/report snapshots, linked recipe presentation, prep hierarchy, packing/equipment, staffing/timeline/forms/battleboard/My Day, desktop/mobile inspection, full required checks, independent final review, authorized release and authenticated live verification. Preserve the full scope; do not narrow success to the finished checkpoints.

Do not repeat completed source inspection without a specific reason. Before UI work, use DESIGN.md and its applicable design/system references. Only source-owned Manifest edits followed by `bun run manifest:regen`; set BUILDER_DIR to the isolated Builder. No authored tests beyond owner authorization; existing tests plus scratch actual-runtime checks are the current verification path.
