# Lot-to-event traceability findings

## Initial state

- Branch: `main`; starting HEAD: `35b8bc2`.
- The checkout contains extensive pre-existing authored, generated, and untracked changes from other feature work. All are treated as user/session-owned baseline changes.
- `npx` is available, satisfying the Playwright skill prerequisite. Repository package commands still use `bun`.
- The immediately preceding inventory-lot slice added immutable `InventoryLot` receipt facts and a supplier-lot receipt UI, with Builder-generated query/command surfaces already present in the dirty checkout.

## Open questions

- Where is the durable record of which lot fulfilled each consumed inventory reservation?
- Can existing generated queries express the needed lot/date-to-event/client join, or is an authored Convex read seam required?
- Which existing report page and navigation pattern should host the feature with the least user tedium?

## Data-model trace

- `InventoryLot` is an immutable receipt fact with indexed `supplierLotNumber`, `receivedAt`, `ingredientId`, and `locationId`, plus receipt quantity and procurement provenance.
- `InventoryReservation` is the durable event-consumption fact. A consumed row identifies the event, ingredient, inventory item, quantity, and `consumedAt`, but it currently has no lot identity.
- `EventStockIssueCoordinator` consumes an entire active reservation. The generated reaction then decrements aggregate `InventoryItem.quantityOnHand` by that reservation quantity.
- Because an aggregate inventory item may contain several receipts/lots, joining consumed reservations to lots only by ingredient/location or by timing would be ambiguous and cannot support an evidence-grade recall report.
- Accurate traceability therefore requires a durable lot reference on the reservation (or separate allocation facts). Since the issue flow consumes whole reservations, splitting reservations by lot at reserve time is the smallest design that can represent multi-lot fulfillment without guessing later.
- Existing legacy/manually opened stock may remain unallocated; the implementation must not falsely attribute it to a lot.

## Selected implementation

- The generated client already exposes every list needed for a frontend evidence join: `InventoryLot`, `InventoryReservation`, `Event`, `Client`, `Ingredient`, `Vendor`, and `StorageLocation`.
- No custom Convex query is required for the current app pattern; inventory/report pages already join generated tenant-scoped lists in authored React.
- `InventoryReservation.reserve` is the correct provenance seam. Adding an optional lot reference preserves legacy compatibility while allowing all lot-aware allocation paths to create deterministic facts.
- Lot availability is receipt quantity minus active or consumed reservations already linked to that lot. Released rows return availability. Allocation order is oldest `receivedAt` first and is additionally capped by the aggregate stock line availability.
- The report’s date range applies to `InventoryLot.receivedAt`, because the date range is an alternative way to identify affected supplier receipts. Once a lot matches, every later consumed event remains in the report regardless of issue date.
- Visual direction: restrained incident dossier inside the existing operations language—high signal, print-friendly, compact filters, summary counts, and an affected-event ledger. No extra approval or role gate is added.

## Generation

- `bun run manifest:regen` completed with no conflicts and a complete assembly report.
- Builder regenerated the reservation schema/query/mutations/HTTP/Zod/client bindings and the reserve sequence diagram through the ownership transaction.
- Builder also surfaced an unrelated pre-existing `MenuDish.updateSellingPrice` diagram addition from other dirty source work; it is not part of this feature and will not be claimed here.
- Convex deployment remains a separate follow-up from Builder and was not performed.

## Independent review

- The same-feature implementation process exited after source generation and a first temporary Playwright configuration failure; a second session resumed review without modifying the feature mid-write.
- The report joins only consumed reservations with explicit `inventoryLotId` provenance and aggregates them per lot/event, so it does not guess across receipts.
- Client and event labels use the live `Client.companyName/givenName/familyName` and `Event.title/startsAt` fields.
- The optional lot constraint is proportionate: it only rejects a supplied lot when its ingredient/location does not match the stock line, while legacy unattributed reservations remain allowed.
- Final copy review found one empty-state sentence still describing the abandoned consumption-date interpretation; it was corrected to match the verified lot receipt-date filter.
