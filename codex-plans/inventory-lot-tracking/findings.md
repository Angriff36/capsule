# Inventory lot tracking findings

## Initial state

- Branch: `main`.
- The worktree contains extensive pre-existing authored, generated, and untracked changes. Treat every existing change as user-owned until proven otherwise.
- `npx` is available, satisfying the Playwright skill prerequisite, but repository commands must still use the project-standard `bun` entrypoints.

## Discoveries

- `VendorOrderLine.recordReceipt` is the governed receipt seam. It already records quantity, location, unit price, discrepancy data, purchase-order-line identity, ingredient, vendor, event, and demand provenance in `VendorOrderLineReceived`.
- The UI entry point is `src/features/inventory/VendorOrderPage.tsx`; it submits the generated `useVendorOrderLineRecordReceipt` hook.
- There is no supplier lot number in the current command, event payload, schema, generated bindings, or form.
- Receipt-to-stock automation remains explicitly unverified/open. This feature should add receipt traceability without claiming or inventing automatic stock creation.
- The exact source and UI files are already modified in the baseline, so their diffs must be inspected before any patch and concurrent edits must be ruled out.
- The existing `IngredientPriceObservation` is an immutable per-partial-receipt fact keyed in practice by line plus cumulative received quantity. A dedicated receipt fact may be required because adding lot data only to the mutable line would lose earlier partial-receipt lots.
- `InventoryItem` is a single aggregate per ingredient/location. Its `receiveStock` command has no purchase-order-line or lot provenance, and expiry dates currently live on that aggregate, so the present stock model cannot distinguish multiple lots at one location.
- A supplier lot number is a legitimate required receipt field: omitting it defeats the traceability feature. No extra role/lifecycle gate is needed beyond the existing receipt command policies and status guards.
- Existing user work has already added confirmed receipt unit pricing and an immutable `IngredientPriceObservation` reaction to `order.manifest`; the lot implementation must preserve and compose with that in-progress change.
- The generated client convention is singular (`useListIngredientPriceObservation`), so regeneration should produce `useListInventoryLot` for the UI.
- Manifest supports idempotent `match ... else create` reactions, optional UUID command parameters, indexed strings, and required nonblank constraints via `length(trim(...))`.
- Selected model: an immutable `InventoryLot` per partial receipt, uniquely identified by `(tenantId, vendorOrderLineId, cumulativeReceivedQuantity)`. Repeated supplier lot numbers across separate receipts remain searchable records rather than overwriting history.
- Builder accepted the source model and generated `useListInventoryLot`, `InventoryLot.record`, schema indexes, HTTP/command contracts, contract tests, and the event reaction without conflicts.
- Direct inspection of generated `__runVendorOrderLineRecordReceipt` confirmed the command rejects blank lot numbers before mutation, emits the lot in `VendorOrderLineReceived`, matches lots by PO line plus cumulative quantity, and inserts/records the complete immutable lot in the same transaction.
- The local Vite app is already running at the documented `http://localhost:7811`, and Playwright 1.61.1 is available through `bunx`.
- Existing browser snapshots all stop at `Checking your session…` while contacting Clerk. The temporary Playwright verification must therefore use a focused browser fixture or a safe app-auth test seam if one exists; it must not fake a production success through the blocked shell.
