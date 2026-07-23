# Vehicle Fleet Catalog Implementation Plan

## Goal

Implement an organization-scoped catalog for owned and leased delivery vehicles, including make, model, registration, capacity, and operational status, with a usable logistics UI and durable Manifest/Convex storage.

## Constraints

- Preserve all unrelated dirty and untracked work in this shared checkout.
- Edit authored UI and Manifest sources only; generated outputs change only through `bun run manifest:regen`.
- Do not add permanent tests. The requested Playwright verification spec must be temporary and removed afterward.
- Avoid unnecessary guards or approval steps; this is a routine operational catalog.
- Run `bun run check` before claiming completion.

## Phases

1. **Repository and pattern discovery** — complete
   - Pin status and current branch.
   - Find logistics routing/navigation, list/detail/create patterns, and existing asset/equipment models.
   - Identify the narrowest Manifest source boundary.
2. **Implementation design** — complete
   - Record the entity/command/query/UI approach and conflict-sensitive files.
3. **Implementation** — complete
   - Add authored Manifest source and regenerate through Builder.
   - Add the fleet catalog UI and wire navigation/routes using existing patterns.
4. **Verification** — complete
   - Run focused typecheck/build checks as appropriate.
   - Run `bun run check`.
   - Create, run, and remove the temporary Playwright verification spec.
5. **Review and handoff** — complete
   - Inspect the final diff for scope and generated ownership.
   - Archive the completed plan and provide the required summary format.

## Completion

- Authored implementation and generated ownership surfaces reviewed.
- Temporary Playwright test removed.
- Implementation record archived at `docs/task-plans/2026-07-22-vehicle-fleet-catalog.md`.
- Required full gate blocker is external to this feature and already tracked in GitHub issue #60.

## Errors Encountered

| Error | Attempt | Resolution |
| --- | --- | --- |
| Combined read batch exited 1 when an `rg` subquery found no matches | 1 | Split/guard optional searches so an expected empty result does not abort the batch |
| Second read batch exited nonzero because `playwright.config.ts` is absent from an explicit `rg` path list | 2 | Stop batching optional-path searches; inspect existence first and run deterministic reads separately |
| Targeted Prettier invocation could not infer a parser for `.manifest` files | 1 | TypeScript files were formatted successfully; format Markdown separately and leave Manifest in the repository's established syntax |
| `bun run check` stopped at `check:event-manifest` on seven unrelated event-feature integration violations | 1 | Preserve concurrent event work, document the exact baseline blocker, check for an existing GitHub issue, and continue focused fleet verification |
| First temporary Playwright run loaded two `@playwright/test` copies and rejected `test.beforeAll` before discovery | 1 | Import the existing local `playwright/test` entry point, set the test encryption key at module load, and rerun with the local Playwright binary |

## Implementation Decision

- Add `src/logistics/vehicle.manifest` with `VehicleOwnership` (`owned`, `leased`) and operational states (`available`, `in_use`, `maintenance`, `out_of_service`, `retired`).
- Store make, model, unique registration, payload capacity in kilograms, ownership, current status, status note, and timestamps.
- Expose generated `register`, `reviseDetails`, and `updateOperationalStatus` commands. All routine transitions remain available to logistics staff/managers; no new roles or approval steps.
- Add `VehicleFleetPage.tsx` with register/edit forms, fleet summary, search, and direct status updates through generated hooks.
- Wire `/logistics/fleet` into the shared logistics tabs and app router. Reuse existing supply layout classes; do not edit global CSS.
- Do not couple vehicles to `Delivery` yet; this task establishes the source catalog future scheduling/maintenance/driver assignment features can reference.
