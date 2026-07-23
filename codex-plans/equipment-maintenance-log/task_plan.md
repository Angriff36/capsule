# Task Plan: Equipment maintenance log

## Goal
Implement recurring maintenance scheduling, service completion logs, overdue operator alerts, and out-of-service checkout blocking while preserving the existing shared checkout and generated boundaries.

## Current Phase
Phase 2

## Phases

### Phase 1: Requirements and discovery
- [x] Capture requested behavior and repository constraints
- [x] Inspect the current equipment domain, checkout seam, UI routes, and relevant generated contracts
- [x] Confirm the checkout remains stable before editing shared files
- **Status:** complete

### Phase 2: Plan the source-first slice
- [x] Choose the minimum Manifest entities and commands
- [x] Choose authored Convex seams only where projection constraints require them
- [x] Define the authored UI flow and overdue alert surface
- **Status:** complete

### Phase 3: Implement and regenerate
- [x] Add or extend authored Manifest source
- [x] Run the sole allowed regeneration command
- [x] Add authored UI and narrow seam changes
- **Status:** complete

### Phase 4: Verify
- [x] Run focused existing verification
- [x] Create, run, and delete a temporary Playwright test
- [x] Run `bun run check` (stopped on pre-existing issues #40 and #32)
- [x] Inspect the final diff for concurrent overwrites or unrelated changes
- **Status:** complete with documented repository blocker

### Phase 5: Deliver
- [x] Update planning records and fixes log
- [x] Report the exact requested summary format
- **Status:** complete

## Key Questions
1. What equipment-maintenance schema and lifecycle already exist in the live checkout?
2. Can recurring next-due computation and overdue reads be generated from Manifest, or is a narrow authored seam required?
3. Where should operators see overdue maintenance without adding navigation tedium?
4. Does the current equipment checkout mutation already reject `out_of_service`, and if not, which source-owned boundary should enforce it?

## Decisions Made
| Decision | Rationale |
|---|---|
| Preserve every pre-existing dirty/untracked file | The checkout contains broad concurrent work, including the equipment checkout prerequisite slice. |
| Use `bun run manifest:regen` as the only regeneration entry | Required by repository ownership rules. |
| Do not add permanent tests | Repository instructions forbid expanding tests unless the owner asks; the requested Playwright spec will be temporary and deleted. |
| Add `EquipmentMaintenanceSchedule` and `EquipmentMaintenanceService` in the authored Equipment Manifest | Schedules need recurrence state; service entries need durable technician/cost/notes history. |
| Make service recording the public create command and advance the schedule by reaction | Every service log atomically updates recurrence while remaining append-only. |
| Use `addDuration(completedAt, durationDays(intervalDays))` in the schedule command | Manifest proves this runtime builtin, keeping recurrence calculation authoritative and generated. |
| Put the maintenance bench inside the Equipment catalog | This keeps operators in the existing asset workflow and supports a visible overdue alert without extra navigation. |
| Add no authored Convex maintenance seam | Current Manifest capabilities cover governed creation, date arithmetic, reactions, and non-create relation hydration. |

## Errors Encountered
| Error | Attempt | Resolution |
|---|---:|---|
| None yet | 1 | — |
| Concurrent session rewrote `convex/equipmentCheckout.ts` during discovery | 1 | Paused implementation and scheduled a stability recheck; do not edit overlapping equipment files while writes continue. |
| First `bun run manifest:regen` shell wrapper timed out after 5 seconds | 1 | Generated ownership and projection files were updated and no child remained; rerun with a full timeout to obtain a definitive result. |
| First patch for service-entry `nextDueAt` used the wrong exact context (`property cost` vs `property required cost`) | 1 | Read the exact source lines and applied a narrower corrected patch. |
| Expected `playwright.config.ts` was absent | 1 | Use Playwright's default configuration and a temporary self-hosted Vite harness in the required spec. |
| First Playwright run showed `$125.50` as `$126` | 1 | Use a maintenance-specific currency formatter with two fixed decimal places so service costs remain exact. |
| First currency-fix patch did not match Prettier's wrapped JSX | 1 | Read the exact formatted lines and applied the same change with narrower context. |
| `bun run check` stopped at unrelated Event integration guard findings | 1 | Confirmed the two untracked event panels predate this feature and are already tracked in Capsule issue #40; do not widen this task into concurrent event work. Run maintenance-relevant gates individually. |
