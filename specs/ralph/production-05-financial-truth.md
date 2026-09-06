# PR05 — Reconcile historical and current event money

_Serves JTBD(s):_ Josh and Tim — make decisions from billed, collected, outstanding, and retained revenue.

## Job Statement

Trust Capsule's balances after migration without duplicate invoices, fake payments, or rewritten financial history.

## Baseline and ownership

Draft requirements; shared contract: [production readiness](../../docs/product/production-readiness.md). Owners: `src/sales/invoice-core.manifest`, `payment.manifest`, `credit-memo.manifest`, `convex/invoicePayments.ts`, `convex/importCommit.ts`, and `src/features/finance/`. The current migration imported 509 payment references, not 509 ledger payments; four nonpositive adjustments were not represented. One event's itemized paid invoice was reconstructed and its empty placeholder voided. Issues #136/#165 concern invoice numbering/cascade duplication and must be reproduced against the current source before changing it.

## Required behavior

Offer reference-history and ledger-reconstruction modes with a preview of affected periods and records. Capture the choice once per migration scope, not once per row. Reference rows remain excluded from live receivables/cash totals. Reconstruction needs authoritative invoice/transaction evidence and preserves source effective dates separately from import timestamps. A lost quote is not a collectible invoice. Accounting changes use governed correction/allocation commands, not generic status updates.

## Acceptance Criteria

- [ ] PR05-01: Each financial row is classified as quote, invoice, payment, allocation, refund/return, fee, gratuity, credit, balance snapshot, or aggregate report. Overlapping reports cannot each post the same money.
- [ ] PR05-02: Reference mode retains positive, zero, and negative source entries with source identity/date/type. Every row has a result; reference-only rows are visibly excluded from ledger totals.
- [ ] PR05-03: Reconstruction previews client/event links, invoice numbers, currency, line items, tax, service charges, deposits, credits, effective dates, and unpaid balances. Missing detail stays identified; it is not replaced by invented taxable line items.
- [ ] PR05-04: Source invoice numbers remain traceable; new native numbers are human-readable and unique within their documented numbering scope. Event approval, repeated closeout, import retry, and webhook replay never create duplicate placeholder invoices.
- [ ] PR05-05: A synthetic invoice of 1,000.00 paid by 100.00 plus 900.00 closes at zero; a separate 3.50 processing fee does not become invoice principal. Refunds, chargebacks/ACH returns, partial allocations, overpayments, and credit memos produce traceable balances rather than disappearing or being forced positive.
- [ ] PR05-06: Money calculations use the existing precision contract with deterministic rounding. Invoice totals, allocations, statement balance, aging, tax, and reporting reconcile to the smallest currency unit; no undocumented tolerance hides mismatches.
- [ ] PR05-07: Exact provider/source IDs can reconcile automatically. Ambiguous amount/date/name matches remain suggestions; an authorized resolution is reusable and cannot allocate one transaction twice.
- [ ] PR05-08: Historical reconstruction sends no emails, initiates no charges, creates no provider invoice automatically, and cannot accidentally start reminder jobs for archival records. Ordinary new invoices retain their normal delivery/payment workflow.
- [ ] PR05-09: Corrections retain the original record and cause. Historical actuals, operational import time, and accounting effective date are distinguishable; voiding an empty placeholder does not erase its audit history.
- [ ] PR05-10: A saved reconciliation report ties source totals to ledger totals by period/status/currency and drills into every discrepancy. A paid invoice with incomplete cost data never claims a fully known profit.

## Dependencies and proof

PR01/PR02 establish source identity; PR06 owns native quote/payment journeys; PR08 owns provider ownership; PR11 owns reporting definitions. Exercise native, imported, refunded, cancelled, and partially paid cases plus concurrent duplicate deliveries.

## Out of Scope

No product capability is excluded. This defines accounting truth; provider transport belongs to PR08 and user-facing payment completion to PR06.

## Open Questions

Before posting historical records, the owner must choose reconstruction versus reference scope and the authoritative accounting system/cutover period. Tax and commission bases come from approved business definitions, not an agent's assumptions. These choices do not block reference capture or implementation of both modes.
