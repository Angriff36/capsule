# Full wiring audit evidence

## Baseline

The prior plan intentionally chose import-only work. The no-fake-data spec remains unimplemented; issues #275–#279 are existing findings, not sufficient evidence of a completed route sweep. 559 files under src/features at baseline. HTML input placeholders and deliberate idempotent no-ops are not automatically defects.

## Confirmed candidates

- ProposalTemplatesPage save/archive/publish passes id where generated contract requires docId (agent evidence; root verification pending).
- MessageInboxPage creates outbound queued rows but does not display delivery state (agent evidence; provider trace pending).

## Coverage

- Commercial audit: clients, sales, finance plus backend owners — in progress.
- Operations audit: kitchen, production, logistics, stock, procurement, facilities — in progress.
- Other routes audit: events, workforce/staff, admin, reports, home, portal — in progress.
- Root: route inventory, generated-command call contract scan, platform seed proof — in progress.

No full-app completion claim until the coverage and repair evidence are reconciled.

## Completed static audits (2026-09-06)

All three read-only auditors finished. Coverage is source-level inventory/pattern scanning plus targeted command tracing, not authenticated browser proof for every control.

Confirmed repair ledger:

1. ProposalTemplatesPage revise/archive/reactivate passes id instead of docId (#275).
2. KitchenDisplayPage completes with plannedYield as actualYield (#276); capture measured yield including zero instead. Historic yields have no provenance.
3. MessageInboxPage queues external replies without sender and hides delivery state (#277). Internal logging is valid; invoice reminders actually use Resend and must remain enabled.
4. PackListDetailPage and EventBattleBoardLayoutsPanel template loops leave partial data with generic errors and duplicate retry (#278).
5. RoutePlannerPage uses straight-line distance and 40 km/h; label assumptions, omitted legs and local-only ordering (#279).
6. Proposal/contract/initial invoice lifecycle commands do not deliver documents, despite sent success text. Use honest publish/manual-delivery wording.
7. Proposal templates have no create-form consumer; persist default terms, taxes, service charge and section visibility through draft/revision/rendering.
8. RevenueAttributionDetailPage presents quote/budget prefill as actual revenue; identify estimate basis and allow confirmed input.
9. CompMasterDashboardPage multiplies already-computed commission allocation by 3%, confuses approved/applied with paid, includes other attribution types and mixes monthly/lifetime scopes.
10. menuTemplates.ts creates menu then lines; failure/retry duplicates headers. Preserve target and resume remaining lines.
11. ComponentImportFinalizer creates ingredients/component/lines separately; preserve created IDs and resumable progress.
12. ComponentDetailPage snapshot restore partially writes and silently drops capture failure; report and recover.
13. KitchenDashboardPage bulk actions and KitchenPrepAssignManager hide partial progress; retain unfinished selection.
14. PurchasingQueueSplit calls purchasing-week-end receipt proxy on-time delivery; name actual measure.
15. AttachmentsSection discards remove rejection; await, expose failure, prevent concurrent double removal.
16. EventMenuTab template application can partially create lines or fail stock sync; show progress and repeatable completion.
17. EventTimelinePanel reorder loops adjustments; preserve retry intent and expose partial results or transact atomically.
18. useSavedViews clears previous default before setting new; repair partial-default risk.

Non-defects checked: labeled nutrition/seasonal/payroll estimates; missing-price costing; finalized closeout financial reports; real invoice reminder provider; MessageThread_create is genuine creation without docId; report sample labels are provenance, not fake runtime data. PrepBoardPage partial loop is dormant/unrouted and is recorded but not a shipped defect.

Coverage: commercial clients/sales/finance; operations kitchen/production/logistics/inventory/facilities; events/workforce/staff/admin/reports/home/clientPortal/eventDay/notifications/chat/attachments/views/search/announcements. Event demand/prep synchronization needs additional focused recovery inspection. Root global generated-call and seed checks remain open.

## Seed refresh

Current generated seed now has an isMainModule guard, argv/CONVEX_URL selection, usage error without a URL, and top-level await seedConvex(deploymentUrl). Thus the original no-entrypoint finding in still-open GitHub #113 is stale in this checkout. No seed was executed against a database. Remaining entity coverage/auth/runtime behavior still needs inspection; do not mark the full issue fixed from the entrypoint alone.

Diagnostic note: PowerShell rg with tests/*wiring* yielded invalid Windows filename syntax; use rg --files tests then filter, or rg -g globs.

## Generated command contract inventory

Root AST inspection reads the actual Convex mutation validators, maps 591 docId-requiring generated hooks, and checks direct authored calls with lexical variable/spread resolution. Initial result: 335 direct calls checked, only the three known ProposalTemplatesPage missing-docId calls confirmed. Nine dynamic arguments need targeted inspection. Artifact: .artifacts/audit-command-contracts.ts and .json. This does not yet cover hook values passed into coordinator objects; those require separate reference tracing. Scanned TS/TSX count differs from all-feature-file inventory because non-code assets are excluded.

Dynamic arguments: EventInventoryPanel's three adapter inputs originate in EventStockIssueCoordinator, which supplies docId for consume/confirm/fulfill. useEventMenuSync releaseReservation is typed with docId and delegates to EventStockReservationCoordinator. Four other dynamic spreads already explicitly contain docId (CloseoutPage, RevenueAttributionsPage, KitchenCatalogPage, EmailNotificationSettingsPage); verify spread payloads cannot overwrite it. Prep refresh remains for targeted read.

Seed blocker remains generator-owned despite fixed entrypoint: no client authentication is set before protected Announcement creation, and Event creation contains literal placeholder foreign IDs. Source-only evidence prepared in .artifacts/seed-audit-update.md for #113; no live seed execution. Incorrect guessed coordinator filenames produced read errors; resolved with rg --files.

Seed tracking refreshed: https://github.com/Angriff36/capsule/issues/113#issuecomment-5559205519. Prep refresh supplies docId in EventPrepTaskSynchronizer:196-197; reservation release supplies docId in EventStockReservationCoordinator:319.

Atomic orchestration precedent: convex/lib/proposalDraft.ts calls governed generated creates through ctx.runMutation in one parent mutation. Convex guidelines confirm nested mutation subtransactions: do not catch and suppress an error if whole-operation rollback is required. Pack/template client loops are small enough to consider this existing pattern before building client progress machinery.

Passed-reference audit finished without new missing docId: CatalogsSection:139-168; catalogPrimaryImageUpload:49-54; EventDetailRevisePanels:138/193/235/291 and EventDetailReviseContactPanels:66/130; KitchenCatalogLifecycleButtons:87-108; KitchenPrepAssignManager:30/58/62/66/73; MyDay registry forwards supplied docId; timeRecordEntry:153-198. All nine dynamic entries resolve to docId-bearing input; identifier-name false positives (horizon.start, ReasonCopy) excluded. Static tracing only; arbitrary future dataflow is not proven by this scanner.

## Follow-up partial-write inspection

19. EventStockIssueCoordinator consumes reservation (and stock reaction) at :92 before confirm/fulfill :134-144. Failure in latter commands leaves issued stock but open demand; retry is explicitly rejected by the non-active guard :77-79. EventInventoryPanel:253 only shows generic failure. Finish this path atomically with governed commands or add explicit demand-only recovery, retaining double-issue protection.

EventPrepTaskSynchronizer creation uses stable event-prep idempotency keys (:237), and reconciles existing tasks; preserve this valid protection in Task 5. Root AST await-loop inventory (.artifacts/audit-write-loops.ts) identified additional import/staffing/tips/stock-count/outreach loops for targeted read-only follow-up. Loop presence alone is not a defect.

Follow-up audit found two additional confirmed creation-retry gaps:

20. ClientRetentionPage:151-162 opens tasks without keys/ensure-open. Persisted-state filtering helps normal retry but an ambiguous commit/stale snapshot can duplicate an open task. Generic bulk failure omits progress. Add ensure-open/retry identity plus counts (Task 6).
21. EventDraftPoCoordinator:121-165 creates header/lines without keys; EventDraftPoButton:108-113 hides partial outcome. Persisted demand-line matching resumes normally but ambiguous retry can duplicate writes. Use stable generated-create keys or atomic draft materialization and honest feedback (Task 3).

Follow-up non-defects: external-record verify/skip/match are repeat-safe state sets with retained selection; QuickFileImport keeps chunk results and materialization dedupes active external links; staffing scheduling uses atomic onePerEvent and cancellation retries remaining shifts; tip payroll rows have deterministic share keys; stock counts have session/item keys, uniqueness and explicit repair UI; roster notices have deterministic weekly keys and persisted unpublished filtering; chat upload failure cleanup is reference-safe and message send uses one server transaction with draft key.

Proposal integration architecture trace: current fields already persist terms/notes/expiry/tax currency and percentage fee lines. Optional visibleSections on Proposal is needed; revision JSON can add visibility/timeline without a table change. Shared rendering currently omits menu selections/timeline/expiry. Published PDF currently uses live enrichment (ProposalsPage:579-646) rather than its immutable revision; fix with snapshot adapter, retaining explicit legacy/no-snapshot fallback. proposalPdf currently labels notes as Proposed menu; do not show template default notes under a fabricated menu heading. Signing projection is another consumer to inspect. Template-tax default should be clearly editable fixed currency (existing recomputation preserves taxAmount), not an unused stored automatic rate.

22. Shared useBulkRun (src/ui/bulk-select.tsx:54-74) publishes count only while working, then clears it in finally even on failure. Its invoice/pack/purchasing consumers receive the underlying error without count, hiding successful prefix writes. Repair shared failure context once in Task 5, preserving original denial/guard/conflict classification and allowing retries (do not keep progress non-null, which disables buttons).

Tooling note: Prettier emits no output for planning Markdown because .prettierignore ignores *.md/*.mdx. --file-info confirms ignored:true. This was not evidence of an executable failure; no ignore settings changed.

Yield acceptance interpretation: new completed yields must be operator-entered and persisted. Existing rows lack measured/autofilled provenance, so the report must disclose historical uncertainty rather than claim those old values became real because the input bug was fixed. No historical quantity is overwritten or fabricated by this audit.

Expanded generated-call scan to authored src/ui and src/lib as well as features/app: 656 TS/TSX files, same 335 direct calls, zero missing docId at 2514043. Nine dynamic/adaptor paths remain manually verified. No additional hook pass-throughs appeared in ui/lib.

Task2 review found application-month filter using creation time despite canonical appliedAt. Root also found missing-person allocations omitted from totals but present in detail rows as Unknown salesperson. Both have been sent to the Task2 implementer with regression requirements before acceptance.

React follow-up candidate for Task6 verification: RevenueAttributionDetailPage:110-116 resets eventRevenue and provenance on every reactive event object change, even after an operator edits the apply amount. This effect predates the repair, but can replace an operator-entered confirmed amount with a quote/budget estimate while the form stays open. Reproduce with a mounted input + changed event query before fixing; seed on context entry only and preserve edits if confirmed.

Culinary recovery trace: ComponentImportFinalizer also serves CapsuleDocumentEnterCoordinator, whose capability executor already supplies deterministic document keys and retired-record recovery. Preserve that API while moving the shipped import page to atomic orchestration. Snapshot restore additionally loses prepNotes-only changes and does not capture sortOrder/wasteFactor; include compatible snapshot metadata repair in Task4. MenuDish/ComponentIngredient generated creates omit some relation validation: authored orchestration must check tenant-owned live references rather than blindly forwarding client IDs. Use a focused culinary module if adding all operations would bloat Task3's cross-domain seam.

Task3 independent review confirmed generated child idempotency cache lookup precedes authentication and does not compare arguments. Public orchestration must authenticate/tenant-scope before invoking cacheable commands; freeze pending projection or replay a parent receipt to avoid changed-source positional corruption. Added these requirements to the next culinary brief. Diagnostic path guesses for useIdempotencyKey and ProposalCreateForm were wrong; use rg --files and symbol searches instead of assumed feature filenames or PowerShell wildcard paths.

Task7 creation-form follow-through: src/features/clients/ProposalCreateForm.tsx success notices still say Send it when ready for the client. The actual action is now honestly named Publish proposal; update this notice with the template integration so the new flow does not reintroduce implied automatic delivery.

Generator-wide idempotency scope/replay concern filed per escalation rule: https://github.com/Angriff36/capsule/issues/281. Public issue contains high-level source boundaries and expected local tests, no credentials/record IDs/exploit procedure. New authored seams mitigate their own paths; this is not a platform-wide generated-wrapper repair, and production was not probed. Existing seed blocker #113 remains separate.

Task5 trace verified atomic stock issuance is preferable: consume decrements stock in its transaction; confirming/fulfilling demand must share it and use actual reread versions. Demand relation is event+ingredient rather than reservation field. Timeline stale later-row version must roll back prior adjusts. Event menu immediate refreshStock captures pre-create controller/demand snapshots (useEventMenuSync:66-112, EventMenuSyncController:215-240), so retry only after reactive rows arrive. These details are in Task5, not silently dropped after template line recovery.

## Documentation versus implementation reconciliation

- **Seed execution**
  - Docs claim: the initial no-fake-data spec says seed defines a function and exits.
    - Real-world example (Docs claim): running seed with a URL would perform no writes.
  - Implementation: C:\projects\capsule-release-20260905\scripts\seed-convex.ts:1412-1422 now invokes the function, but authentication is not configured and line178 still supplies placeholder related-record IDs. No live seed was run; #113 remains open for those actual blockers.
    - Real-world example (Implementation): a reachable entry point is not proof that a protected event with valid client relationships can be seeded.
- **Actual yield provenance**
  - Docs claim: the acceptance wording asks the production-yield report to state its data is real.
    - Real-world example (Docs claim): a historical row showing ten units could be mistaken for an observed measurement.
  - Implementation: C:\projects\capsule-release-20260905\src\features\production\KitchenDisplayPage.tsx requires an entered yield, including zero; C:\projects\capsule-release-20260905\src\features\production\ProductionYieldDashboardPage.tsx:297-300 discloses the historical copied-plan limitation. Old values are not relabeled as verified observations.
    - Real-world example (Implementation): an operator completing seven units records seven; an old ten-unit record remains of uncertain provenance.
- **Completion versus deployment**
  - Docs claim: the historical loop report says its listed tasks are complete and the branch is pushed.
    - Real-world example (Docs claim): the operator could assume every started feature is wired and the production site contains it.
  - Implementation: C:\projects\capsule-release-20260905\IMPLEMENTATION_PLAN.md now starts with WIRING-1 through WIRING-8, retaining the historical release boundary; C:\projects\capsule-release-20260905\scripts\vercel-build.sh and branch deployment rules separate work-branch pushes from production releases.
    - Real-world example (Implementation): reviewed Task1-3 fixes are pushed at01194ef, while culinary, operational, shared and proposal-template work is still pending and no new production release has occurred.

Saved-view default safety follow-through (Task6, same finding18): C:\projects\capsule-release-20260905\src\features\views\useSavedViews.ts assumes listSavedReportDefinition is owner-scoped. Generated C:\projects\capsule-release-20260905\convex\queries.ts:9748-9762 correctly allows managers/shared reports per Manifest, so a manager's personal-view adapter can include and clear another owner's default. Restrict the personal adapter's projection/default transaction to caller-owned page views, while preserving broader report management policies. Add two-owner manager regression.

Receipt privacy release blocker: independent source review confirmed #281 also exposes our newly stored technical receipt payloads via unrelated generated wrappers, despite auth in our own seam. Predictable scope-head/fallback keys make UUID secrecy irrelevant. No production probing occurred and these branch changes have not been deployed by us. Task7 will use its planned Manifest regeneration to add a commandless private technical receipt table, switch the helper, and remove redundant generated child caches from atomic parent-receipted operations. Existing business/agent idempotency remains untouched. This closes the new branch's exposure; it does not claim the generator-wide bug fixed.
