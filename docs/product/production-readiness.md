# Capsule production-readiness requirements

Status: **draft requirements, not a readiness certification**. Audited 2026-09-05 against integrated source `279f6a3ff8534707cc6df3a7cbd0aa9c8d7e518c` and that day's private migration verification receipt. Provider configuration and every authenticated production route were not rechecked for this spec-writing task.

This is the entry point and evidence ledger for fourteen additional [Ralph specs](../../specs/ralph/). [The product implementation plan](implementation-plan.md) remains the sole product roadmap. These requirements do not start Ralph, authorize a deployment/import, or regenerate its task plan.

## Outcome and approach

Capsule must support a real event from inquiry through booking, preparation, purchasing, staffing, delivery, payment, and management reporting. Imported TPP history must remain useful without fabricated recipes, stock, or accounting facts. Routine source synchronization, deployment verification, and retry work must not require Ryan to operate Git or paste JSON.

Finishing existing vertical workflows is the selected approach. A migration-only patch would leave native operations and release reliability unqualified; a rewrite would discard working domain models, screens, and proof. Preserve what exists, reproduce each suspected gap, and add only the missing behavior or evidence.

## Requirements map

“Depends on” means a boundary must agree and be exercised; it does not require every file in one spec to finish before useful work starts in another. Access and recovery contracts can be established first, then developed alongside each workflow.

| Spec | Operator outcome | Primary dependency | Audit classification |
| --- | --- | --- | --- |
| [PR01 Import archive](../../specs/ralph/production-01-import-archive.md) | Account for every source file and row | PR12/PR13; mappings PR02–PR05 | Partial import and resume/coverage gaps |
| [PR02 Source identity](../../specs/ralph/production-02-source-identity.md) | Use imported people, history, and catalogs | PR01/PR12 | Partial normalization and identity resolution |
| [PR03 Recipe truth](../../specs/ralph/production-03-recipe-truth.md) | Scale and cost real recipes | PR01/PR02 | Source-rich drafts not yet structured recipes |
| [PR04 Stock flow](../../specs/ralph/production-04-stock-flow.md) | Turn demand into reconciled stock and receipts | PR03/PR12 | Existing workflows; import and end-to-end gaps |
| [PR05 Financial truth](../../specs/ralph/production-05-financial-truth.md) | Reconcile money without invented transactions | PR01/PR02/PR12 | Historical references not a reconstructed ledger |
| [PR06 Booking handoff](../../specs/ralph/production-06-booking-handoff.md) | Carry a client booking into real operations | PR02/PR05/PR12 | Existing runtime proof; branding/lifecycle qualification |
| [PR07 Communication delivery](../../specs/ralph/production-07-communication-delivery.md) | Receive and send actual conversations | PR12/PR13 | Provider ingress and delivery qualification |
| [PR08 Provider sync](../../specs/ralph/production-08-provider-sync.md) | Reconcile connected business providers | PR05/PR06/PR09/PR12/PR13 | Existing connectors; Nowsta and live-account gaps |
| [PR09 Workforce](../../specs/ralph/production-09-workforce.md) | Staff service through corrected payroll | PR02/PR08/PR12 | Existing models; lifecycle and recovery qualification |
| [PR10 Equipment/logistics](../../specs/ralph/production-10-equipment-logistics.md) | Track outbound and returned physical items | PR04/PR06/PR12/PR13 | Existing logistics; full asset-cycle qualification |
| [PR11 Reporting](../../specs/ralph/production-11-reporting.md) | Trace distinct reports to real facts | PR01–PR10/PR12 | Existing renderers; coverage and semantic gaps |
| [PR12 Access/privacy](../../specs/ralph/production-12-access-privacy.md) | Protect tenant, identity, and file boundaries | Cross-cutting contract | Source risks identified; full audit not performed |
| [PR13 Release/recovery](../../specs/ralph/production-13-release-recovery.md) | Ship current work and recover safely | PR12; qualification PR14 | Release evidence exists; automation/recovery qualification |
| [PR14 Qualification/cutover](../../specs/ralph/production-14-qualification-cutover.md) | Prove coherent production operation | PR01–PR13 | New full-product completion contract |

Start with data integrity, identity/file access, and safe retry/recovery boundaries before activating new production effects. Then finish the event-to-money and event-to-service workflows, followed by full reconciliation and qualification. Reporting definitions and sanitized fixtures can progress alongside their domain owners. Qualification is required work, not an optional polish phase.

## Evidence that shaped these specs

The migration numbers below are aggregate observations from the private 2026-09-05 receipt, not promises that all records are correct or a live recount performed by these docs. Raw customer data, source workbooks, credentials, and private evidence remain untracked.

