# Time-off request workflow findings

## Initial repository state

- Branch `main`, HEAD `35b8bc2`.
- The checkout already contains a very large user-owned dirty delta, including generated files and workforce/notification UI. No existing change will be stashed, reset, or overwritten.
- Existing relevant authored surfaces include `src/workforce/availability.manifest`, `src/workforce/shift.manifest`, `src/features/staff/MyDayPage.tsx`, `src/features/staff/WeeklyAvailabilityCard.tsx`, `src/features/notifications/NotificationTray.tsx`, and `src/features/notifications/deriveNotifications.ts`.
- Current availability already treats `unavailable` as time off, but the requested submit/review/approve-or-deny workflow is not present in the searched authored source.
- A Vite dev server is already running at the documented `http://localhost:7811`; it must not be restarted for browser verification.
- On this turn, the feature plan and multiple feature artifacts already existed with recent timestamps and the plan marked implementation in progress. Treat all of them as pre-existing until provenance/concurrency is checked; do not overwrite blindly.
- Process inspection found the expected Convex/Vite services and editor TypeScript servers, but no active `codex exec`, Claude, or repo loop process writing this feature. Prior Capsule memory still requires timestamp/status stability checks before and after regeneration because this checkout has previously been rewritten concurrently.

## Open questions to resolve from source

- Whether approved requests should materialize as `AvailabilityWindow` records or be checked directly by `Shift.assign`.
- How current staff identity is resolved in `MyDayPage` and generated guards.
- Whether manager review should be a dedicated route or a focused section in an existing workforce page.
- Which client-derived notification source best fits pending requests.

## Domain findings

- `AvailabilityWindow` already models one-shot `available` / `unavailable` intervals with `declare` and `withdraw`; it has no approval state.
- `Shift.schedule` is manager-only and validates date order, shift type, training, and qualifications, but currently has no availability or time-off overlap constraint.
- `EventAssignment.assign` is a second assignment path with optional dates and likewise has no time-off overlap check. The feature wording says shift assignment, so the first required enforcement point is `Shift.schedule`; UI schedulers may also need proactive filtering/message copy.
- `WeeklyScheduleNotice` demonstrates the current pattern for durable workforce notifications, but the shared notification tray itself is client-derived because there is no general generated Notification table.
- Existing self-service guards in older workforce entities compare `personId` directly to `user.id`; current docs call out that this does not match the Clerk subject. New self-service source should follow the proven `recipientAuthSubjectId` pattern instead of repeating that gap.

## Implementation seam findings

- `convex/equipmentCheckout.ts` is the live precedent for an authored atomic creation seam when generated creation cannot hydrate overlap guards. It validates auth/tenant/domain references, inserts the row and corresponding `manifestEvents` entry in one serializable mutation, while later lifecycle commands stay generated.
- `RosterPage` currently schedules through `useCreateShift`; it also performs friendly client checks for training and overtime before mutation. Time-off should be a hard block before the optional overtime confirmation, with the server seam as the authoritative check.
- Manager notifications are derived in `deriveNotifications.ts` from live entity lists. Adding pending time-off requests there gives real-time in-app alerts without inventing a second notification store.
- The existing `/my` page resolves a staff member by `Person.authSubjectId === Clerk user.id`, which is the correct identity source for request submission.
- The partial implementation now includes the Manifest entity/commands, staff request card, manager review page, derived notification, shared half-open overlap helper, and an authored atomic `convex/workforceScheduling.ts` shift-creation seam.
- Staff date input is modeled as local-calendar whole days `[first day 00:00, day after last day 00:00)`, and overlap checks use half-open ranges so an ending boundary permits a shift beginning exactly then.
- Review risk to resolve: the authored scheduling seam currently hard-codes manager roles and reproduces generated schedule validation/event insertion. Compare it closely to existing authored seams and current `Shift.schedule` output so it does not drift or create an app-side capability inventory.
- `convex/equipmentCheckout.ts` confirms the current approved narrow-seam precedent also uses an explicit role set, authoritative tenant/reference checks, atomic insert, and matching Manifest event. The time-off seam must still be compared field-for-field with current generated `Shift.schedule`; precedent alone is not proof.
- The tracked diffs are interleaved with many unrelated feature changes (notably recurring availability, training, schedule publishing, and broad route additions). Final reporting must name only the time-off-specific authored files/hunks and generated artifacts produced by this feature’s Manifest regen.
- The custom shift seam matches the current generated create path’s required lifecycle fields (`status`, `scheduledAt`, timestamps, version 1), validation for shift type/training/qualification, encrypted notes, and `ShiftScheduled` event payload, while adding the approved-time-off query in the same Convex mutation.
- Notification bug found before verification: because staff can list their own request, the shared tray currently derives a manager-action notification for the requester and links them to the review desk. Pass the current Clerk subject into derivation and suppress notifications where it equals `requesterAuthSubjectId`; managers will still see other staff requests through the manager read policy.
- Playwright precedent in this checkout uses `bunx playwright test` with a disposable Vite component harness under `output/playwright/`, because a fresh browser context cannot pass Clerk auth without storage state. The harness should render the real time-off components with deterministic hook mocks, cover submit/review/overlap-block behavior, and be fully removed after the pass.
