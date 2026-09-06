# Full wiring audit implementation plan

Spec: specs/ralph/no-fake-data-or-dead-buttons.md. Owner authorized audit and fixes on 2026-09-06 after the earlier import-only plan omitted this work.

Goal: inventory shipped UI command/data paths, fix confirmed incomplete wiring and fake actuals, and make genuine provider/platform blockers explicit. Do not select a different narrow release or claim that passing tests alone proves full coverage.

Architecture: preserve Manifest ownership and existing UI design; fix authored consumers against generated contracts, make partial operations resumable/visible, and keep unavailable external effects honest. No production writes, deployment, new credentials, or speculative new product subsystems in this task.

## Phases

- [x] Inventory route families and authored command calls; combine three independent read-only audits with root's global contract/stub scan.
- [x] Turn every confirmed finding into a concrete fix task below and record inspected/untested areas in findings.md.
- [ ] Implement scoped fixes with focused failing regressions, then verify persistence/error/retry behavior.
- [ ] Run repository gates and independent cross-model review; fix review findings.
- [ ] Commit/push the work branch; update spec/acceptance evidence and report deployment separately.

## Initial repair tasks (verify owners before implementation)

- [x] W01: Proposal template save/archive/publish calls use generated docId contract; 335 direct calls plus enumerated adapters checked with no remaining missing docId.
- [x] W02: Batch completion captures actual completed yield; zero and failure retention covered. Historical uncertainty disclosed.
- [x] W03: Inbox outbound replies have explicit cannot-send/provider guidance and Copy draft, including honest legacy queued records; interaction tests and independent review pass.
- [ ] W04: Pack/layout template operations expose partial results with a safe finish path, or use existing atomic command.
- [x] W05: Route/projection estimates disclose assumptions; Task2 corrects commission totals/status/date basis and revenue/vendor labels with independent review.
- [ ] W06: Audit remaining reachable placeholders/stubs and add confirmed repairs without dropping them into unrelated future releases.
- [x] W07: Generator seed blocker #113 refreshed with source proof; no generated edit or live seed run.

## Constraints and evidence

Base 9eccdbc (deployed R2). Work branch fix/full-wiring-audit-20260906 in isolated release checkout. Existing user worktrees untouched. Preserve historical AC IDs; this audit will add new IDs. Read DESIGN.md before UI edits; do not change palette/layout language. Read Convex guidelines before backend edits. Use apply_patch and authored sources only. bun run check off Vercel builds locally without deployment.

## Errors

Long combined instruction reads were truncated and are being read in smaller chunks before relying on them. Early full check at addd337 passed 145 files/1320 tests, coverage, types, formatting, secrets, integration guards and local build, then failed root-cap 71 > 70 because this task's temporary .superpowers workspace adds one root. Do not weaken the cap: preserve durable report evidence under the existing plan directory, untrack the mistakenly force-added Task2 scratch report, and remove only this plan's temporary workspace at final cleanup. Verify the parent is empty before removing it; never remove another plan's artifacts.

## Global Constraints

Work only in C:/projects/capsule-release-20260905 on fix/full-wiring-audit-20260906. No production writes or deploys. Preserve generated ownership, domain policy, existing design language and unrelated files. Read AGENTS.md, DESIGN.md and applicable system documentation before UI work. The existing approved no-fake-data spec authorizes focused regression coverage for its fixes. Use test-first behavior checks, not assertions that merely duplicate source text. Use Git Bash for bun commands. Do not stage other tasks' files. Do not dispatch subagents from an implementation task. Commit scoped work and report exact test commands and red/green evidence.

### Task 1: Repair immediate command and delivery honesty

