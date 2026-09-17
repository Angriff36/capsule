# Inventory

> Owns the CapsuleX operator experience for StorageLocation, InventoryItem, InventoryReservation, IngredientDemand, and WasteRecord. Purchasing is owned by [procurement.md](procurement.md).

## Purpose

Show what an event requires, what the organization has, what is reserved, what is short, where stock lives, and what was wasted—without maintaining a second definition of culinary demand.

## Owned domain

| Source                        | Entities                            |
| ----------------------------- | ----------------------------------- |
| `inventory/location.manifest` | StorageLocation                     |
| `inventory/stock.manifest`    | InventoryItem, InventoryReservation |
| `inventory/stock-count.manifest` | StockCountSession, StockCountLine |
| `inventory/demand.manifest`   | IngredientDemand, WasteRecord       |
| `inventory/transfer.manifest` | StockTransfer                        |

## Primary workspace

Use a **stock book and demand ledger**. The key row composition is ingredient + location with required, on-hand, reserved, available, par/reorder, and provenance. Detail views show the event/dish demand or stock movement history and legal actions; they do not become generic editable tables.

## Core workflows

- Register/maintain/activate/deactivate storage locations.
- Open stock, receive, adjust with reason, recount, transfer in/out, update levels, and remove.
- Start a count for one or more storage locations, freeze each stock line's expected quantity, record and revise physical counts, reconcile ledger variances through reasoned adjustments, and close the count sheet.
- Review the per-item quantity audit ledger with actor, timestamp, before/after values, reason, and an ordered SHA-256 chain checkpoint.
- Reserve, release, and consume stock for an Event.
- Calculate, confirm, recalculate, fulfill, or supersede ingredient demand.
- Record or void waste with quantity, unit, reason, cost, location, and optional Event.

## Cross-system handoffs

Culinary and Event facts create demand; confirmed demand creates procurement work. Line receipts update stock through an immutable supplier lot. Consuming a reservation decrements physical on-hand stock; releasing it only frees the hold.

Event cancellation and completion release active reservations in the originating command transaction. Previously released or consumed reservations remain unchanged, including their quantities, timestamps and reasons. Pending, deleted and foreign-tenant rows are excluded. Repeated cleanup makes no writes, and a required release failure rolls back the event change. This behavior is qualified on the current source branch; live-data repair and deployed verification remain outstanding.

## States and permissions

Inventory staff can perform routine movements; level/lifecycle and supersede/void actions may require management. Every adjustment needs visible provenance. Exact quantity/cost precision and full-text search remain degraded in the current projection.

Aggregate shortage across purchasing dates, reservation-aware stock allocation, rescheduling propagation and affected-data repair remain open in the source-backed workflow record.

## Current status

The authored `/inventory` workspace now ships these routes:

- `/inventory/demand` — review event-scoped IngredientDemand and the approval-to-purchasing handoff;
- `/inventory/stock` — register storage, open stock lines, receive or recount stock, and reserve/release/consume stock for events;
- `/inventory/counts` — select one or more storage locations, freeze every active stock line into a guided count sheet, record and revise physical counts, reconcile each line against the current ledger, post reasoned adjustment events only when required, and close the session after every frozen line is reconciled;
- `/inventory/audit` — select an InventoryItem and review its opening, receipt, adjustment, recount, reservation, issue, waste, and transfer evidence newest-first; each row shows actor, timestamp, quantity measure, before/after values, and its hash-chain link;
- `/inventory/purchasing` and `/inventory/orders/:id` — the Procurement-owned handoff described in [procurement.md](procurement.md).

Inventory and inventory-management roles are enforced by generated commands. Lifecycle actions are offered from generated transition metadata, and rejected policy, guard, constraint, or concurrency outcomes remain visible in the authored failure banner.

Inventory quantity events now capture the authenticated actor subject. The audit action delegates authorization to the generated InventoryItem read policy, reads the append-only Manifest event facts for one item, and normalizes physical on-hand changes separately from reservation quantity changes. The browser links those ordered facts with SHA-256; changing, deleting, inserting, or reordering history changes the displayed root checkpoint. Older events created before actor capture remain visible as legacy entries with no claimed actor.

Stock counts keep the frozen expected quantity separate from the live ledger. When staff reconcile a counted line, the command compares the physical count with the current InventoryItem balance inside the transaction. A match closes the line without ledger noise; a mismatch emits a StockCount variance fact whose reaction invokes the existing `InventoryItem.adjustQuantity` command with an actor and reason. The session cannot close until its original frozen line total exists and every line is reconciled.

Search and exact decimal precision remain degraded. The stock book shows on-hand and active reservation facts separately. Approved event demand maintains purchasing drafts; draft generation does not submit the order or mark a need ordered. Each partial line receipt creates a searchable supplier-lot fact with purchase-order-line provenance and updates stock in the same transaction. Current purchasing behavior and its unresolved date/allocation issues are documented in [procurement.md](procurement.md).

Proof: `tests/supply-slice-contract.test.ts`, `tests/supply-lifecycle-policy.test.ts`, `tests/supply-manifest-integration-guard.test.ts`, and `bun run check:supply-manifest`.

## References

- Canonical: `C:/projects/Manifest-source/src/inventory`
- Projection limits: [projection-status.md](../generation/projection-status.md)
- Read-only intent reference: Capsule-Pro Inventory and Warehouse areas
