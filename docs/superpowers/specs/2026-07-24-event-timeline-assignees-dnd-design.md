# Event Timeline: drag reorder, assignees, block questions

**Status:** Approved (2026-07-24)  
**Approach:** UI-only on existing Manifest fields (no schema/regen)

## Goal

On Event Details → Timeline, let ops reorder run-sheet blocks by drag-and-drop (times follow), assign Everyone / FOH / BOH and/or one-or-more event staff per block, and discuss each block in a collapsible Questions section. Move the event-wide staff discussion panel to Overview.

## Decisions

| Topic               | Choice                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------ |
| Reorder effect      | Reassign time slots: keep each block’s duration and gaps; blocks take the slots of the new order |
| Staff options       | Everyone, FOH, BOH + people already on this event’s Staffing roster                              |
| Event-wide comments | Move existing panel from Timeline → Overview                                                     |
| Per-block comments  | Collapsible Questions on each block (`activityId` set)                                           |
| Schema              | No Manifest/schema changes                                                                       |
| DnD                 | HTML5 drag-and-drop; no new dependency                                                           |

## Existing domain (use, don’t reinvent)

- `EventTimelineActivity`: `sortOrder`, `assigneeTeams`, `assigneePersonIds`, `responsibleParty` (legacy label for BEO), `startsAt` / `endsAt`
- Commands: `schedule` / `adjust` / `remove` (adjust accepts sort + assignees + times)
- `EventTimelineComment`: optional `activityId` (null = event-wide)
- Helpers: `src/features/events/timelineAssigneeOptions.ts`
- Staff roster: `EventAssignment` for the event + `Person` names

## UX

### Timeline

1. Blocks listed by `sortOrder` (then `startsAt` as tie-break).
2. Drag handle / card drag → drop target → persist new `sortOrder` and remapped `startsAt`/`endsAt` via `adjust`.
3. Multi-select assignees on each card; save `assigneeTeams` + `assigneePersonIds`; sync `responsibleParty` to the formatted label.
4. Collapsible **Questions** under each block; post/list/remove comments with that `activityId`. Collapsed by default; show count when > 0.
5. Remove event-wide comments panel from Timeline tab.

### Overview

- Mount the existing event-wide comments panel (filter: `activityId` null / unset) under Overview.

### Adjust form

- Keep name / times / notes / site notes.
- Replace free-text “Responsible party” with the same multi-select (or rely on card control only — prefer one multi-select on the card + Adjust to avoid two sources of truth).

## Data flow

1. **Reorder:** compute ordered ids → build slot list from previous ordered windows (start/end pairs) → zip durations onto slots preserving gap structure → N× `EventTimelineActivity_adjust` with `sortOrder`, `startsAt`, `endsAt`, `version`.
2. **Assignees:** `adjust` with `assigneeTeams`, `assigneePersonIds`, `responsibleParty: formatAssigneeLabel(...)`, `version`.
3. **Block comment:** `EventTimelineComment` create via `post` with `eventId` + `activityId` + author fields (same as today).
4. **Event comment:** same post without `activityId`; UI lives on Overview.

## Out of scope

- Batch reorder Manifest command
- Assigning people not on the event roster
- Changing comment permissions / new roles
- New tests (repo rule: no agent-authored tests unless asked)
- Drag that packs/removes gaps or pairwise-only swap

## Files (expected touch list)

- `EventTimelineTab.tsx` — drop event-wide comments
- `EventOverviewTab.tsx` — mount event-wide comments
- `EventTimelineCommentsPanel.tsx` — support event-wide vs optional rename/copy for overview; keep filtering for null `activityId`
- `EventTimelinePanel.tsx` / `EventTimelineActivityList.tsx` — sort, DnD, assignee save, wire questions
- New small modules under `src/features/events/` as needed: reorder/time-slot helper, assignee multi-select, per-block questions panel
- `timelineAssigneeOptions.ts` — reuse as-is

## Success criteria

- Drag a block; times and list order update; reload keeps new order.
- Assign FOH + a staffed person to a block; label shows both; survives reload.
- Post a question on a block; it appears under that block only.
- Event-wide comments appear on Overview, not Timeline.
