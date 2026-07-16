# Inventory

> Owns the CapsuleX operator experience for StorageLocation, InventoryItem, InventoryReservation, IngredientDemand, and WasteRecord. Purchasing is owned by [procurement.md](procurement.md).

## Purpose

Show what an event requires, what the organization has, what is reserved, what is short, where stock lives, and what was wasted—without maintaining a second definition of culinary demand.

## Owned domain

| Source                        | Entities                            |
| ----------------------------- | ----------------------------------- |
| `inventory/location.manifest` | StorageLocation                     |
| `inventory/stock.manifest`    | InventoryItem, InventoryReservation |
| `inventory/demand.manifest`   | IngredientDemand, WasteRecord       |

## Primary workspace

Use a **stock book and demand ledger**. The key row composition is ingredient + location with required, on-hand, reserved, available, par/reorder, and provenance. Detail views show the event/dish demand or stock movement history and legal actions; they do not become generic editable tables.

## Core workflows

- Register/maintain/activate/deactivate storage locations.
- Open stock, receive, adjust with reason, recount, transfer in/out, update levels, and remove.
- Reserve, release, and consume stock for an Event.
- Calculate, confirm, recalculate, fulfill, or supersede ingredient demand.
- Record or void waste with quantity, unit, reason, cost, location, and optional Event.

## Cross-system handoffs

Culinary and Event facts create demand; confirmed demand creates procurement work; receiving should update stock; prep consumes demand; cancellation releases reservations; waste should affect stock. Only declared and verified reactions may be shown as automatic.

## States and permissions

Inventory staff can perform routine movements; level/lifecycle and supersede/void actions may require management. Every adjustment needs visible provenance. Exact quantity/cost precision and full-text search remain degraded in the current projection.

Open decisions include storage-location vocabulary, reserve/consume stock effects, aggregate shortage, waste stock decrement, and alternate-key reaction resolution.

## Current status

The authored `/inventory` workspace now ships these routes:

- `/inventory/demand` — calculate, confirm, fulfill, or supersede event-scoped IngredientDemand and explicitly create a PurchaseNeed from confirmed demand;
- `/inventory/stock` — register storage, open stock lines, receive or recount stock, and reserve/release/consume stock for events;
- `/inventory/purchasing` and `/inventory/orders/:id` — the Procurement-owned handoff described in [procurement.md](procurement.md).

Inventory and inventory-management roles are enforced by generated commands. Lifecycle actions are offered from generated transition metadata, and rejected policy, guard, constraint, or concurrency outcomes remain visible in the authored failure banner.

Search and exact decimal precision remain degraded. The stock book shows on-hand and active reservation facts separately and does not invent an aggregate shortage rule. Demand→purchase and receipt→stock automation are not claimed; operators use explicit generated commands until focused reaction tests prove those paths.

Proof: `tests/supply-slice-contract.test.ts`, `tests/supply-lifecycle-policy.test.ts`, `tests/supply-manifest-integration-guard.test.ts`, and `bun run check:supply-manifest`.

## References

- Canonical: `C:/projects/Manifest-source/src/inventory`
- Projection limits: [projection-status.md](../generation/projection-status.md)
- Read-only intent reference: Capsule-Pro Inventory and Warehouse areas
