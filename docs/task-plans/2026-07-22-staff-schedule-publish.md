# Staff schedule publication and acknowledgement — 2026-07-22

## Outcome

Managers can select a work week in the roster, publish one durable shift summary to every scheduled staff member, and see acknowledged, outstanding, and changed/unpublished counts. Upcoming published weeks show a non-blocking warning naming staff who have not acknowledged. Staff see their summaries in `/my` and acknowledge receipt from the linked sign-in.

## Implementation

- `src/workforce/shift.manifest` adds `WeeklyScheduleNotice` with unique person/week identity, publish/re-publish/acknowledge commands, events, manager publication guards, and recipient-subject acknowledgement scope.
- `src/features/workforce/weeklySchedule.ts` owns Sunday-based week selection, active-shift filtering, and human-readable staff summary construction.
- `src/features/workforce/RosterPage.tsx` adds week navigation, generated publication hooks, publication freshness detection, receipt counts, changed-summary updates, and the upcoming-week warning.
- `src/features/staff/MyDayPage.tsx` adds the staff receipt card, shift summary, linked-account acknowledgement action, and received state.
- `src/styles/app.css` adds the schedule publication/receipt visual treatment while retaining the existing editorial workforce language.
- Builder regeneration produced the Convex schema/queries/mutations, Zod schemas, React hooks, wiring contract, diagrams, generated contract tests, proof-kit artifacts, and ownership updates.

## Verification

- `bun run manifest:regen`: passed with no conflicts.
- `bun run typecheck`: passed.
- `bun run check:workforce-manifest`: passed after proof emission.
- `bun run test tests/manifest-convex.contract.test.ts tests/workforce-manifest-integration-guard.test.ts tests/proofs/shift-lifecycle.runtime.test.ts`: 359 passed.
- `bun run secrets`: passed.
- `bun run build`: passed.
- Temporary Playwright harness around the real `RosterPage` and `MyDayPage`: 1 passed in 7.1s. It verified manager publication, the pre-week outstanding warning, staff acknowledgement, and warning clearance. The temporary spec/harness/results were deleted. Screenshot: `output/playwright/staff-schedule-publish-verified.png`.

## Shared-checkout blockers preserved

- #58 — Event integration guard blocks `bun run check` before workforce checks.
- #64 — Inventory audit page bypasses generated Supply hooks.
- #62 — governed create-via mapping expectation is stale.
- #63 — navigation test still treats `/admin` as planned.
- #65 / #32 — Event approval reaches an Invoice reaction under a non-finance caller and breaks multiple runtime proofs.
- #70 / #46 — unrelated formatting artifacts block `format:check`.
- #47 — root-entry baseline cap is below the current shared-checkout count.
