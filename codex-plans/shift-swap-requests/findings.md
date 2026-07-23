# Findings: Shift swap requests

## Repository state

- Branch is `main`, five commits ahead of `origin/main`.
- The checkout contains a large pre-existing authored and generated delta across many feature slices.
- Workforce source, UI, generated artifacts, and system docs were already modified before this task.
- Root `codex-plans/task_plan.md` belongs to a payroll export task, so this feature uses an isolated plan directory.

## Binding constraints

- Author Manifest source under `src/**/*.manifest`; never hand-edit generated Convex, schemas, wiring, generated client bindings, or diagrams.
- Regenerate only with `bun run manifest:regen`.
- Do not add permanent tests unless asked; the user explicitly requested a temporary Playwright test that must be deleted after verification.
- Run `bun run check` before claiming completion.
- Avoid invented role/policy gates; every guard must prevent concrete scheduling harm.

## Discovery notes

- Prior project history suggests authored UI should stay thin over generated lifecycle commands and generated metadata, but the live checkout must be re-verified.
- No current `ShiftSwap`/swap-request entity, command, route, or UI was found in the workforce source or system doc.
- The live `Shift` record is the assignment record for a scheduled work period: it carries `personId`, event, role, start/end, optional prerequisite ids, and lifecycle status.
- `EventAssignment` is separate event-level staffing and does not own the concrete weekly shift schedule.
- Pre-existing dirty work has already expanded `Shift` with qualification/training prerequisites and added `WeeklyScheduleNotice`; `RosterPage` is also heavily modified for availability and schedule publication.
- Any swap implementation must preserve those fields when reassigning and must avoid colliding with the concurrent roster/schedule-publication work.
- `docs/systems/workforce.md` currently lists open offer/decline and open-shift bidding decisions, but not a shift-swap flow.
- The staff self-service route is `/my`, implemented by `src/features/staff/MyDayPage.tsx`; it already lists `Shift` and `Person` data and performs staff-side lifecycle actions.
- Manager scheduling lives in `RosterPage`; an authored `workforceScheduling.scheduleShift` mutation exists only because generated creation cannot hydrate a Person's `hasMany` time-off rows.
- Manifest supports event-triggered cross-entity commands via `on Event fanOut Entity where ... run Entity.command`; this is the likely source-owned way to apply an approved swap atomically without a UI-orchestrated two-step update.
- Existing source includes staged cross-entity reassignment workflows (`contact-merge.manifest`) that can be used as the concrete DSL pattern.
- The current app has explicit Person `authSubjectId` support for trusted staff identity in newer schedule-notice behavior; swap self-confirmation should use that identity rather than the older broken `personId == user.id` pattern.
- Snapshot hashes were captured for `shift.manifest`, `RosterPage.tsx`, and `App.tsx` to detect concurrent edits before touching overlapping paths.
- The canonical atomic reassignment pattern is a two-stage Manifest reaction: store temporary authorization/target ids on the assignment entity, emit a staged event, then resolve the same entity and validate authorization before mutating the foreign key. All reactions execute in the originating transaction and roll back together on failure (`contact-merge.manifest` + `Event.reassignClient`).
- `Person.isAssignable` means active and not deleted; `Person.authSubjectId` is the canonical external-auth link.
- `/my` first resolves the signed-in Person by `authSubjectId`, with a local device selection fallback, then filters upcoming scheduled/started shifts by `personId`.
- Existing shift creation validates target Person state, shift-type training completion, required qualification ownership/expiry, and approved time off in an authored atomic mutation.
- The swap source path can preserve schedule integrity by reusing these eligibility concepts: target active, prerequisite proof reassigned to the target when required, no approved time-off overlap, and no overlapping scheduled/started shift.
- `npx` is available (`10.9.3`). The user explicitly requires a temporary Playwright spec, so the Playwright skill permits test-file mode; no permanent spec should remain.
- Shift-type eligibility can be re-proven with a target `TrainingCompletion` whose module matches `ShiftType.requiredTrainingModuleId`; qualification eligibility can replace the source person's proof with an active, unexpired target qualification of the same name.
- Qualification equivalence can use both `name` and `certificationType`; target proof must be active, belong to the recipient, and remain valid through the shift end.
- Training completion proof uses `personId`, `trainingModuleId`, `completedAt`, `assessmentScore`, and `recordedAt`; existing schedule semantics require a recorded completion for the required module.
- Approved time off is represented by `TimeOffRequest.status == "approved"`; active shift conflicts can be screened against scheduled/started ranges.
- The previously captured hashes for `shift.manifest`, `RosterPage.tsx`, and `App.tsx` remained unchanged through discovery, so no active writer was detected on those paths.

## Implementation plan

- Add `ShiftSwapRequest` as a direct root Manifest module with proposed → awaiting manager → approved, plus declined/withdrawn/rejected exits.
- Stage approved authorization and target credential ids on `Shift`, then apply the reassignment through same-transaction reactions.
- Add a reusable candidate evaluator for active Person, overlapping shifts, approved time off, qualification replacement, and training proof.
- Add a phone-first `ShiftSwapCard` to `/my` for proposing, accepting, declining, and withdrawing.
- Add `/staff/swaps` for manager approval/rejection and current eligibility feedback.
- Regenerate only through `bun run manifest:regen`, document the shipped surface, then verify with focused gates, a temporary Playwright spec, and `bun run check`.

## Implementation evidence

- `bun run manifest:regen` completed with zero conflicts, zero deletions, a complete assembly report, and generated the full ShiftSwapRequest query/mutation/hook surface.
- Generated `ShiftSwapRequest_approve` writes approval and then calls `Shift.stageApprovedSwap`; that staged command immediately calls `Shift.applyApprovedSwap` in the same Convex mutation context.
- Generated `Shift.applyApprovedSwap` hydrates the approved request, target Person, replacement qualification, and training proof before patching `Shift.personId` and clearing temporary authorization fields.
- Builder also regenerated unrelated dirty source already present in the shared checkout; that broad generated delta remains user-owned and must not be attributed solely to this feature.
- Focused verification passed: `bun run typecheck` and `bun run check:workforce-manifest`.
- Local Vite (`http://localhost:7811`) and local Convex (`http://127.0.0.1:3210`) both returned HTTP 200; `@playwright/test` and Playwright are already installed at 1.61.1.
- Runtime verification exposed a generator defect: `self.id` inside a command constraint projected to `doc.id`, but Convex documents expose `_id`; the approval transaction correctly rolled back before reassignment.
- The failed id comparison was redundant on the intended path because `ShiftSwapRequest.approve` first hydrates and validates its exact `shiftId`, and the generated fan-out loads that same id before staging. Source/target/credential authorization checks remain in `Shift.applyApprovedSwap`.
- The corrected temporary Playwright spec passed in 28.7 seconds: proposal left the Shift on Avery, recipient acceptance still left it on Avery, manager approval changed it to Jordan, kept status scheduled, cleared staging ids, and advanced the Shift to version 3.
- Filed required blocker escalation [#77](https://github.com/Angriff36/capsule/issues/77) for Manifest projecting `self.id` as nonexistent `doc.id` in Convex command constraints.
- Required `bun run check` passed toolchain, ownership, proof emission/registry, and Manifest registry pin, then stopped on unrelated pre-existing event integration-guard violations. Filed [#78](https://github.com/Angriff36/capsule/issues/78); no event files or guard rules were changed.
- Final feature-scoped checks passed after the last regeneration: TypeScript, workforce integration guard, production build, and scoped Prettier.
- The temporary Playwright spec and `.last-run.json` were both removed; no temporary verification file remains.
