# Events

First shipping domain slice: list, detail, and stage-oriented mutations wired through generated Convex APIs.

## UI

| Piece              | Path                                                            |
| ------------------ | --------------------------------------------------------------- |
| List               | `src/features/events/EventsListPage.tsx`                        |
| Detail             | `src/features/events/EventDetailPage.tsx`                       |
| Create placeholder | `src/features/events/EventCreatePlaceholder.tsx`                |
| Stage helpers      | `src/features/events/eventStatus.ts`, `EventLifecyclePolicy.ts` |

Routes hang off the Operate group in `src/app/nav.ts` (`/events`).

## Data

- Schema / queries / mutations: Manifest-generated Convex surfaces (do not hand-edit).
- UI reads/writes via `src/lib/api.ts` only.
- Field encryption and auth guards live in generated surfaces + `convex/lib/**` seams.

## Tests

- Lifecycle / policy: `tests/event-lifecycle-policy.test.ts`
- Auth + encryption seam proofs: `tests/event-seam-contract.test.ts` and `tests/event-seam/**`

Create flow is intentionally placeholder until the next proven vertical slice.
