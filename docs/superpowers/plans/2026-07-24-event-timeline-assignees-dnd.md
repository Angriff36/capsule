# Event Timeline Assignees + DnD Implementation Plan

> **For agentic workers:** Execute inline in this session. Capsule rule: do **not** add tests unless the owner asks — verify via UI / Capsule MCP.

**Goal:** Timeline blocks are drag-reorderable (times follow with durations+gaps), assignable to Everyone/FOH/BOH and event staff, with per-block Questions; event-wide comments live on Overview.

**Architecture:** Authored UI only under `src/features/events/`. Persist via existing `EventTimelineActivity_adjust` and `EventTimelineComment` post with `activityId`. Pure reorder math in a small manager module.

**Tech Stack:** React, Convex hooks from `manifest-convex-react`, HTML5 DnD, existing Capsule UI classes (`btn`, `input`, `field-label`).

## Global Constraints

- No Manifest/schema changes; no `manifest:regen` required
- No new npm dependencies
- No agent-authored tests
- No commit unless owner asks
- Staff picker = event `EventAssignment` roster only (+ Everyone/FOH/BOH)
- Event-wide comments: `activityId` null/undefined only

## File map

| File                                                  | Responsibility                                            |
| ----------------------------------------------------- | --------------------------------------------------------- |
| `src/features/events/timelineSlotRemapper.ts`         | Remap starts/ends after reorder (durations + gaps)        |
| `src/features/events/eventTimelineStaffRoster.ts`     | Resolve assignable people for an event                    |
| `src/features/events/EventTimelineAssigneePicker.tsx` | Multi-select teams + people                               |
| `src/features/events/EventTimelineBlockQuestions.tsx` | Collapsible per-block comments                            |
| `src/features/events/EventTimelineActivityList.tsx`   | DnD list + wire picker/questions                          |
| `src/features/events/EventTimelinePanel.tsx`          | Sort by sortOrder; handlers for reorder/assignees; roster |
| `src/features/events/EventTimelineTab.tsx`            | Remove event-wide comments                                |
| `src/features/events/EventOverviewTab.tsx`            | Mount event-wide comments                                 |
| `src/features/events/EventTimelineCommentsPanel.tsx`  | Filter event-wide only; Overview-friendly copy            |
| `timelineAssigneeOptions.ts`                          | Reuse as-is                                               |

---

### Task 1: Slot remapper + staff roster helpers

**Files:**
- Create: `src/features/events/timelineSlotRemapper.ts`
- Create: `src/features/events/eventTimelineStaffRoster.ts`

- [ ] Implement `TimelineSlotRemapper.remap(orderedIds, activitiesById)` → `{ id, startsAt, endsAt, sortOrder }[]`
- [ ] Implement `EventTimelineStaffRoster.fromAssignments(...)` → `{ personId, label }[]`

---

### Task 2: Assignee picker + block questions components

**Files:**
- Create: `src/features/events/EventTimelineAssigneePicker.tsx`
- Create: `src/features/events/EventTimelineBlockQuestions.tsx`

- [ ] Picker toggles teams + people; calls `onChange({ teams, personIds })`
- [ ] Questions: collapse/expand, post with `activityId`, list/remove like event panel

---

### Task 3: Wire Timeline list + panel

**Files:**
- Modify: `EventTimelinePanel.tsx`, `EventTimelineActivityList.tsx`

- [ ] Sort: `sortOrder` asc, then `startsAt`
- [ ] DnD reorder → remapper → sequential `adjust`
- [ ] Assignee save → `adjust` with teams/personIds + `responsibleParty` label
- [ ] Template/add: seed `assigneeTeams` / `sortOrder` when applicable
- [ ] Replace free-text responsible party in Adjust with assignee picker

---

### Task 4: Move event-wide comments to Overview

**Files:**
- Modify: `EventTimelineTab.tsx`, `EventOverviewTab.tsx`, `EventTimelineCommentsPanel.tsx`

- [ ] Timeline drops panel
- [ ] Overview mounts panel
- [ ] Panel filters `!activityId`; copy says planning-day notes on Overview

---

### Task 5: Verify

- [ ] `bun run typecheck` (or focused tsc) green for touched files
- [ ] Manual: drag, assign, block question, Overview comments
- [ ] Sonar analyze touched files; re-enable automatic analysis
- [ ] Write user work report to `C:\Users\Ryan\Documents\work-report.md`
