# Findings: Staff Schedule Publish

## Repository state
- Branch: `main`, five commits ahead of `origin/main` at initial inspection.
- The worktree already contains extensive modified and untracked files across generated output, workforce, UI, docs, and many other feature slices.
- `src/workforce/shift.manifest`, `src/features/workforce/RosterPage.tsx`, generated Convex output, and ownership metadata are already modified and must be treated as user-owned until inspected.
- `npx` is available, satisfying the Playwright skill prerequisite; repository command conventions still favor Bun.
- No directly relevant memory registry entry was found for schedule publishing or acknowledgement.

## Requirements
- Manager can publish a week’s schedule.
- Publishing notifies every staff member scheduled that week with a shift summary.
- Staff can acknowledge receipt in a self-service view.
- Before the work week begins, managers see a warning for unacknowledged schedules.
- Avoid adding low-value guardrails or tedium; a warning is informational, not a blocker.

## Pending discovery
- Existing scheduling domain shape and routes.
- Existing notification and self-service components.
- Existing date/week utilities and UI primitives.
- Safe regeneration feasibility in the current checkout.

## Discovery notes
- `Shift` is the only current schedule record. It stores person, optional event, start/end, role, status, and lifecycle timestamps; there is no week-level publication aggregate or acknowledgement state.
- `RosterPage.tsx` is the manager surface and `MyDayPage.tsx` is the phone-first staff self-service surface.
- The worktree diff already adds qualification requirements to `Shift` and a substantial overtime/availability slice to `RosterPage.tsx`; those changes are unrelated and must remain intact.
- The current Shift source and workforce docs contain an unsupported “Schedule/OpenShift deferred” statement. The binding no-invented-deferrals guidance says not-built work must not be described as owner-deferred.
- The existing notification tray derives transient client-side alerts from live Convex query data. Publication acknowledgement needs durable cross-user state, so localStorage-only notification state is insufficient.
- Email notification infrastructure already exposes a `shift_changes` category, but the feature requirement says notify scheduled staff, not necessarily email them; in-app durable publication records can satisfy this while respecting preferences if email delivery is later connected.
- `bun run manifest:regen` is the only allowed generation path if the domain source changes.
- The existing qualification-related Shift constraints are proportionate integrity checks. Schedule acknowledgement should add no manager-blocking guard; the pre-week condition is a warning only.
- No existing Manifest command or entity models schedule publication/receipt acknowledgement; the closest publish patterns are Menu/Recipe lifecycle commands.
- `/my` is already routed outside the admin shell and resolves the current Person by `authSubjectId`, with a local profile picker fallback.
- Generated client wiring exposes list/create/action hooks for every Manifest entity, so a new entity in the authored source should produce the required hooks through approved regeneration.
- Relevant source timestamps did not change across the discovery interval and no Git lock was present, so there is no current evidence of an active overlapping writer. Continue with narrow edits and re-check before regeneration.
- The generated write boundary forbids authored Convex modules from directly mutating workforce tables. Publication and acknowledgement must be Manifest commands consumed through generated hooks.
- `convex/lib/authContext.ts` confirms `user.id` is the external identity subject. Persisting the selected Person’s `authSubjectId` on the notice makes staff acknowledgement securely expressible in a Manifest guard.
- Existing CSS and utility classes provide the roster ledger/card/action vocabulary; the new manager band can be visually distinct without redesigning the whole page.
- The live `/my` file is untracked as part of pre-existing user work. The schedule card was added narrowly without altering its existing field-work flows.
- Work weeks use the same Sunday start convention as the existing overtime projection, preventing two competing week buckets on the roster page.
- The app responds at the documented `http://localhost:7811`; `.env.local` and the existing Playwright package are present.
- The app has no unauthenticated development fallback. A fresh Playwright context will encounter Clerk sign-in unless an existing local browser profile or safe test harness supplies session state.
