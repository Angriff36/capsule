# Findings & Decisions: Event Capacity Planner

## Requirements
- Store venue capacity per event.
- Surface a calendar heat-map for confirmed headcount versus capacity across all events in a date range.
- Flag scheduling conflicts when two events share a venue on overlapping dates.
- Explore first, plan, then implement using existing patterns.
- Verify core behavior with a temporary Playwright test and delete the test afterward.
- Finish with the exact machine-parseable `<summary>` format requested by the user.

## Repository Constraints
- Authored domain changes belong in `src/**/*.manifest`; generated Manifest/Convex/wiring/diagram outputs must never be hand-edited.
- `bun run manifest:regen` is the only permitted regeneration entry.
- Import generated Convex API through `src/lib/api.ts`.
- Do not add or expand permanent tests unless the owner asks.
- `bun run check` must pass before completion can be claimed.
- Preserve all pre-existing dirty and untracked work.

## Research Findings
- The checkout began with extensive pre-existing changes, including `src/operations/event.manifest`, event feature pages, `src/styles/app.css`, and generated ownership files.
- No directly relevant entry was found in `MEMORY.md`; current-checkout evidence will be used.
- `bun` and `npx` are both available; repository commands will use `bun`.
- The Vite app is already running on the documented `http://localhost:7811`, and multiple Convex dev processes are active.
- Other active AboardAI/Codex/Claude sessions are present. `.builder/ownership.json` changed at 06:55 on 2026-07-22, only minutes before this task began, which is current evidence of concurrent regeneration/worktree mutation.
- Other feature-specific plans currently marked in progress are `client-communication-log` and `equipment-maintenance-log`; neither names this feature, but both may touch shared app routing, styles, generated ownership, and domain output.
- Event-authored files already carry substantial pre-existing diffs: `src/operations/event.manifest` (+104 lines), `EventCreatePage.tsx`, `EventsListPage.tsx`, shared `App.tsx`, `nav.ts`, and `app.css`.
- `Venue` already has required nonnegative `capacity`, provided by `Venue.register` and editable through a separate venue command.
- `Event` currently stores a venue snapshot (`venueId`, `venueName`, `venueAddress`) but not capacity; adding `venueCapacity` to Event and carrying it through `planEngagement`/`changeVenue` matches the existing snapshot pattern and the explicit request to store capacity per event.
- `Event` already has nullable `startsAt`/`endsAt`, required `expectedHeadcount`, and lifecycle stage. The interval invariant requires `endsAt > startsAt` after planning.
- Event creation already loads venues, shows selected venue capacity, and passes the selected venue snapshot fields to `useCreateEvent`; it is a natural seam to pass `venueCapacity` without adding user tedium.
- Event detail already supports changing venue and loads active venues; the venue revision seam must also pass the selected capacity so the event snapshot stays current.
- `EventsListPage` already lists all events via generated hooks and has search/stage/date sorting, but no calendar/date-range visualization.
- Domain gating guidance permits operational visibility and cautions against invented guardrails. Conflict detection should be a warning/flag, not a command-blocking policy.
- `EventGuest` exposes `rsvpStatus`, `eventId`, and `deletedAt`; the generated client already provides `useListEventGuest()`. Confirmed headcount can therefore be derived as the count of non-deleted guests with `rsvpStatus === "confirmed"` for each event.
- No existing event-calendar or capacity heat-map component exists. The nearest visual precedent is the authored revenue-trends dashboard, but this feature should use its own scoped component/CSS rather than expanding the already heavily modified global stylesheet.
- Existing routing places event subroutes under `/events/*`. A dedicated `/events/capacity` route must appear before `/events/:id` to avoid interpreting `capacity` as an event id.
- `EventsListPage` has a `PageHeader` action area suitable for a `Capacity calendar` link, avoiding a new global navigation item.
- The repository currently has no checked-in Playwright config or `.spec.ts` suite and no Playwright dependency in `package.json`. A temporary standalone config/spec will be needed and removed after the required run.
- `.aboardai/execution-state.json` confirms max concurrency 2 with this feature and `event-timeline-builder` active. The equipment feature is already verified; its lingering plan writes are closeout activity.
- Feature design direction: an editorial service ledger with a true calendar grid, using the repo's warm paper/botanical palette and event tiles whose fill intensity communicates occupancy. Conflict warnings use the established danger accent without blocking navigation or edits.
- The range is inclusive in the UI and converted to an exclusive next-day boundary for calculations. Event conflicts use exact timestamps; date cells are only presentation buckets.
- The isolated planner helper/page/CSS format cleanly and the full current TypeScript graph passes before route/domain wiring.
- The parallel timeline feature reached `verified` before capacity regeneration. Its new `EventTimelineActivity`, event detail panel, and BEO work remain present.
- Capacity regeneration changed only the expected Event schema/mutation/wiring/diagram surfaces and completed without conflicts or blockers.
- The full repository gate confirms toolchain, Builder ownership, proof emission/validation, and Manifest registry pin before stopping at issue #40. Feature-scoped formatting, secret scan, production build, TypeScript, focused tests, and Playwright all pass independently.

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Pending discovery | The implementation seam must be proven against current source and generated bindings. |
| Snapshot selected Venue capacity onto Event | This fulfills per-event storage and remains consistent with existing venue name/address snapshots. |
| Treat overlaps and over-capacity as visible warnings, not write guards | Scheduling clashes need surfacing without blocking reasonable catering operations. |
| Anchor a multi-day event to the first visible day in the selected range | Every overlapping event remains visible even when it began before the range. |
| Use current Venue capacity only as fallback | Existing rows predate the snapshot; new and revised events should use stored `venueCapacity`. |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| Broad dirty tree may contain concurrent work | Inspect timestamps, diffs, plans, and active processes before touching overlapping files. |
| Concurrent sessions are currently active and generated ownership changed recently | Continue read-only discovery only; do not edit shared authored/generated files or run regeneration until the tree is stable. |
| Expected `playwright.config.ts` was absent despite an active Playwright test-server process referencing it | Treat that file as another session's temporary artifact; do not recreate it until concurrent work settles. |

## Resources
- `AGENTS.md`
- `.aboardai/context/codex-implementation.md`
- `.aboardai/context/computer-use.md`
- `.aboardai/context/review-changes.md`

## Visual/Browser Findings
- Playwright screenshot at 1280×720 shows the planner rendered inside Capsule's existing workspace shell with a restrained warm-paper/sage masthead, prominent editorial heading, compact range controls, four readable summary cells, a clear five-step heat legend, and a true seven-column calendar grid.
- Live dev data in the default four-week range produced 13 active events, 660 recorded seats, and 3 venue overlap warnings, proving the page is using real list data rather than an empty/static mock. The current data has 0 confirmed RSVPs, which correctly leaves heat tiles at their low state; controlled Playwright assertions separately proved the over-capacity heat state.
- No clipping or horizontal collision appears in the masthead, controls, scoreboard, or legend at desktop width. The calendar intentionally scrolls horizontally below narrower viewports.
