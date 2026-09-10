# Procurement

> Owns the CapsuleX operator experience for Vendor, VendorOrder, VendorOrderLine, and PurchaseNeed.

## Purpose

Turn governed event demand into traceable purchasing work, preserve why every line was ordered, and carry receipt progress back toward inventory readiness.

## Owned domain

| Source                               | Entities                     |
| ------------------------------------ | ---------------------------- |
| `procurement/vendor.manifest`        | Vendor                       |
| `procurement/order.manifest`         | VendorOrder, VendorOrderLine |
| `procurement/purchase-need.manifest` | PurchaseNeed                 |

## Primary workspace

Use a **purchase queue** beside an **order folio**:

- queue open needs by event, ingredient, required quantity, and demand provenance;
- compose VendorOrders without losing links to PurchaseNeed/IngredientDemand;
- show submitted, confirmed, partial, received, and cancelled progress at order and line level;
- keep supplier identity and sensitive contact facts in a compact Vendor dossier.

## Core workflows

- Onboard, revise, suspend, reinstate, or terminate Vendors.
- Create/cancel/fulfill PurchaseNeeds and link them to order/line records.
- Generate a draft VendorOrder from open prep-list PurchaseNeeds for the last seven days, upcoming seven days, or a custom inclusive Event date range; identical ingredient/unit quantities combine on one line.
- Open, total, submit, confirm, partially receive, receive, or cancel VendorOrders.
- Add lines, record receipts with required supplier lot numbers, and cancel lines.
- Edit a draft line's quantity and price. Event requirement changes retain the buyer's chosen quantity; the order shows the current calculation and offers an explicit return to automatic quantities.

## Cross-system handoffs

Demand confirmation creates PurchaseNeeds and can assemble a weekly draft. A buyer can also compose a range draft. VendorOrder submission marks its linked open needs ordered. Each line receipt creates an immutable supplier lot and records that delivery in stock; operators should not enter the same delivery again in the Stock book. Marking the order received is a lifecycle action, not an additional stock receipt.

Event cancellation stops open or ordered needs while preserving fulfilled needs and submitted/received order history. For editable drafts, cancellation retires the event's demand links, reduces the existing calculated requirement, and releases cancelled needs from active draft pointers. Retired links and command events retain the prior association. Buyer quantities and prices remain intact. An automatic line with no remaining requirement and zero quantity is retired, and an empty automatic draft is cancelled.

## States and permissions

Procurement work is role-gated; vendor lifecycle and order cancellation require stronger authority. Exact money/quantity precision and encrypted vendor contact persistence require verification. The UI must keep demand provenance visible so an order is never an orphaned finance record.

## Current status

The authored Procurement subworkspace now ships at `/inventory/purchasing` and `/inventory/orders/:id`. Operators can onboard Vendors, open VendorOrders, add demand-backed lines, revise totals, submit/confirm/cancel orders, record partial or complete line receipts, and apply explicit PurchaseNeed ordering/fulfillment commands.

Procurement and management roles remain generated policy. Order and PurchaseNeed actions are offered from generated lifecycle metadata. Receipt entry is always submitted to the generated command because its next line state depends on cumulative quantity rather than a static authored transition table. Every partial receipt requires a supplier lot number and creates an immutable `InventoryLot` linked to its VendorOrderLine, VendorOrder, vendor, ingredient, location, and available demand/Event provenance.

The UI preserves IngredientDemand and Event provenance and shows recorded lots under their purchase-order line. A generated range draft preserves every contributing PurchaseNeed beneath its combined order line; it remains editable and the needs remain open until submission. Older drafts use their recorded quantity history to distinguish automatic calculations from buyer edits. When that history or a required unit conversion cannot be verified, the existing order quantity remains and the UI shows a review note without blocking ordinary purchasing. Money and quantity values retain the current projected-number limitation.

These behaviors describe the current source branch. Isolated generated-runtime qualification covers shared draft cancellation, buyer quantity preservation, return to automatic calculation, receipt history, and repeated reconciliation. Weekly date normalization, cross-week stock allocation, rescheduling propagation, live-data repair, and authenticated production proof remain open; see [the source-backed workflow record](../../codex-plans/source-backed-operations/progress.md).

Proof: `tests/supply-slice-contract.test.ts`, `tests/supply-lifecycle-policy.test.ts`, `tests/supply-manifest-integration-guard.test.ts`, and `bun run check:supply-manifest`.

## References

- Canonical: `C:/projects/Manifest-source/src/procurement`
- Related owner: [inventory.md](inventory.md)
- Read-only intent reference: Capsule-Pro Procurement and purchase-order flows
