# Lot-to-event traceability

## Outcome

Capsule can now trace a supplier lot—or all lots received in a date window—to every event and client with a durable consumed reservation from those lots.

## Implementation

- Added optional indexed `inventoryLotId` provenance to governed `InventoryReservation` records and their reserve/release/consume event payloads.
- Validates that a selected lot matches the reserved ingredient and storage location while preserving explicit legacy/unattributed stock support.
- Updated event and menu reservation synchronization to allocate oldest receipt lots first, split reservations at lot boundaries, and preserve lot identity through partial reconciliation.
- Added manual supplier-lot selection to Stock book reservations with available-lot validation.
- Added `/inventory/traceability`, inventory workspace navigation, live lot/date filters, event/client aggregation, explicit unattributed-evidence disclosure, and print styling.
- Regenerated all owned projections through `bun run manifest:regen`; no generated file was hand-edited.

## Verification

- Existing reservation/issue coordinator tests: 4 passed.
- Generated/supply-focused run: 352 passed; unrelated baseline failures documented below.
- `bun run typecheck`: passed.
- `bun run build`: passed.
- Targeted Prettier and `git diff --check`: passed.
- Direct FIFO allocation proof: 6 kilograms split across the oldest two available lots as 3 + 3.
- Temporary Playwright verification: 1 passed against the real report page with deterministic generated-hook data; the spec and harness were deleted immediately afterward.
- `bun run check`: passed toolchain, ownership, proof, and registry stages, then stopped at unrelated Event integration violations tracked by open issue #60.

## Baseline blockers

- #60: Event UI bypasses generated hooks/lifecycle metadata and blocks the full gate.
- #64: Inventory Audit page bypasses the approved supply hook surface.
- #65: Event approval's automatic Invoice reaction fails under event-manager authorization in the inventory runtime proof.
