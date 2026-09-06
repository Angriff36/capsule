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
