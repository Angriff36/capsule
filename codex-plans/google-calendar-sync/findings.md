# Findings: Google Calendar Sync

## Requirements
- Sync confirmed CapsuleX events to a connected Google Calendar.
- Calendar entry includes event name, date/time, venue, and headcount.
- Rescheduling updates the existing entry.
- Cancellation removes the entry.
- Follow existing codebase patterns and ownership rules.
- Verify the core flow with a temporary Playwright test, then delete that test.
- Run the repository's required completion gate.

## Initial Repository State
- Branch: `main`, ahead of `origin/main` by three commits.
- The worktree already has extensive unrelated modified and untracked work, including generated files and event UI.
- `.aboardai/**` must never be moved or stashed.
- Generated Convex entrypoints, generated clients, schemas, wiring, generated tests, and diagrams must not be hand-edited.
- Existing unrelated changes must be preserved.

## Research Findings
- No existing Google Calendar, OAuth, token, or calendar-sync implementation was found in authored source, Convex seams, docs, tests, dependencies, or the environment contract.
- The domain's confirmed-equivalent lifecycle stage is `approved`; there is no Event `confirmed` stage.
- Event already has the required calendar payload: `title`, `startsAt`, `endsAt`, `venueName`, `venueAddress`, and `expectedHeadcount`.
- Event commands include `reschedule`, `changeVenue`, `changeHeadcount`, `approve`, and `cancel`; cancelled is terminal.
- The local Vite server and several Convex dev processes are active. This confirms a live verification target but also reinforces that unrelated agents are using the checkout.
- Only the root `AGENTS.md` applies; no nested agent instruction files were found.
- The binding outbound-integration doc requires outbound notifications/integrations to use emitted domain events plus an outbox/EventBus (or an explicit worker), never Manifest `webhook`.
- Generated Event commands already persist lifecycle emits to the generic `manifestEvents` ledger. That ledger is therefore the natural source of truth for an explicit Google worker and avoids raw writes to Event state.
- Recent authored integration patterns expose dedicated Convex action/query modules and use tenant-scoped auth plus internal queries/mutations for provider work.
- Administration already has a workspace subnav and lazy route pattern suitable for an Integrations page, but those files are currently unrelated dirty/untracked work and must be rechecked immediately before any edit.
- `manifestEvents` accepts provider-specific ledger payloads and has indexes by type, entity, and entityId; it can carry connection/sync facts without a schema change.
- The existing authored encryption seam supports AES-GCM encryption with `CONVEX_FIELD_ENCRYPTION_KEY`; Google refresh tokens can be stored as encrypted envelopes instead of plaintext.
- A reconciler can query current tenant Events and latest per-event calendar sync facts, making lifecycle propagation independent of which UI/agent command path changed the Event.
- Current Google guidance supports the confidential web-server OAuth flow with exact registered redirect URIs, CSRF-protecting `state`, `access_type=offline`, authorization-code exchange, and refresh-token renewal at `https://oauth2.googleapis.com/token`.
- The narrow `https://www.googleapis.com/auth/calendar.events` scope is sufficient to view/edit events and is less permissive than full-calendar access.
- Calendar REST endpoints support insert, patch/update, and delete; the `primary` calendar keyword is valid for a connected user's primary calendar.
- Google documents 404 on delete for an already-removed event and 409 for an insert using an existing caller-supplied ID, which should be treated as reconciliation/idempotency cases.
- `getAuthContext` normalizes Clerk `org:*` roles and provides fail-closed actor/tenant context; custom provider functions can reuse it.
- `src/lib/api.ts` is the required single client import point and re-exports all Convex module APIs.
- Generated Event mutations already emit `EventApproved`, `EventScheduleChanged`, `EventVenueChanged`, `EventHeadcountChanged`, and `EventCancelled`, so reconciliation can observe every relevant path without wrapping UI commands.
- Candidate route/navigation/environment files are already dirty from other completed slices, but their timestamps were stable during discovery; any edit must remain surgical and be preceded by another status/timestamp check.
- Existing Administration pages define manager access as `manager`, `admin`, `owner`, `system`, or any `*_manager`; the calendar page can follow the same low-tedium convention.
- Existing custom Convex provider modules call generated governed queries where possible and expose actions/queries through the normal module API.
- The route, admin-nav, environment, and generated API declaration files remained unchanged across the final pre-edit check.

## Technical Decisions
| Decision | Rationale |
|---|---|
| No bare Manifest generation | AGENTS.md permits only `bun run manifest:regen`, and this feature should avoid generation unless source-first domain changes prove necessary. |
| Treat Google Calendar as an outbound worker over `manifestEvents` | This follows the binding command API boundary and keeps generated Event commands authoritative. |
| Store only encrypted refresh-token material in ledger payloads | The repo already has a server-only encryption contract and forbids committed secrets. |
| Request only `calendar.events` with offline access | This is the least-privilege Google scope that supports create/update/delete and enables background reconciliation. |
| Reconcile current Event state in a self-scheduling explicit worker | This covers UI, agent, and other generated command paths without editing generated mutations or adding a cron entrypoint. |
| Use deterministic base32hex Google event IDs derived from Capsule Event IDs | Google permits caller-supplied IDs; deterministic IDs make insert retries and ledger-write failures idempotent. |
| Treat `approved`, `executing`, `completed`, and `closed_out` as calendar-eligible | Approval is confirmation; later lifecycle stages should not make the real event vanish from history. |
| Add an Administration Integrations page | A tenant-wide provider connection belongs alongside organization settings and should expose connection health without cluttering event workflows. |

## Issues Encountered
| Issue | Resolution |
|---|---|
| Shared dirty worktree creates overlap risk | First trace ownership and live processes; touch only new/narrow authored seams with no active overlap. |
| Event UI and generated Convex files are already modified by unrelated work | Prefer new authored files and the smallest possible integration points; re-check each target immediately before editing. |
| PowerShell rejected Unix-style file-glob path arguments passed to `rg` | Search directory roots and pass file patterns with `--glob` instead. |
| Brave Search helper could not start because its dependency install is missing | Fall back to official-source web browsing without changing the shared skill installation. |
| No root `playwright.config.ts` exists | Use the repository's installed Playwright package directly with a temporary explicit spec/config path. |
| Prettier has no parser for `.env.example` | Do not retry formatting that file; its added lines are already plain env syntax. |
| Required full gate is currently blocked by unrelated existing Event integration guard failures in `CommandFailure.ts`, `EventAllergenBriefingPage.tsx`, `EventIncidentPanel.tsx`, and `EventTimelinePanel.tsx` | Preserve concurrent work; do not widen this feature into generated-hook migration fixes. |
- The required blocker escalation was filed as `Angriff36/capsule#58`: https://github.com/Angriff36/capsule/issues/58
- Independent baseline hygiene is also red because the shared checkout has 57 root entries against a cap of 44; this is unrelated to the integration and cannot be safely cleaned in this task.
- Production build is independently blocked by unrelated ingredient-substitution work importing a generated hook that does not exist.
- Coverage baseline: 51 files/518 tests pass, but 10 files/14 tests fail. Root causes include the already-filed Event integration guard, stale governed-creation/navigation expectations, a missing Router wrapper in prep-board presentation, and Event.approve reactions attempting finance-protected Invoice.issue under non-finance roles.

## Resources
- `AGENTS.md`
- `.env.example`
- `src/operations/event.manifest`
- `src/features/events/`
- `convex/lib/`

## Visual/Browser Findings
- Official Google documentation confirms the current OAuth endpoints/parameters and Calendar event REST routes; no interactive UI was inspected yet.