Own ProposalTemplatesPage.tsx, MessageInboxPage.tsx, ProposalsPage.tsx, ContractsPage.tsx, InvoicesPage.tsx and InvoiceDetailPage.tsx plus focused authored tests/helpers.
Fix proposal-template revise/archive/reactivate to pass docId. Inbox external email/SMS/social submission must visibly say cannot send because no provider is connected, preserve the draft, and never create a misleading queued outbound row. Display historical queued/failed delivery state; internal conversation logging stays usable and honestly named. Relabel status-only proposal/contract/initial invoice actions and notifications to publication/manual sent recording with concise external-delivery guidance. Preserve genuine invoice reminders and signature links. Verify commands, labels, retention and failure behavior with focused tests. No provider implementation or policy changes.

### Task 2: Correct measured values and factual labels

Own KitchenDisplayPage.tsx, RoutePlannerPage.tsx/routePlanner.ts, PurchasingQueueSplit.tsx/vendorPerformance.ts, RevenueAttributionDetailPage.tsx, CompMasterDashboardPage.tsx and focused tests/helpers.
Capture explicit actual batch yield, including zero, with unit; retain input on failure. Do not strengthen historical provenance claims. Label route straight-line distance, 40 km/h assumption, missing legs and local-only reorder. Name vendor receipt metric as received by purchasing-week end. Attribute revenue input prefill to quote/budget estimates. Comp Master must use applied sales_commission allocatedAmount directly, remove fabricated payment facts and 3% conversion, and keep period/status scopes consistent. Cover calculations and user-input/error cases.

### Task 3: Safe pack and layout template recovery

Own PackListDetailPage.tsx and EventBattleBoardLayoutsPanel.tsx plus narrowly shared helper and tests if justified.
Template application must be atomic through existing governed commands OR explicitly track confirmed created/remaining items and retain a safe finish-remaining action. Retrying after partial failure must not duplicate confirmed writes. Account for refresh/navigation and ambiguous network failure honestly; do not claim exactly-once without a backend key. Reconcile persisted rows or choose an authored atomic seam preserving generated command policies if client recovery cannot be safe. Cover mid-loop failure and successful resume, loading/busy/failure UI. Read Convex guidelines before backend changes; no raw generated edits.

Additional same-shape creation owner: EventDraftPoCoordinator.ts and EventDraftPoButton.tsx. Existing persisted draft/demand-line matching supports ordinary resume but generated order/line creation lacks stable keys, allowing ambiguous retries to duplicate. Add stable operation/demand keys across retries or atomic governed materialization; disclose partial outcome and safe finish. Preserve event-stage/role restrictions and current draft reuse.

### Task 4: Safe culinary clone, import and restore

Own menuTemplates.ts/MenuDetailPage.tsx, ComponentImportFinalizer.ts/ComponentImportPage.tsx, ComponentDetailPage.tsx and focused helper/tests.
Preserve new menu/component/ingredient IDs and confirmed line progress after failure; retry must finish existing work rather than create duplicates. Prefer atomic governed seams or persisted reconciliation as in Task 3. Snapshot restore must disclose partial changes and support finishing; snapshot capture failure gets a nonblocking warning. Cover each mid-operation failure and retry. Coordinate shared recovery interface from Task 3 rather than duplicating an identical abstraction.

Read-only architecture map: prefer a focused authored culinary mutation module using Task3's transaction/key conventions, not a cross-domain growing monolith. Menu clone accepts sourceMenuId/name/isTemplate/operationKey and loads source/header/lines server-side. Import accepts a resolved plain reviewed projection, validates referenced tenant-owned ingredients, and creates ingredients/component/lines in one transaction. Keep ComponentImportFinalizer API for CapsuleDocumentEnterCoordinator: that separate capability-based caller already supplies deterministic document keys and retired-record recovery; do not break it by removing the class. Restore accepts durable snapshotId and componentId (not trusted client JSON), loads current rows/server versions, and restores through generated commands atomically. VersionHistoryPanel must forward snapshotId. Explicitly validate tenant/live foreign references missing from generated line creators; do not invent stricter lifecycle requirements beyond existing source semantics.

