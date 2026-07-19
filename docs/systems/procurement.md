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
- Add lines, record receipts, and cancel lines.

## Cross-system handoffs

Canonical intent is Event approval → demand confirmation → PurchaseNeed creation → a buyer links needs to a VendorOrder draft → VendorOrder submission marks linked needs ordered. Receipt-to-stock remains an open product/projection decision. Event cancellation stops open purchase work.

## States and permissions

Procurement work is role-gated; vendor lifecycle and order cancellation require stronger authority. Exact money/quantity precision and encrypted vendor contact persistence require verification. The UI must keep demand provenance visible so an order is never an orphaned finance record.

## Current status

The authored Procurement subworkspace now ships at `/inventory/purchasing` and `/inventory/orders/:id`. Operators can onboard Vendors, open VendorOrders, add demand-backed lines, revise totals, submit/confirm/cancel orders, record partial or complete line receipts, and apply explicit PurchaseNeed ordering/fulfillment commands.

Procurement and management roles remain generated policy. Order and PurchaseNeed actions are offered from generated lifecycle metadata. Receipt entry is always submitted to the generated command because its next line state depends on cumulative quantity rather than a static authored transition table.

The UI preserves IngredientDemand and Event provenance and distinguishes explicit operator commands from unverified reactions. A generated range draft preserves every contributing PurchaseNeed beneath its combined order line; it remains editable and the needs remain open until submission. It does not claim automatic PurchaseNeed creation, cancellation fan-out, or receipt-to-stock updates. Money and quantity values retain the current projected-number limitation.

Proof: `tests/supply-slice-contract.test.ts`, `tests/supply-lifecycle-policy.test.ts`, `tests/supply-manifest-integration-guard.test.ts`, and `bun run check:supply-manifest`.

## References

- Canonical: `C:/projects/Manifest-source/src/procurement`
- Related owner: [inventory.md](inventory.md)
- Read-only intent reference: Capsule-Pro Procurement and purchase-order flows
