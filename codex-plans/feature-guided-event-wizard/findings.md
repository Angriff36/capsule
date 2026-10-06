# Findings

- Initial repository state is clean.
- Current event creation appears centered on `src/features/events/EventCreatePage.tsx`; detailed command shapes still need inspection.
- `Event.planEngagement` requires client, title, type, start/end, headcount, primary contact, budget, and quoted price. Venue is optional in the generated contract but the current product flow requires it; the wizard preserves that product requirement.
- `EventDish.addToEvent` accepts event, dish, servings, and an idempotency key through its generated hook. `EventAssignment.assign` accepts event, person, role, optional times/notes, and an idempotency key.
- `setWorkingEvent` is the existing per-tab working-event setter. Existing creation currently navigates but does not explicitly set it.
- Existing UI vocabulary includes `card`, `field-label`, `field-input`, `btn`, `btn-primary`, `btn-secondary`, `btn-ghost`, `text-link`, and semantic text classes.
## Grounded results

- `src/lib/manifest-convex-react.ts:3372-3379`, `3504-3511`, and the EventDish equivalent each return their `useMutation(...)` promise directly. Rejections are not swallowed, so the existing generated hooks are safe to use from the facilities commit seam.
- `src/features/events/EventMenuTab.tsx:771-777` sends `eventId`, `dishId`, `quantityServings`, `dishName`, and `headcountOverride`; the wizard matches that payload. Event assignment creation uses `eventId`, `personId`, and `role` (see `tests/proofs/cancellation-reconciliation.runtime.helpers.ts:136-145`).
- `convex/mutations.ts:68-91` returns a cached idempotency result before command execution and writes the record only after command completion. A throwing mutation therefore rolls back both its row and its idempotency record; a repeated key with different arguments returns the cached original result.
- The guided early return follows all hook calls in `src/features/events/EventCreatePage.tsx:181-194` and begins at 602, preserving React hook order.
- `formatMoney` receives whole currency units (`src/lib/format.ts:32-55`), matching the mapper/long-form number fields; review display has no cents multiplier.
- Temporary convex-test proof passed 2026-10-05: real generated Event, EventDish, and EventAssignment commands returned the same ids for repeated keys; an invalid dish command wrote no row; a new key with valid arguments succeeded. The temporary proof was deleted after the run.
