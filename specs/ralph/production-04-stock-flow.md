# PR04 — Maintain a trustworthy event stock position

_Serves JTBD(s):_ Josh — stock an event without re-entry; Kayden — see what is missing before service.

## Job Statement

Turn event requirements into the right stock reservations and draft purchasing needs without double counting inventory.

## Baseline and ownership

Draft requirements; shared contract: [production readiness](../../docs/product/production-readiness.md). Owners: `src/inventory/`, `src/procurement/`, `src/culinary/event-dish.manifest`, `src/agent/CapsuleEventBundleSupplyPlan.ts`, `docs/systems/inventory.md`, and `docs/systems/procurement.md`. Demand, reservations, purchasing, receiving, and waste already exist. Imported inventory was not posted because some source units were absent or contradictory. Existing importer code can default unmatched units to each and round small order quantities; that is not a safe conversion contract.

## Acceptance Criteria

- [ ] PR04-01: Import separates ingredient stock from reusable equipment, disposables, in-house components, and instruction rows. Each opening quantity has an as-of time, location, unit, source, and explicit uncertainty state.
- [ ] PR04-02: Missing units, incompatible purchase/shelf units, conflicting snapshots, and unverified physical counts are resolvable per record. They never become zero on-hand, each, or a guessed conversion.
- [ ] PR04-03: Opening stock, receipts, transfers, adjustments, reservations, consumption, returns, and waste reconcile to current available stock using one calculation path. Replay creates no duplicate movement.
- [ ] PR04-04: Headcount/menu changes reconcile event demand into the existing weekly draft order. The same event change does not open a second order or discard manual draft adjustments; recipe use alone does not schedule unnecessary new production.
- [ ] PR04-05: Receiving a partial delivery updates location stock and remaining order balance once. Corrections retain the original receipt and adjust the difference with a traceable reason.
- [ ] PR04-06: Two operators cannot reserve the same final units without a visible shortage/conflict. Negative/insufficient stock is explained at the affected line with substitute, transfer, or purchase actions—not a global event freeze.
- [ ] PR04-07: Cancelling or reducing an event releases only its unconsumed reservations and unsubmitted demand. Submitted orders, consumed stock, and actual waste require their normal correction paths.
- [ ] PR04-08: Purchasing quantities retain fractional values where the source unit permits them; pack rounding is explicit and shows both need and ordered quantity. Draft import/recalculation never submits an order or contacts a vendor.
- [ ] PR04-09: An empty location/vendor catalog can be populated from the blocked workflow and return to the preserved form. Refresh shows consistent stock, shortage, order, and receiving totals.

## Dependencies and proof

PR03 provides dimensional quantities; PR02 provides catalog identities. Extend existing stock/receiving/reaction proofs for replay, concurrent reservation, partial receiving, and cancellation. No speculative new inventory subsystem.

## Out of Scope

No product capability is excluded. Equipment movement is PR10; historical financial stock valuation is coordinated with PR05/PR11.

## Open Questions

An owner-confirmed cutover stock timestamp or physical count is required before uncertain source quantities become authoritative opening stock. This choice does not block archive capture or reliable records.
