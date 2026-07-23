# Findings: QR Staff Check-In

## Requirements
- Generate a unique QR code for each event.
- Scanning from an assigned staff member's phone automatically creates a TimeRecord clock-in linked to that event and assignment.
- Follow current Capsule patterns and generated-file ownership rules.
- Verify the core behavior with a temporary Playwright test, then delete the test.
- Run the repository's required `bun run check` gate before claiming completion.

## Initial Repository State
- Branch: `main`.
- The checkout already contains a very large authored and generated delta plus many untracked feature files.
- Generated paths must not be edited directly; Manifest regeneration may only use `bun run manifest:regen`.
- `npx` is available, satisfying the Playwright skill prerequisite; repo command conventions will still be inspected before choosing the exact runner.

## Relevant Prior Context
- Prior Event work traces from `src/operations/event.manifest` through generated bindings into authored event UI.
- Prior memory explicitly says generated behavior and the current dirty-worktree status must be re-verified in this run.

## Research Findings
- The current model already includes an authored `EventAssignment` entity in `src/workforce/assignment.manifest`; it links `personId` to `eventId` and has `assigned`, `confirmed`, `checked_in`, `checked_out`, `no_show`, and `unassigned` states.
- `EventAssignment.checkIn` already exists as a generated command surface, but the requested feature also needs a TimeRecord linked to the event and assignment.
- `src/features/staff/MyDayPage.tsx` is an untracked, phone-first staff page that already uses generated TimeRecord create/clock-out hooks. Its current manual clock-in call passes only `personId`, so the exact TimeRecord schema and current concurrent ownership must be inspected before changing it.
- Multiple active Claude and Codex processes are running alongside Capsule Convex/Vite processes. At least three Codex exec processes and an AboardAI `claude-fable-5` process were live during discovery, so overlapping edits are a concrete risk rather than a merely dirty historical tree.
- A five-second hash check found no edits during that narrow window, but `src/workforce/time.manifest`, `src/features/events/EventDetailPage.tsx`, `src/app/App.tsx`, `package.json`, generated Convex files, and the ownership ledger had all been written within minutes of this task. Read-only discovery can continue; source edits remain unsafe until the concurrent jobs settle.
- `TimeRecord` already supports optional `shiftId` and `eventId`, but has no `eventAssignmentId`. Its `clockIn` command enforces self-service with `personId == user.id` (or workforce manager) and sets `clockInAt = now()`.
- The requested linkage to an assignment therefore requires either adding `eventAssignmentId` to the Manifest domain or persisting a separate correlation record. Adding the direct optional foreign key is the most honest domain shape if the generated toolchain supports it.
- The current My Day manual clock-in creates a TimeRecord with only `personId`; it does not select or transition an EventAssignment, so it cannot satisfy the feature as written.
- The repo has no direct QR rendering dependency. `qrcode.react` or an equivalent local renderer will be needed unless the project already has a reusable QR component elsewhere.
- Binding domain guidance requires guards to prevent real harm without inventing extra user friction. The essential QR guards are authentication, same-tenant assignment membership, assignment-to-event match, and idempotent duplicate-scan handling.
- `Person.authSubjectId` is the explicit Clerk-subject link. The mobile page already resolves the current person with `person.authSubjectId === user.id`, falling back to a local device picker only when no identity link exists.
- Manifest runtime auth uses the Clerk subject as `user.id`, while Person primary keys are Convex IDs. Consequently, generated self-service guards comparing `self.personId == user.id` are not a safe foundation for this QR flow. An authored Convex mutation must resolve `authSubjectId` and then enforce assignment ownership.
- The app already has a full-screen authenticated `/my` route outside the admin shell. A sibling `/check-in/:eventId` route can preserve the scanned destination through the embedded AuthGate without exposing admin navigation.
- Event Detail already loads EventAssignments and people, so an event QR panel can be added without new manager-side data queries.
- The Roster currently transitions EventAssignment independently from TimeRecord. The QR mutation needs to perform the EventAssignment state update and TimeRecord insert atomically to avoid half-completed clock-ins.
- Safe idempotency behavior: return the existing open TimeRecord for the same assignment/event; reject a different open event clock-in with a clear clock-out-first message; permit `assigned` or `confirmed` assignment states and reject terminal states.

## Technical Decisions
| Decision | Rationale |
|---|---|
| No permanent test addition | The repository forbids adding tests unless requested; the requested Playwright spec will be deleted after verification. |
| Resolve current staff by `Person.authSubjectId` in the backend | Device-local person selection is not an authorization boundary; Clerk subject mapping is. |
| Use event ID in an authenticated check-in URL | The feature asks for a unique per-event QR, not a bearer-secret public check-in; assignment and tenant checks provide authorization. |

## Issues Encountered
| Issue | Resolution |
|---|---|
| Shared checkout has extensive pre-existing work | Capture baseline carefully and stop if overlapping files are actively changing. |
| A new Codex exec process started during discovery while required files carried large recent deltas | Implementation stopped before product edits. Resume only after concurrent work ends or in an isolated checkout that includes the intended baseline. |

## Resources
- `AGENTS.md`
- `.aboardai/context/*.md`
- `src/operations/event.manifest`
- `src/workforce/shift.manifest`
- `src/workforce/time.manifest`

## Visual/Browser Findings
- None yet.
