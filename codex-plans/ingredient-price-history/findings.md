# Findings & Decisions: Ingredient purchase price history

## Requirements

- Every vendor-order-line receipt must record its confirmed unit price.
- Price observations must be retained as a time series per ingredient and vendor.
- The recipe cost calculator must use the newest confirmed observation.
- Operators need price-trend visibility.
- Core behavior must be browser-verified with a temporary Playwright test that is deleted afterward.

## Initial Findings

- The checkout is `main` at `b080022` and already contains a very large authored/generated delta; every pre-existing change is user-owned.
- Existing root planning files belong to payroll export; related tasks use isolated feature directories, so this task is namespaced likewise.
- The completed recipe-cost feature currently reads mutable `Ingredient.costPerUnit`; its findings say Vendor has no price/quote row.
- Existing procurement documentation identifies `VendorOrderLine.recordReceipt` as the generated governed receipt command and says the UI must let that command decide its quantity-dependent state transition.
- `src/procurement/order.manifest` is the authored owner of `VendorOrder`, `VendorOrderLine`, and `recordReceipt`; it is included directly from `src/app.manifest`.
- `recordReceipt` currently accepts only quantity/location/discrepancy fields, then emits the draft/order-line `unitCost`; it cannot capture a changed invoice price at receipt time.
- `VendorOrderLine` belongs to `VendorOrder`, so the receipt event can carry `self.vendorOrder.vendorId` without inventing a second UI lookup.
- Inventory stock already carries `unitCost` and its separate `receiveStock` command can update that value, but the vendor-order receipt flow does not yet establish a durable vendor/ingredient observation.
- The recipe-cost calculator is a pure authored module that accepts ingredient-like inputs containing `unit` and `costPerUnit`; the integration can preserve that calculation contract while changing which price the page supplies.
- The ingredient detail page is the natural trend surface: it already loads the ingredient and vendors, shows current catalog cost, and owns preferred-vendor presentation.
- The existing receipt manifest header contains stale invented-deferral language about a Receipt aggregate. This feature supplies the missing durable receipt-price facts, so that comment must be rewritten rather than perpetuated.
- `npx` is installed, satisfying the Playwright skill prerequisite; repository execution will still follow the Bun command convention.
- Memory search produced no direct task-specific prior entry, so implementation decisions will come from the live checkout.

## Decisions

| Decision | Rationale |
| --- | --- |
| Isolate planning under `codex-plans/ingredient-price-history/` | The root plan belongs to another concurrent feature |
| Treat current recipe-cost and preferred-vendor files as upstream user work | They predate this task and directly affect the required integration |
| Require `unitPrice` on `recordReceipt` and update the line's latest `unitCost` | The confirmed receipt price may differ from the draft estimate and every receipt must carry a price |
| Create `IngredientPriceObservation` from `VendorOrderLineReceived` | Keeps each price fact governed, immutable in normal UI use, and tied to vendor/order/line provenance |
| Match observations by line plus cumulative received quantity | Partial receipts monotonically increase cumulative quantity, giving reaction retry idempotency without a missing event-id primitive |
| Feed recipe costing by selecting the newest observation per ingredient | Avoids cross-role mutation of Ingredient while satisfying newest confirmed-price semantics |
| Fall back to `Ingredient.costPerUnit` only when no receipt observation exists | Preserves useful catalog pricing for ingredients never purchased through the receipt workflow |
| Put a compact procurement-ledger trend panel on Ingredient detail | Keeps price history visible in ingredient context without adding a disconnected new route |

## Implementation Findings

- Builder accepted `IngredientPriceObservation` and the `VendorOrderLineReceived` reaction without conflicts.
- Regeneration added the expected generated sequence companion and updated only the declared generated ownership surfaces.
- The Builder follow-up is deployment of changed Convex source; deployment is outside this implementation request.
- Generated reaction inspection showed that `match ... else create` reruns the target command when a row already matches. The observation command therefore permits only an exact same-payload replay and preserves its original `observedAt`; all attempts to rewrite a historical fact remain rejected.

## Browser Verification

- The real `IngredientPriceTrendPanel` showed the newest all-vendor receipt at `$3.25 / kilogram`.
- Filtering to Millstone Foods showed its newest `$3.00` price and `+$0.50 · +20.0%` change.
- Adding a newer `$2.80` Harbor Wholesale receipt immediately changed the recipe source and newest trend value to `$2.80 / kilogram`.
- The one-test Chromium run passed in 2.3 seconds; all temporary browser files were then deleted.

## Repository Gate Blocker

- `bun run check` stops at `check:event-manifest` on direct Convex hooks in `EventAllergenBriefingPage.tsx` and `EventIncidentPanel.tsx`.
- Those files are unrelated pre-existing untracked work and were not changed by this feature.
- The blocker is already durably tracked as open GitHub issue [#40](https://github.com/Angriff36/capsule/issues/40), with the same files, guard output, and suggested owner.
- The full suite initially found one feature-owned catalog mismatch: `IngredientPriceObservation_createViaRecord` was generated but absent from the existing governed-creation inventory. The assertion was updated with that one entry; no new test was added or broadened.

## Errors Encountered

- A discovery search passed `src/**/*.manifest` literally to `rg` on PowerShell. Subsequent searches use directory roots or concrete files.
- A regex search for policy combinations was malformed by nested quoting; the design avoids needing a cross-role Ingredient command.