Snapshot fidelity also needs repair: preserve prepNotes and backward-compatible sortOrder/wasteFactor fields (currently omitted/ignored); generated adjustQuantity cannot set all metadata, so use supported generated operations or atomic remove/re-add as needed. Old snapshots remain restorable. Capture-before remains best-effort with a visible warning, not a new blocker. Existing fixtures: tests/proofs/component-import-finalize.runtime.test.ts, component-text-parser.test.ts, quote-to-booked-event.runtime.test.ts. Test actual rollback, same-operation retry, wrong-tenant references, snapshot/component mismatch and exact restored metadata.

Task3 review lesson: generated cache is globally keyed and checked before generated auth. New public seams must authenticate before replay and tenant-scope deterministic keys. Mutable source projections cannot be rebuilt against positional child keys after an ambiguous commit: freeze the durable pending operation or persist a whole-operation receipt before processing changed input. A browser storage cleanup exception after commit must not convert confirmed success into a reported backend failure. Reuse the reviewed Task3 helper where compatible.

### Task 5: Safe operational bulk and event operations

Own KitchenDashboardPage.tsx, KitchenPrepAssignManager.ts and its consumers, EventMenuTab.tsx, EventTimelinePanel.tsx plus focused tests/helpers.
Bulk actions disclose confirmed completed/failed/remaining counts and retain unfinished selection. Event menu template application reports line progress and stock-sync failure, supports repeatable completion and persisted-row reconciliation. Inspect event menu demand/prep synchronization recovery and repair confirmed sibling defects. Timeline reorder is atomic or retains intended remaining adjustments with explicit partial feedback; retries use current versions. Do not modify dormant PrepBoardPage solely for this shipped audit.

Confirmed sibling to own: EventStockIssueCoordinator.ts + EventInventoryPanel.tsx currently consume stock before confirming/fulfilling demand; a later failure cannot retry because reservation is consumed. Make issuance+demand reconciliation atomic through governed commands or expose safe demand-only recovery without consuming stock twice. Existing EventPrepTaskSynchronizer stable creation idempotency keys must remain intact. EventPrepTab/KitchenDashboard sync-all feedback must distinguish completed dishes from a failing remaining sync.

Shared owner: src/ui/bulk-select.tsx useBulkRun also clears successful-prefix progress on failure for invoice/pack/purchasing callers. Surface completed/failed/remaining context through a reusable failure mechanism and preserve original denial/guard/conflict classification in CommandFailure.ts. Do not leave progress non-null after failure (would disable retry controls). Reuse this mechanism for compatible custom loops, with focused shared/helper tests and existing consumer tests.

Read-only trace: stock seam should load reservation/demand server-side, validate same tenant/event/ingredient, call generated consume then needed confirm/fulfill atomically, and reread actual demand version after confirm rather than assuming +2. Preserve intersection of generated inventory/event-management and demand permissions. Timeline seam validates complete row set against event/tenant and uses generated adjust with supplied versions; stale later row rolls all back. Event menu stock sync must wait for reactive saved EventDish/demand rows: current refreshStock closes over stale controller demand snapshots, so immediate post-create sync can miss new demands. Make saved-lines and retry-stock-sync phases explicit. Shared BulkRunFailure should carry cause and counts; classifier unwraps cause before preserving category/title/action and adding counts. Existing invoice/pack/purchasing selection already clears only after complete success; retain or remove confirmed IDs appropriately.

### Task 6: Shared failure handling

Own AttachmentsSection.tsx and useSavedViews.ts plus focused tests/helpers.
Await attachment removal, catch into existing visible failure state, and disable duplicate pending removal. Saved-view default changes must not silently leave no default after a second write fails; use an existing atomic command or preserve/recover previous state with truthful error. Cover reject/success/pending and partial-failure behavior.

