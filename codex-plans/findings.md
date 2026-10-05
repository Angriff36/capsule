# Findings

- Existing event approval and closeout UI callers are in `src/features/events/EventDetailPage.tsx` and `EventTrackerPage.tsx`.
- The demand command is exposed through `src/lib/culinaryDemandClient.ts`; its user-facing caller is expected in inventory/event screens and still needs confirmation.
- The existing backend demand seam is `convex/culinaryDemand.ts`, with reconciliation logic in `convex/lib/culinaryModel/demand.ts`.
- The feature brief's panel should be built within the existing design vocabulary and only enumerate effects proven in the real command implementation.
- Demand supersession already opens `DemandChangePreviewDialog`, backed by the existing `previewDemandChange` query and fingerprint-protected apply mutation. It truthfully reports affected purchase needs before confirmation; avoid duplicating or weakening it.
- `Event.approve` cascades to purchase needs, production batches, a pack list, a draft invoice (only under existing commercial conditions), staff needs, and venue attribution. `Event.closeOut` only ensures/captures a draft event closeout.
- Event approval and closeout are dispatched centrally by `runAction` in `EventDetailPage`; the tracker has a separate approval shortcut.
