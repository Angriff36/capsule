# Production-readiness delivery sequence

Audit date: 2026-09-06. Source baseline: `cf232680731131b5500ca296ae214e36d52bd521`. This is supporting detail for [the sole product roadmap](../../docs/product/implementation-plan.md), not a competing roadmap or a production-readiness certificate.

## What the audit establishes

The earlier wiring release repaired real defects. It did not finish every requirement in PR01–14. Existing generated models, passing unit tests and a deployed branch are different evidence from an authenticated operator completing a whole workflow.

The criterion ledgers distinguish existing implementation, missing behavior, incomplete proof and account/business choices. Read the evidence scope on each row; a locally verified clause does not certify its whole system in production.

| Requirements | Current evidence and remaining work |
| --- | --- |
| PR01–04: archive, identity, recipes, stock | [Data audit](data-audit.md) |
| PR05–08: money, booking, conversations, integrations | [Commercial audit](commercial-audit.md) |
| PR09–11: workforce, equipment, reporting | [Operations audit](operations-audit.md) |
| PR12–14: access, release/recovery, qualification | [Platform audit](platform-audit.md) |

## Ordered deliveries

Each row is independently testable and releasable. Cross-cutting work accompanies the affected workflow; it does not require finishing the entire platform before useful improvements ship. Later rows are retained work, not owner-approved exclusions.

| Order | What the user gets | Requirements | Exit evidence |
| --- | --- | --- | --- |
| 1 | Save/reopen a recipe review, correct unknown units/yield, finalize once and view its original source | PR03 flat-formula portions; PR01/12/13 contracts | [Executable recipe plan](recipe-review-plan.md); real workbench reload and lost-acknowledgement proof |
| 2 | Upload an archive from the app, resume/cancel safely, account for every source row, resolve source identity once | PR01/02 | Sanitized archive/index discrepancy, partial/reference dispositions, conflict/replay and normal detail navigation |
| 3 | Use nested formulas, preserve published versions, scale event demand once and see honest cost/allergen evidence | Remaining PR03 | Nested/cyclic/scaled recipe cases, source basis, historical event cost and 100→150 serving reconciliation |
| 4 | Reconcile opening stock, reservations, purchasing, receipts and corrections | PR04 | Concurrent last-stock reservation, partial receipt replay, user adjustment preservation and reasoned correction delta |
| 5 | Classify historical money separately from live transactions; reconcile invoices, allocations, credits, refunds and fees | PR05 | Source-to-ledger tie-out, excluded reference history, money examples, retry and period/rounding evidence |
| 6 | Carry an agreed quote through booking, service changes and client acceptance/payment on a phone | PR06 | Structured agreed snapshot, native/imported event handoff, revocation and mobile payment lifecycle proof |
| 7 | Receive and send real conversations; see delivery state and provider sync failures on affected records | PR07/08 | Signed ingress, replay/outbound receipts, QBO correction sync, Calendar/Nowsta mappings and authorized sandbox receipts |
| 8 | Keep worker identity and time correct through offline use, corrections and payroll | PR09 | Captured clock timestamp/stable key, offline/reconnect/DST cases, confidential access, period export revision and provider acknowledgement |
| 9 | Know what equipment is available, loaded, outstanding, partially returned or damaged | PR10 | Out-of-service exclusion, concurrent reservation, itemized partial returns/locations and cancellation obligations |
| 10 | Get distinct useful report sets with traceable totals, matching exports and dated snapshots | PR11 | Source-workbook disposition, native/imported events, approved metric definitions, drill-through and long-export inspection |
| Continuous | Safe identity/file boundaries and reliable deployment, retry, backup and recovery | PR12/13 | Targeted two-tenant tests, pre-effect identity validation, parent-authorized files, exact-release receipt, tested restore and unsaved-draft recovery |
| Qualification | One complete event works across roles, source types and devices at realistic scale | PR14 | Native/imported end-to-end journeys, failure/concurrency cases, measured scale, accessible routes and a combined cutover/recovery receipt |

No row is satisfied by an attractive screen alone. Preserve existing source owners, generated command semantics and repaired atomic operations. Qualification fixtures and role/tenant checks start with delivery 1, not only the final row.

## Choices that affect activation, not all implementation

- Historical finance: reference-only versus reconstruction scope, authoritative accounting system and cutover period.
- Stock: confirmed physical count/as-of time and evidenced unit conversions.
- Commercial: invoice-numbering scope, tax/commission definitions, canonical event-state mapping and external-signature suitability.
- Providers: selected inbox/social accounts, QBO/Google/Stripe/Nowsta authorization, field ownership and consent/quiet-hour rules.
- Workforce: pay/break/overtime and payroll mapping definitions.
- Reporting/recovery: approved KPI definitions, retention/legal-hold policy, measured backup objectives and cutover approval.

Build isolated fixtures, correction interfaces and disconnected states while these choices remain open. Do not invent money, stock, credentials, legal conclusions or owner decisions. The existing approved Clerk development-auth allowance is not permission to rotate keys and is not a production-auth certification.

## Verification and handoff

The first executable plan is recipe review. Subsequent deliveries get their own bounded implementation plan from the criterion ledger immediately before execution; this avoids pretending a speculative whole-product code plan is ready to run unchanged.

For every delivery, distinguish source/test proof, local authenticated browser proof, provider sandbox proof and production proof. A missing credential is configuration-blocked only for that boundary. Update the owning system documentation and acceptance evidence without rewriting historical IDs or marking compound PR criteria complete prematurely.

This planning branch changes documentation only. It does not start Ralph, import private files, send messages, create charges, post accounting entries, modify production settings or deploy the app.
