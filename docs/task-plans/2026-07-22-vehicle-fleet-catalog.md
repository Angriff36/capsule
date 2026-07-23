# Vehicle Fleet Catalog — Implementation Record

## Outcome

Capsule now has an organization-scoped source catalog for owned and leased delivery vehicles at `/logistics/fleet`. Logistics staff and managers can register vehicles, correct make/model/registration/ownership/payload capacity, and update current operational status without an approval workflow.

## Domain

- Added `Vehicle` with tenant-scoped unique registration.
- Captures make, model, ownership, payload capacity in kilograms, operational status, optional status note, and timestamps.
- Operational states: available, in use, maintenance, out of service, and retired.
- Generated commands: `register`, `reviseDetails`, and `updateOperationalStatus`.
- Generated events: `VehicleRegistered`, `VehicleDetailsRevised`, and `VehicleOperationalStatusUpdated`.

## UI

- Added the Fleet tab to the logistics workspace.
- Added a responsive catalog ledger with active-capacity summary, registration form, edit form, empty state, status chips, and direct status selection.
- Added lazy route `/logistics/fleet` through the existing `SupplyRoute` boundary.

## Generated Surfaces

`bun run manifest:regen` completed without conflicts or assembly errors and refreshed Builder ownership, Convex schema/queries/mutations/HTTP/computed code, generated client hooks/contracts, seed assembly, diagrams, and generated contract coverage.

## Verification

- `bun run manifest:regen` — passed; no conflicts or assembly errors.
- `bun run typecheck` — passed.
- `bun run check:logistics-manifest` — passed.
- Temporary Playwright spec — passed (`1 passed`); exercised generated vehicle registration, tenant-scoped listing, status change, detail revision, and version increments in `convex-test`, then was deleted.
- `bun run build` — passed and emitted the `VehicleFleetPage` chunk.
- Targeted Prettier and whitespace checks — passed.
- `bun run check` — attempted; stopped at unrelated pre-existing event integration violations tracked in GitHub issue #60: <https://github.com/Angriff36/capsule/issues/60>.

## Scope Boundary

This feature establishes the fleet source records that scheduling, maintenance, and driver-assignment features can reference. It does not couple a vehicle to a delivery run or add a separate maintenance workflow.
