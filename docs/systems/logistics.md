# Logistics

> Owns the CapsuleX operator experience for PackList, PackListItem, and Delivery.

## Purpose

Create one traceable packing and delivery flow from produced/event requirements through missing, packed, loaded, dispatched, delivered, failed, or cancelled state.

## Owned domain

| Source                         | Entities                                               |
| ------------------------------ | ------------------------------------------------------ |
| `logistics/pack-list.manifest` | PackList, PackListItem                                 |
| `logistics/delivery.manifest`  | Delivery                                               |
| `logistics/packing.manifest`   | Import/reaction composition only; no additional entity |

## Primary workspace

Use a **dispatch manifest**:

- PackList detail is a ruled load sheet grouped by real category or service sequence, with quantity and missing/packed status;
- the event logistics view shows packing → loaded → dispatch → delivery as a single trace, not separate dashboard cards;
- Delivery detail emphasizes window, destination context available through Event/Venue, driver Person, status, failure reason, and confirmation.

## Core workflows

- Open a PackList, add/adjust items, mark packed/missing, start packing, complete packing, mark loaded, dispatch, or cancel.
- Schedule Delivery, start transit, confirm delivery, mark failed, or cancel.
- Resolve missing items in their owning system; do not silently manufacture stock or production completion from the logistics UI.

## Cross-system handoffs

Pack items may reference Dish and ProductionBatch; PackList/Delivery belong to Event; Delivery may reference a Person driver. Pack and delivery terminal state contributes to Event readiness. The event cancellation callback stops unfinished pack lists and scheduled/in-transit deliveries through source-owned commands that require the parent event to be cancelled. The parent's authorization is sufficient; the separate human logistics cancel commands retain their existing permissions.

Dispatched pack lists and delivered, failed or previously cancelled deliveries remain unchanged. Packed quantities, loading/departure times, driver/vehicle assignments and historical records remain recorded. The callback skips deleted and foreign-tenant rows, is repeatable without writes, and runs in the parent transaction.

## States and permissions

Packing may be shared with kitchen roles only where canonical capability allows it. Cancellation/failure actions need reason and stronger authority. Notes and exact quantities need projection verification.

Vehicle, route optimization, returns, loss records, equipment entities, and shipment tracking are not current canonical capabilities.

## Current status

The authored workspace has routes `/logistics/packs`, `/logistics/packs/:id`, and `/logistics/deliveries`, using generated commands and lifecycle metadata. Existing runtime proof: `tests/proofs/pack-list-delivery-lifecycle.runtime.test.ts`. Current source-branch cancellation qualification covers admin/event_manager, active and terminal packing/delivery states, deleted/foreign records, repeated cleanup, and combined purchasing/stock/billing records. These isolated runtime checks do not prove live-data repair, authenticated deployment, rescheduling, or the full operational workflow; see [the source-backed progress record](../../codex-plans/source-backed-operations/progress.md).

## References

- Canonical: `C:/projects/Manifest-source/src/logistics`
- Related owners: [events.md](events.md), [production-quality.md](production-quality.md)
- Read-only intent reference: Capsule-Pro Logistics and packing flows
