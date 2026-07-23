# Findings: Client Communication Log

## Requirements
- Record a manual call, email, or meeting.
- Associate each entry with either a Contact or an Event.
- Store date, medium, summary, and author.
- Make the history available to team members before their next client action.
- Follow authored/generated ownership boundaries and regenerate only with `bun run manifest:regen`.
- Verify core behavior with a temporary Playwright test, then delete that test.
- Run the repository-required `bun run check` before claiming completion.

## Research Findings
- The checkout began with a very large pre-existing dirty tree spanning authored and generated files; all unrelated changes must be preserved.
- Existing memory points to thin authored UI wiring over generated Manifest hooks and the generated Convex command surface; current source must still be verified before design decisions.
- `src/sales/contact.manifest` defines the person-level `ClientContact`; `src/operations/event.manifest` defines both `Client` and `Event`.
- The app already exposes client detail at `/clients/:id` and event detail at `/events/:id`, making those the natural low-tedium locations for a shared communication panel.
- `src/app.manifest` already imports the contact module; a new authored sales module can be added to that root without daisy-chaining imports.
- No existing communication/activity/note entity was found in authored Manifest source.
- Manifest supports trusted command parameters such as `authorId: string from context.actorId`; Capsule's authored Convex auth seam maps Clerk `identity.subject` to that actor id. This lets the server own authorship while the UI provides a readable author-name snapshot.
- Existing detail panels use generated create/list hooks, local filtering, compact `Section`/ledger layouts, and inline form disclosure. The communication UI can follow that established seam without authored Convex logic.
- `ClientDetailPage.tsx` is clean at task start. `EventDetailPage.tsx`, `src/app.manifest`, and `src/styles/app.css` already contain unrelated changes; patches must be minimal and additive. No new CSS is necessary because existing utility/primitives cover the panel.
- The current contact source still says `ClientInteraction` was deferred, but the binding no-invented-deferrals rule requires removing that stale ceiling while implementing the feature.
- `bun run manifest:regen` accepted the new model with no conflicts or blockers, added the generated `ClientCommunication.record` surfaces, and updated Builder ownership in one transaction.
- The `user.id` workaround regenerated correctly: Convex accepts only the UI fields, then stamps `authorId: user.id` into the record and emitted event.
- Prior Playwright snapshots in this checkout show fresh automation contexts stalling at Clerk's “Checking your session…” screen. Browser verification therefore needs either a usable test sign-in path or a temporary mocked-module harness around the real component; it cannot honestly claim an unauthenticated app flow passed.
- The regenerated `ClientCommunication_createViaRecord` surface accepts only target/date/medium/summary/authorName from the client and stamps `authorId: user.id` inside Convex before insert; the generated relation checks reject unknown Contact/Event targets.

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Keep planning artifacts scoped to this feature | Avoids overwriting the active generic planning files already present in the shared dirty checkout. |
| Store trusted `authorId` plus an `authorName` snapshot | Authorship cannot be selected by the browser, while the shared history remains immediately readable even if a Person record is not synced. |
| Allow any staff member to read and record entries | The feature explicitly promises a full picture to any team member; `staffAccess` is the existing broad employee capability and avoids specialty-role tedium. |
| Use one immutable `ClientCommunication` entity with exactly one optional target | A single chronological record supports both Contact and Event surfaces without duplicate models; exactly-one-target prevents ambiguous or orphaned entries. |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| The repository already had broad generated changes before this task | Used the single Builder regeneration command and will report only the feature-specific generated additions, leaving all existing deltas intact. |
| Convex projection did not honor `from context.actorId` for a create-via command | Use the equivalent server context expression `user.id` directly in the authored mutation; file a Capsule issue with generated evidence instead of hand-editing outputs. |
| Prettier does not infer a parser for `.manifest` | Format supported authored files only; generated Builder output remains authoritative for Manifest artifacts. |
| Full repository check stops before feature gates on existing `EventAllergenBriefingPage.tsx` and `EventIncidentPanel.tsx` direct Convex hooks | Preserve the pre-existing files; the exact blocker is already tracked in Capsule issue #40. |
| Coverage has 52 passing files / 483 passing tests but 13 failures | Existing Event/finance/nav drift accounts for 12; the governed-creation expectation also needs the pre-existing TaxRate and new ClientCommunication mappings, but repository rules prohibit expanding that permanent test without owner approval. |
| Repository format and baseline-decay checks are independently blocked | Format scans 200 AboardAI/Playwright/scratch files (issue #46); root Manifest imports exceed the old cap 56 to 44 (issue #47). |

## Resources
- `AGENTS.md`
- `.aboardai/context/codex-implementation.md`
- `.aboardai/context/computer-use.md`
- `.aboardai/context/review-changes.md`
- `src/sales/contact.manifest`
- `src/operations/event.manifest`
- `src/features/clients/ClientDetailPage.tsx`
- `src/features/events/EventDetailPage.tsx`
- https://github.com/Angriff36/capsule/issues/32
- https://github.com/Angriff36/capsule/issues/40
- https://github.com/Angriff36/capsule/issues/44
- https://github.com/Angriff36/capsule/issues/46
- https://github.com/Angriff36/capsule/issues/47

## Visual/Browser Findings
- Existing Playwright snapshots show the app at Clerk's “Checking your session…” state in a fresh automation context; no prior authenticated storage state was found.
- A disposable Vite harness around the real `ClientCommunicationPanelView` passed in Chromium. It recorded and rendered one Contact email and one Event meeting with their dates, summaries, target labels, and `Riley Stone` author snapshot.
