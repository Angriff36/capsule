# PR06 — Carry a client's booking into the event

_Serves JTBD(s):_ Clients — price, accept, and pay from a phone; sales — hand off the agreed booking without re-entry.

## Job Statement

Let clients book an accurate proposal whose accepted details remain intact throughout event operations.

## Baseline and ownership

Draft requirements; shared contract: [production readiness](../../docs/product/production-readiness.md). Owners: `convex/quoteBuilder.ts`, `convex/lib/proposalRevision.ts`, `convex/clientPortal.ts`, `convex/invoicePayments.ts`, `src/sales/`, `src/operations/event.manifest`, and `src/features/clients/`. Existing public quote, signature, proposal/event projection, payment, and revision seams must be reused. The deployed quote retry fixes and event-authorized booking projection are existing behavior, not new backlog. Verified gap: proposal snapshot construction still contains a literal tenant name placeholder. Event source distinguishes sales lock/executing but needs proof of the intended business pipeline. Existing Ralph booking specs remain binding.

## Acceptance Criteria

- [ ] PR06-01: Public menu, self-service quote, internal proposal, PDF, acceptance, and portal use the same effective sell prices and eligibility rules. Internal cost, margin, employee details, and unrelated clients are never exposed.
- [ ] PR06-02: Menu/package selections, quantities, enhancements, attribution, consent, and estimate assumptions are structured and arrive on the sales record after one submission. Retries of failed submissions complete missing work without duplicating the lead/event.
- [ ] PR06-03: Staff create a proposal from either a native or imported event, choose a real branded template, reorder supported sections, preview, publish, and share without retyping the event. No placeholder tenant branding reaches a published artifact.
- [ ] PR06-04: Every share/signature references an immutable revision with its pricing, terms, selections, timeline, and venue logistics. Revocation, expiry, supersession, and repeated acceptance have explicit, idempotent outcomes.
- [ ] PR06-05: Imported acceptance is labeled historical with source evidence; it cannot invent a digital signature or silently bypass the normal revision snapshot path. A published accepted revision remains reproducible after catalog/event edits.
- [ ] PR06-06: Quote, sales lock, confirmed, execution, final, completion, cancellation, archive, and reopen outcomes map explicitly to the canonical lifecycle. Confirmation is not merely a misleading label for work already executing. Duplicate event creation does not copy payments, signatures, or completed work as new actuals.
- [ ] PR06-07: The booked event receives the agreed guest count, service style, venue/logistics, menu, timeline, and enhancements once. A field employee can read operational booking details without acquiring sales-price permissions.
- [ ] PR06-08: An authorized manager can record a live substitution, 86 a dish, change instructions, or adjust quantities without rewriting the accepted commercial snapshot or being forced to reopen the whole event. Financial consequences stay on their financial correction path.
- [ ] PR06-09: A client pays a deposit or remaining balance on mobile, receives an honest pending/succeeded/failed result, and sees the reconciled balance after provider confirmation. Double-click, refresh, callback replay, and a lost response cause no second charge or allocation.
- [ ] PR06-10: The full inquiry → proposal → acceptance → event → payment path works after refresh with revoked-link, concurrent-edit, provider-failure, and cross-tenant cases. A disconnected payment provider never displays successful payment.

## Dependencies and proof

PR02 supplies catalog mappings; PR05 owns money; PR07/PR08 own delivery/providers; PR12 owns public-token boundaries. Extend `tests/proofs/quote-to-booked-event.runtime.test.ts` and `proposal-event-booking.runtime.test.ts`, then prove the same journey through the actual mobile UI.

## Out of Scope

No product capability is excluded. Kitchen/stock execution belongs to PR03/PR04; workforce/logistics handoffs belong to PR09/PR10.

## Open Questions

Locate the approved business definition for confirmed versus executing before changing lifecycle states. Provider/signature legal suitability is an owner decision; these specs do not assert legal compliance from a technical signature callback.
