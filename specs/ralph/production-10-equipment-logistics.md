# PR10 — Account for everything sent to an event

_Serves JTBD(s):_ Josh — deliver a complete service; Kayden — know what to pack, move, and return.

## Job Statement

Trace required food and equipment from availability through packing, delivery, and return without losing shortages or physical assets.

## Baseline and ownership

Draft requirements; shared contract: [production readiness](../../docs/product/production-readiness.md). Extend existing equipment, pack-list, logistics, delivery, incident, inventory, and venue workflows. Issues #142–#144 describe earlier command/empty-state failures and may already have fixes; retain their regression proof. New physical-asset concepts must have authored domain ownership, not UI-only state.

## Acceptance Criteria

- [ ] PR10-01: An event's requirements distinguish consumable food, reusable equipment, rentals, and service supplies. Each line records its source, required quantity/unit, availability, and responsible location or vendor; equipment is not consumed as an ingredient.
- [ ] PR10-02: Applying a venue/service template is previewable and retry-safe. Later edits preserve event overrides and expose changed requirements; an interrupted application resumes without duplicating pack lines.
- [ ] PR10-03: Concurrent events cannot silently reserve the same unavailable equipment. Operators can see the conflicting dates, quantities, location, and condition, then resolve with another asset, transfer, or rental.
- [ ] PR10-04: Packing supports actual quantities, partial completion, substitutions, missing items, and responsible actors on a phone. A legal early-pack operation is not blocked merely because the event has not started.
- [ ] PR10-05: Loading and dispatch record the actual load, destination, responsible person, and time. Delivery acknowledgment and incidents remain attached to the event; a second submission cannot create a second movement or delivery.
- [ ] PR10-06: Returns reconcile expected and received reusable assets with location, condition, loss, damage, and outstanding quantity. Cleaning or maintenance removes unavailable equipment from future availability until restored; it does not delete the historical return.
- [ ] PR10-07: Cancellation releases only eligible reservations and unperformed work. Dispatched stock, vendor commitments, and missing returns remain explicit obligations rather than disappearing with the event.
- [ ] PR10-08: Missing locations, vendors, equipment, and template choices provide an authorized creation path that preserves the in-progress form. Permission denial offers an actionable explanation; no enabled control silently does nothing.
- [ ] PR10-09: Refresh, concurrent edits, and intermittent connectivity preserve confirmed quantities and expose unsent/conflicting changes. A load or return is marked complete only after server acknowledgment.

## Dependencies and proof

PR04 owns consumable stock movements; PR06 owns event lifecycle; PR12/PR13 own access and recovery. Prove overlapping events sharing equipment, one partial load, one rental, one damaged return, and cancellation after dispatch through the actual operator routes.

## Out of Scope

Food purchasing and recipe scaling belong to PR04/PR03. This boundary does not permit an untracked food-to-delivery handoff.

## Open Questions

Confirm whether reusable items require individual asset IDs, quantity pools, or both from the actual source inventory. Vehicle/rental fields must follow observed business needs; do not fabricate source records to fill a template.
