# Findings: Equipment maintenance log

## Requirements
- Schedule recurring maintenance per equipment item.
- Log completed service entries with technician, cost, and notes.
- Alert operators when scheduled maintenance is overdue.
- Block checkout of equipment whose condition is `out_of_service`.
- Follow current Capsule patterns and authored/generated ownership boundaries.
- Verify the core flow with a temporary Playwright test, then delete the test.
- Run `bun run check` before claiming completion.

## Baseline
- The working tree was already broadly dirty before this feature started.
- The in-progress equipment checkout slice includes authored and generated changes that are prerequisites and must be preserved.
- Memory guidance warns that this shared checkout has previously been rewritten concurrently; timestamps and status must be checked before editing.
- `npx` is available, but project commands remain Bun-based unless the temporary Playwright setup already defines a repository convention.

## Research Findings
- The prior equipment-checkout plan records an existing Equipment catalog, `out_of_service` condition, an event checkout UI, and an authored `convex/equipmentCheckout.ts` allocation seam.
- The prior slice chose a source-first Manifest lifecycle plus a narrow Convex seam where generated cross-row allocation could not safely enforce overlap/capacity.
- `EquipmentReservation.checkOut` currently checks only reservation state and deletion; it does not yet block checkout when the related Equipment condition is `out_of_service`.
- The authored reservation seam verifies active/registered status and capacity but does not check condition. The feature specifically requires blocking checkout, so the checkout command is the harm boundary; operators may still plan a future reservation while equipment is being repaired.
- The prior slice established that non-create generated mutations can hydrate belongs-to relations used by command guards, so a source-level `self.equipment.condition` checkout guard should remain generated rather than duplicated in React.
- Equipment reads/writes are intentionally shared between inventory and logistics roles. Maintenance should reuse that posture and reserve manager-only access for materially destructive catalog actions, not ordinary service logging.
- The live equipment Manifest file already contains the reservation slice and was last written at 06:33; its prerequisite event panel and Convex seam were still being written at 06:36-06:37, so stability must be rechecked before overlapping edits.
- The Equipment catalog is a single authored page using generated hooks, shared supply-ledger styles, inline command feedback, and compact row actions. It is the lowest-tedium home for a maintenance bench and overdue alert because operators already manage equipment condition there.
- The event checkout panel uses the generated `useEquipmentReservationCheckOut` command. A source-level guard will therefore reach the actual UI action without adding a second client-side policy.
- Checkout condition defaults from the catalog item and can currently be submitted as `out_of_service`; the domain must reject based on the equipment record regardless of the form selection.
- The established visual language is an industrial dispatch ledger using Archivo, IBM Plex Mono, warm paper, dark ink, and orange signal accents. The maintenance UI should extend that language rather than introduce a generic dashboard.
- Existing Manifest source contains governed create commands and reaction-driven cross-entity creation, so a maintenance schedule plus immutable service-entry log is structurally consistent with the domain language.
- Repository source only demonstrates `durationBetween`/`durationMinutes` for elapsed-time reads; it does not yet prove adding a day interval to a datetime. Date arithmetic syntax must be confirmed before deciding whether next-due calculation belongs directly in a generated command.
- Generated client hooks follow predictable `useCreate<Entity>`, `useList<Entity>`, and `use<Entity><Command>` naming, so regeneration should provide the maintenance UI contract without editing generated bindings.
- Current Manifest documentation and implementation prove `addDuration(datetime, durationDays(n))`, so the schedule can advance its next-due timestamp in the generated domain command without client-side calendar math.
- A service-entry entity can expose the user-facing `record` creation command; its emitted event can resolve the linked schedule and run an `applyService` command that advances `nextDueAt`. This keeps the log append-only and the recurrence update in one generated transaction.
- Existing governed-create patterns seed same-named relationship ids and validate linked records in the command. Maintenance scheduling and service logging can follow that established pattern.
- Regeneration proved the checkout condition constraint correctly hydrates Equipment and emits the clear error `Equipment marked out of service cannot be checked out` before state transition.
- Regeneration exposed two Manifest Convex projection defects: `addDuration`/`durationDays` in a mutation assignment was silently omitted, and a command parameter renamed into a property was later read from the wrong field in the creation event payload.
- Filed Capsule issue #54 for the projection defects: https://github.com/Angriff36/capsule/issues/54.
- Workaround: align schedule parameter/property naming and pass `nextDueAt` through service record -> event -> schedule reaction. The UI derives it from the task's persisted interval, and generated constraints require it to remain after completion.
- The corrected generated output now persists `nextDueAt` on each service entry, emits it in `EquipmentServiceRecorded`, and advances the linked task within the same mutation transaction.
- The authored maintenance board extends the existing dispatch-ledger aesthetic and provides direct schedule/log actions, overdue counts and alert copy, next-due state, last service technician/cost/notes, and an explicit checkout-lock marker for out-of-service equipment.
- Focused `bun run typecheck` passed after the domain and UI implementation.

## Technical Decisions
| Decision | Rationale |
|---|---|
| Treat current files as live evidence, not memory | The checkout is active and drift-prone. |
| Keep the UI operational and low-tedium | Operators need direct scheduling/completion actions and visible overdue status, not extra approval gates. |
| Enforce out-of-service at `EquipmentReservation.checkOut` in Manifest | This blocks the risky action across generated UI/API/agent surfaces while still allowing future planning during repair. |

## Issues Encountered
| Issue | Resolution |
|---|---|
| Extremely dirty shared checkout | Scope all inspection and edits narrowly; verify stability before modifying overlapping files. |
| `convex/equipmentCheckout.ts` changed from 4,187 bytes at 06:37 to 3,849 bytes at 06:40 during this task | Treat as an active concurrent writer and pause edits per the repository's hard-stop guidance. |
| Convex projection dropped `addDuration` mutation assignment and mis-mapped renamed event field | Filed issue #54 and changed the command contract to carry an explicit next-due timestamp through the generated transaction. |
| Full `bun run check` stops before typecheck on `EventAllergenBriefingPage.tsx` and `EventIncidentPanel.tsx` integration-guard violations | Both files are unrelated pre-existing untracked work and the blocker is already tracked in Capsule issue #40; preserve them and run scoped verification. |

## Resources
- `AGENTS.md`
- `docs/architecture/domain-gating-restraint.md`
- `codex-plans/equipment-event-checkout/findings.md`

## Visual and Browser Findings
- Playwright directly observed the actual maintenance component render an overdue alert and checkout lock, create a 14-day recurring work order, record service by Jordan Lee for `$125.50` with notes, clear the overdue alert, and advance the task to scheduled.
- The final screenshot shows a legible industrial service ledger with strong asset/work-order/due/service separation, exact cost, visible out-of-service checkout lock, and no overlapping or clipped content at 1280px.
- Evidence: `output/playwright/equipment-maintenance-verification/maintenance-board.png`.
