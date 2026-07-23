# Findings: Live Event Profitability

## Checkout Baseline

- Branch: `main`
- Starting HEAD: `35b8bc2`
- The checkout contains extensive pre-existing modified and untracked work across generated, authored, event, finance, and planning areas.
- `src/features/events/EventDetailPage.tsx` and `src/features/finance/CloseoutPage.tsx` are already modified.
- An untracked completed neighboring implementation exists at `src/features/finance/EventCostSummaryReport.tsx` with its helper and CSS.

## Repository Rules

- Generated and Builder-owned paths must not be hand-edited.
- No permanent tests may be added unless the owner asks.
- Verification must include the existing `bun run check` gate.
- This task explicitly requires a temporary Playwright test that is deleted afterward.

## Discovery Notes

- `EventDetailPage` is the correct per-event surface and already composes authored event panels below its setup/revision content.
- The page is currently modified by another session, so its exact baseline must be rechecked immediately before and after the integration patch.
- `useListInvoice`, `useListIngredientDemand`, `useListTimeRecord`, `useListEquipmentReservation`, and `useListEquipment` are existing reactive generated hooks; using them in authored UI will update as Convex records change.
- The existing Event Cost Summary uses a governed EventCloseout snapshot and excludes deleted, voided, and written-off invoices. It is a completed-event folio, not a live committed-cost view.
- Invoice totals and lifecycle state are modeled directly; `issuedAt` is the domain marker that invoice values have been issued/confirmed.
- Equipment reservations are event-linked and have reservation lifecycle status/quantity. Equipment catalog rows have ownership and purchase value, but the exact safe cost interpretation still needs to be settled.
- IngredientDemand has quantity and commitment lifecycle (`pending`, `calculated`, `confirmed`, `fulfilled`, `superseded`) but no monetary field.
- TimeRecord has event-linked clock times and computed worked minutes but deliberately has no pay-rate fields.
- Shift and EventAssignment also have event/time windows but no rate.
- Person has no pay rate. The only modeled `hourlyRate` is private on PayrollInput, so labor cost must be sourced from authorized payroll inputs rather than invented from staff records.
- PayrollInput is event-linkable and carries regular/overtime minutes, rates, and gross amount. `prepared` and `finalized` are the reviewed cost states; `draft` and `voided` should not count as committed labor.
- Ingredient purchase valuation is modeled on VendorOrderLine (`orderedQuantity × unitCost`). VendorOrderLineDemand links a line to a specific IngredientDemand with `contributionQuantity`, allowing event allocation without double-counting a shared weekly order line.
- InventoryItem also has unit cost, but multiplying current stock cost by demand would be an estimate, not a committed purchase. Order-line contribution value better matches the requested “costs are committed” behavior.
- VendorOrder moves from `draft` to `submitted`, then `confirmed`/receiving/received. Submitted and later non-cancelled orders are the clean commitment boundary; draft orders remain excluded.
- The feature record contains no hidden acceptance criteria beyond the supplied description.
- Equipment `purchaseValue` is presented in the UI as asset value, not a rental/event charge. Charging owned asset value to each event would be false accounting. The widget should only value rented reservations from the currently available catalog value and explicitly identify that basis; owned reservations remain operational commitments but not event expense.
- Existing event-cost-report styling uses an industrial paper-ledger visual. The live widget should stay consistent but read as an operational “live signal” rather than a printable folio.
- The pre-implementation SHA-256 for `EventDetailPage.tsx` is `178F27ECA98B5D04C4B93B59FBA38B8DDF8BD4475426B17879BECDE79EE5F6B2`; recheck before applying the integration patch.
- The repository TypeScript config is `tsconfig.json`; Vite config is `vite.config.ts`; no Playwright config currently exists.
- The widget is integrated immediately after `EventSetupProgress`, making margin visible near the top of every event before operational detail panels.
- New UI styles are fully namespaced under `.live-profitability`, responsive at 760/440 px, and disable animation for reduced-motion users.
- Generated PayrollInput list queries intentionally redact hourly/overtime rates and gross amount; current prepared inputs therefore appear as unpriced labor hours unless another authorized path provides rate values. The widget explicitly warns rather than treating those hours as zero-cost final margin.
- Generated list policies return empty arrays rather than throwing when a role lacks access. The widget is most complete for admin/owner/system roles that can read all input ledgers; its footer and incomplete-pricing notice keep the result framed as a live priced view rather than final closeout.
- The final Event Detail hash remains `31DDA81B549F433F7B2B19EE691A7A616FDBBA85A0FE8B2C8EB3D1798FD7078F`, matching the post-integration review hash; no later overlapping edit was detected.
- The applied planning-log patch initially failed twice because the target context and file header were mismatched; re-reading the files and applying exact per-file sections resolved it without touching implementation files.

## Errors

- A PowerShell `rg` call used Windows wildcard path arguments for Manifest files and exited 1. Subsequent searches must target directory roots with `--glob '*.manifest'`.
- Two planning-log `apply_patch` attempts failed verification due to stale/misgrouped patch context. The files were re-read and updated with explicit file sections.
- The expected `tsconfig.app.json` path was absent during a combined style/config read. Discover the actual TypeScript config via `rg --files -g 'tsconfig*.json'` before static verification.

## Continuation Review (10:00 PDT)

- The exact feature-specific plan and three implementation files were already present when this turn began; they are being treated as preserved in-progress work rather than recreated.
- The implementation currently adds one authored aggregation helper, one reactive event widget, one scoped stylesheet, and one narrow `EventDetailPage` insertion.
- Initial source review found the widget wired to existing generated list hooks without editing generated files. File hashes will be rechecked before any implementation edit to detect concurrent rewrites.
- Source validation confirms issued invoice timestamps, submitted-or-later order states, event-linked PayrollInput amounts/rates, and event-linked equipment reservations exist in the current models.
- `Equipment.purchaseValue` is explicitly an asset purchase value; there is no dedicated reservation rental fee in the current model. The widget's rental amount is therefore a disclosed proxy, not a true event rental charge.
- A potential access issue needs resolution before verification: PayrollInput pay fields are private/encrypted and its generated list query may require finance access, while the feature is intended for event coordinators. The generated hook/query policy must be inspected before accepting the current client-side aggregation.