Additional bulk owner: ClientRetentionPage.tsx opening outreach tasks. Ensure retries do not duplicate open tasks after ambiguous commits (atomic ensure-open seam or stable generated idempotency keys), preserve ability to open a later task after prior task dismissal/completion, and show completed/remaining bulk counts. Preserve current uncovered-candidate filtering.

Verify shared form-retention candidate: RevenueAttributionDetailPage apply-amount effect depends on reactive event and can overwrite operator edits when event data refreshes. Add a mounted regression changing the event query after editing; if reproduced, initialize per apply context without overwriting edited amount/provenance. This is separate from Task2's now-correct estimate labels and must preserve them.

Saved views actually reuse owner-scoped SavedReportDefinition, chartType list-view, definition {pageKey,isDefault,state}. Prefer an authored atomic seam that loads the caller's current live defaults and target server-side, invokes existing create/update commands, and rolls back all changes on failure; do not introduce a competing SavedView entity. For outreach, ensure-open must return whether it created or reused a task, so single/bulk notices count actual creations accurately; preserve valid later outreach after complete/dismiss.

### Task 7: Connect proposal templates end to end

Own proposal creation, template defaults helper, authored proposal draft/revision/rendering owners and manifests if required; coordinate Task 1's template management fix.
Provide template selection on new proposal. Snapshot template defaults into draft: terms, notes, validity, tax, structured service charge and visible sections. Persist/render these consistently across saved drafts, revisions, PDF and shared proposal. Preserve old proposals/default behavior when no template is selected. Changing a template later must not mutate sent revisions. Read current pricing and generated ownership before choosing schema changes, use manifest:regen only when needed. Test template selection through actual draft/revision data contracts and all supported rendering paths. Do not mark connected by changing descriptive text alone.

Verified existing interface: src/lib/pricing.ts already supports percentage pricing lines against the non-percentage base subtotal, and includes those fee amounts in subtotal. Reuse this central percentage-line path for an explicit service-charge line rather than introducing a competing fee calculation or changing the total invariant. Template rates are fractions 0..1; pricing percentage unitPrice is 0..100. Preserve the basis and make tax default calculation/override clear; do not silently treat the template rate as a currency amount.

Implementation map from read-only architecture trace: the strictly necessary new persisted field is optional Proposal.visibleSections, forwarded through draft and revision JSON. Existing terms/notes/expiresAt/taxAmount and fee lines already persist. Default tax becomes an editable currency amount at creation; clearly explain that saved tax is fixed, and stop auto-updating when the operator manually edits it. Do not add an unused persisted tax-rate field. Absent/empty section lists retain manager's existing All sections compatibility. SharedProposalPage currently omits snapshotted dish selections, timeline and expiry; project real data through shareLinks.ts and snapshot timeline in proposalRevision.ts where needed. PDF export currently enriches from live data: use immutable revision data for published proposals, explicit legacy fallback without snapshots, live data for drafts. Render actual notes as notes rather than pretending they are a menu. Inspect signing's ProposalAcceptancePage/signatureAcceptance projection too; presentation CTA visibility must not disable the actual signing control. Test draft -> persistence -> publication snapshot -> shared/PDF output, then template changes do not change frozen output.

Client projection privacy remains binding: timeline snapshot/render should use client-facing activity identity/times, not private site/staff notes, assignments or internal costs. Do not expand public sharing to raw operational documents merely to fill a visible section.

Preserve Task1 delivery honesty in the newly connected creation form: its existing success notice still says Send it when ready even though the action is publication/manual sharing. Use accurate publication/share wording here too.

### Task 8: Global reconciliation and verification

Root inventory all authored generated-hook consumers for docId contract, verify seed blocker #113 without running live seed, and reconcile route coverage with every finding. Add remaining confirmed defects to the ledger rather than silently dropping them. Run focused gates and bun run check, independent cross-model whole-branch review with DESIGN.md and catering-tdium rule. Update acceptance evidence with exact proven boundaries; commit and push branch, deployment remains separate.