| Observation | Consequence |
| --- | --- |
| The archive contains 90 workbooks; its supplied index describes 70 | PR01/PR11 inventory the actual archive, not only the index |
| The receipt records 648 clients, 953 venues, 24 vendors, and 455 attachments | Existing imports are preserved; do not restart with destructive replacement |
| There are 143 source-rich recipe drafts and 74 source recipes with no ingredient body | Preserve provenance; do not claim normalized BOMs or invent missing ingredients |
| Historical payment references total 509, with 507 pending and two resolved; four nonpositive adjustments remain source-only | Reference capture is not ledger reconciliation; financial reconstruction needs explicit semantics |
| Historical communication and event evidence were attached, while some source matches remain ambiguous | Normal user history, conflict resolution, and stable source identity are still required |
| Shopping-list quantities do not reliably establish stock units; workbook formatting does not supply the missing unit truth | Missing units cannot become arbitrary `each` balances |
| `convex/importCommit.ts` provides materialization while `convex/importCoordinator.ts` still has unfinished paths | Trace actual consumers; neither “all imports work” nor “there is no importer” is justified |
| `convex/lib/proposalRevision.ts` includes literal tenant branding; `convex/messageInbox.ts` includes raw-envelope normalization | Complete real branding and provider ingress without discarding working proposal/message models |
| QBO and Calendar already contain reconciliation/retry paths | Extend their owners rather than build a duplicate sync framework |
| `convex/authProvision.ts` and `convex/fileStorage.ts` contain identity/file ownership paths needing targeted tests | PR12 requires boundary proof; this audit does not claim an exploited vulnerability or completed security review |
| Reports, KPI dashboards, venue screens, commission terms, and revenue attribution screens exist | Audit behavior and semantics; do not turn an old “missing UI” statement into a duplicate implementation |

Open GitHub issues were checked as backlog pointers, not as authoritative proof that their named bug still exists. A closed issue, generated entity, successful deployment command, or passing isolated test is likewise not full workflow proof.

### Stale completion claims

The older complete-feature status table and system inventory mix historical gaps with shipped capabilities. In particular, “no production migration,” “no report renderer,” and missing venue UI claims cannot describe the audited source plus today's receipt. The older Ralph plan's 21 completed tasks and 19 passing acceptance criteria apply to its original scope only. Keep their evidence and IDs; do not reuse their completion state for this pack.

## Shared implementation contract

1. Trace the owning authored Manifest/UI/backend source and current consumer before adding a task. Classify existing behavior separately from missing proof. Never hand-edit generated schema, dispatch, or client wiring.
2. Each PR-prefixed criterion is an observable requirement. When planning is later requested, map it to focused implementation/evidence tasks and new acceptance IDs without renumbering historical `AC-###` entries. Preserve the existing five Ralph specs.
3. Use stable source/operation IDs, tenant isolation, explicit partial/pending/uncertain states, and resumable work. Never represent a failed or unacknowledged external effect as success.
4. Historical import is data capture by default: no automatic client messages, charges, order submission, payroll posting, or duplicate external accounting. Preview and reconcile any authorized activation separately.
5. No fake names, placeholder pricing, guessed stock units, fabricated taxes, zero-cost substitution, or invented digital signatures. Unknowns are visible and actionable without blocking unrelated work.
6. Keep routine operations in the app or approved automation. Do not require recurring JSON entry, manual Git updates, terminal retries, or owner approval for every normal edit.
7. Preserve the approved design and its frontmatter authority from `AGENTS.md`. Conflicting historical DESIGN.md prose is not permission to invent a new theme. Apply the same usable empty/error/permission behavior across sibling screens.
8. Out-of-scope sections assign neighboring ownership or constrain this specs-only turn. They are not owner-approved product deferrals or an exhaustive ceiling on necessary work.
9. Test failure, missing configuration, absent source data, and undecided business policy are different states. Name the actual blocker and affected criterion; finish safe independent work.
10. Verify the changed surface with focused tests, required repository gates, and relevant authorized live proof. Keep private production data out of committed fixtures and reports. Do not invoke a build command that deploys during a docs-only task.

## Full-product coverage

| Existing complete-feature specification section | Requirements owning completion |
| --- | --- |
| §3 Foundation | PR12, PR13, PR14 |
| §4 Event lifecycle/acquisition; §5 Proposals | PR02, PR05, PR06, PR07 |
| §6 TPP migration/parallel run | PR01–PR05, PR11, PR14 |
| §7 Reports/dashboards | PR05, PR11, PR14 |
| §8 Venues | PR02, PR06, PR10, PR11 |
| §9 Staffing/HR | PR02, PR08, PR09, PR12 |
| §10 Kitchen | PR03, PR04, PR10, PR14 |
| §11 Equipment | PR04, PR10 |
| §12 Integrations | PR07, PR08, PR12, PR13 |
| §13 Completion proof | PR14 with each domain's focused evidence |

The detailed existing product specification remains intent evidence. This table does not silently remove a feature because a new criterion did not repeat every old field.

## Real business choices still needed

| Choice | What it affects | Safe work before the choice |
| --- | --- | --- |
| Historical financial reconstruction versus reference-only scope; authoritative accounting account/cutover | Posting and reconciliation policy | Preserve sources, implement both dispositions, preview unmatched records |
| Opening-stock timestamp and ambiguous units | Activating stock balances | Parse, map, retain provenance, show unresolved quantities |
| Provider accounts, entitlements, and field ownership | Live connection and synchronization | Build/replay contracts and failure handling using isolated fixtures |
| Commission, attribution, payroll, and ambiguous KPI definitions | Correct calculations | Inventory existing terms and expose missing definitions; do not guess |
| Retention, backup recovery targets, cutover/observation period | Scheduled deletion and operational sign-off | Preserve data, implement scoped controls, rehearse isolated restore |

Numeric recovery and performance targets in PR13/PR14 are proposed acceptance defaults, not measured results or existing service guarantees. The specs are ready for review and gap planning; the application is not declared fully production-ready by writing them.
