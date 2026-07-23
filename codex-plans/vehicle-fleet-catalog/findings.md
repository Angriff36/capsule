# Vehicle Fleet Catalog Findings

## Checkout State

- The checkout was already heavily dirty before this task, including generated output, logistics UI, route/navigation files, and many untracked feature files.
- All pre-existing changes are treated as user/concurrent work and must be preserved.

## Repository Findings

- Current branch is `main` at `35b8bc2`.
- The repository already has an authored facilities equipment domain at `src/facilities/equipment.manifest`; it is new concurrent work and may provide useful lifecycle/status patterns, but this feature must not modify it.
- Logistics currently has delivery and pack-list UI surfaces; route and nav wiring must be inspected narrowly before editing because those files are already modified.
- Domain authoring must favor routine manager operations and avoid specialty role gates or lifecycle locks without real harm.
- The fleet search found no existing authored `Vehicle`/fleet catalog model, so a distinct source record appears necessary.
- `src/app.manifest` composes logistics from separate root modules (`delivery.manifest`, `pack-list.manifest`, `packing.manifest`), so the new model belongs in a sibling `src/logistics/vehicle.manifest` and must be added directly to the root entry.
- Logistics list pages consistently use generated React hooks, `LogisticsWorkspaceNav`, `LogisticsFailureBanner`, shared `supply-*` layout classes, and generated create/command mutations.
- `LogisticsWorkspaceNav` is data-driven through `src/features/logistics/logisticsRoutes.ts`, making a Fleet section a narrow addition there.
- `App.tsx` lazy-loads logistics pages and wraps routes with `SupplyRoute`; a new `/logistics/fleet` page should follow this exact pattern.
- The established equipment feature confirms generated `useCreate<Entity>` hooks seed a record and invoke its registration command, while lifecycle commands use `use<Entity><Command>`.
- Existing equipment status/policy choices are more restrictive than this routine fleet catalog needs. Fleet reads/writes/commands should use existing logistics access capabilities without introducing new roles or approval flows.
- `logisticsRoutes.ts` currently exposes only Pack lists and Deliveries; adding Fleet there will automatically update the shared workspace tabs.
- The equipment catalog gives the closest UI precedent: a generated create hook, status update commands, shared supply-form/table layout, `StatusChip`, and an empty state.
- The repository is Bun-based. `npx` exists (satisfying the Playwright skill prerequisite), but project verification commands must use the repository's Bun conventions.
- A dedicated vehicle UI can stay within existing shared CSS classes; no global stylesheet edit is required, avoiding the heavily modified `src/styles/app.css`.
- The logistics integration check is a thin generated proof-kit wrapper and should naturally include the new durable entity after proof regeneration.
- `playwright.config.ts` and a Playwright package dependency are absent; temporary verification will use an ephemeral Bun invocation and must not alter `package.json` or the lockfile.
- Hash checks showed the conflict-sensitive root Manifest, app router, and logistics route registry remained unchanged during the planning window.
- The live checkout contains many concurrent feature edits and several active Codex browser/runtime processes. The vehicle source, page, generated diagrams, and ownership-ledger entries are already present from the in-progress pass, so verification must stay limited to vehicle-specific surfaces and must not clean or rewrite unrelated files.
- The current vehicle model exposes a permissive operational-state correction path for logistics users, matching the domain-gating rule and avoiding approval tedium.
- `bun run manifest:regen` accepted the vehicle model with zero conflicts and zero assembly errors, generated three command diagrams, and refreshed the owned Convex/client artifacts.
- Generated output exposes `useListVehicle`, `useCreateVehicle`, `useVehicleReviseDetails`, and `useVehicleUpdateOperationalStatus`, backed by the generated Convex list/create/command functions.
- The required full gate reaches ownership/proof/registry checks successfully, then stops in the unrelated event integration guard. The violations are in `CommandFailure.ts`, `EventAllergenBriefingPage.tsx`, `EventIncidentPanel.tsx`, and `EventTimelinePanel.tsx`, all pre-existing/concurrent files outside this feature.
- The event integration blocker is already durably tracked as GitHub issue #60 (`https://github.com/Angriff36/capsule/issues/60`), so no duplicate issue is needed.
- The local Vite app is running and responds at `http://localhost:7811`, including the `/logistics/fleet` HTML shell.
- `AuthGate` has no development bypass; browser verification needs an existing authenticated Clerk/Convex workspace session or it can only prove the sign-in boundary.
- Existing Playwright snapshots remain at "Checking your session…", while the repo already includes `convex-test` and proof-kit test helpers. The safest complete verification is a temporary Playwright-run spec against the generated Convex API in memory, avoiding real Clerk accounts and durable test rows.
- The corrected temporary Playwright spec passed in 10.3 seconds, proving governed create, tenant-scoped list, status update, detail revision, and optimistic version increments. The spec was then deleted as required.
