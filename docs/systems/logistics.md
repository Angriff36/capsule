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

Pack items may reference Dish and ProductionBatch; PackList/Delivery belong to Event; Delivery may reference a Person driver. Pack and delivery terminal state contributes to Event readiness. Event cancellation should cancel active logistics work.

## States and permissions

Packing may be shared with kitchen roles only where canonical capability allows it. Cancellation/failure actions need reason and stronger authority. Notes and exact quantities need projection verification.

Vehicle, route optimization, returns, loss records, equipment entities, and shipment tracking are not current canonical capabilities.

## Current status

Generated queries and commands exist. No authored `/logistics` workspace exists. Manifest 3.6.12 output structurally uses the flat Event cancellation payload and governed Delivery/PackList fan-out runners. Authenticated runtime coverage must still prove the downstream cancellations, events, versions, tenant isolation, and rejection behavior before cancellation automation is called verified.

## References

- Canonical: `C:/projects/Manifest-source/src/logistics`
- Related owners: [events.md](events.md), [production-quality.md](production-quality.md)
- Read-only intent reference: Capsule-Pro Logistics and packing flows
