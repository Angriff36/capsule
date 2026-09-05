# PR08 — Keep connected providers consistent

_Serves JTBD(s):_ Josh — stop rekeying accounting/calendar/payroll data; Kayden — get paid for the work recorded.

## Job Statement

Connect each business provider once, then see accurate sync results without silently duplicated external records.

## Baseline and ownership

Draft requirements; shared contract: [production readiness](../../docs/product/production-readiness.md). Existing owners: `convex/qboSync.ts`, `convex/googleCalendar.ts`, `convex/stripeConnect.ts`, `convex/smsAlerts.ts`, their `convex/lib/` helpers, and integration/external-link domain models. QBO and Calendar already expose connection status, reconciliation, scheduling, and retry behavior; do not replace them with a second framework. No Nowsta-named implementation was found in the inspected checkout; #122 records credentials as a prerequisite. Presence of a connector does not verify an enabled production account.

## Acceptance Criteria

- [ ] PR08-01: Each supported provider exposes connect, reconnect, status, last successful sync, backlog, scoped retry, and disconnect from the owning app workflow. One successful OAuth exchange does not claim a successful sync.
- [ ] PR08-02: Before first data sync, record entity/field ownership, tenant/account mapping, external IDs, effective cutover date, and historical inclusion. Capsule and provider edits cannot silently overwrite each other or create update loops.
- [ ] PR08-03: QBO customers, invoices, payments, taxes, and corrections reconcile by stable IDs. Reference-history migration cannot unexpectedly post old invoices/payments to an already populated provider account.
- [ ] PR08-04: Calendar creates one item per Capsule event/target, updates material changes, and handles cancellation and revocation. Repeated jobs and overlapping retries do not create duplicate calendar entries.
- [ ] PR08-05: Nowsta supports the agreed worker/role/shift/time/pay mappings, stable external IDs, incremental changes, conflicts, and correction results. CSV export alone cannot satisfy a claimed live Nowsta sync.
- [ ] PR08-06: Payment and messaging callbacks validate authenticity, account scope, and replay identity before business effects. Out-of-order callbacks cannot regress settled/delivered state or duplicate an allocation.
- [ ] PR08-07: Token expiry, throttling, timeout, provider outage, and a crash after remote success produce bounded retries or a visible uncertain/dead-letter result. Acknowledged effects are reconciled before resend.
- [ ] PR08-08: Disconnect prevents new provider work and queued sends, preserves historical receipts, and explains pending work. Reconnect resumes safely; secrets/tokens never appear in logs or browser-visible status.
- [ ] PR08-09: A provider outage does not roll back a valid event or staff edit. Its pending/error sync is visible from that record and clears after verified recovery.

## Dependencies and proof

PR05/PR06/PR09 define business payloads; PR07 owns conversation UX; PR12/PR13 supply secure execution/recovery. Maintain a per-provider evidence matrix with credential state, contract replay proof, sandbox result, and production result. Refresh official provider documentation during implementation; these specs do not assume an API entitlement or quota.

## Out of Scope

No product capability is excluded. This owns reliable transport and reconciliation, not a second source of pricing, payroll, or event truth.

## Open Questions

Owner/account administrator must authorize real provider accounts and confirm QBO/Nowsta field ownership and any paid API access. Missing credentials are a configuration blocker, not permission to label the integration complete.
