# Task Plan: Event Closeout Photo Evidence

## Goal

Allow coordinators to attach venue-condition, leftover-food, and equipment-return photos directly to an EventCloseout as durable evidence for waste claims and credit adjustments.

## Completed Phases

- [x] Trace the existing EventCloseout and field-photo dependency.
- [x] Plan an incremental Attachment metadata extension.
- [x] Implement category persistence and closeout-only category UI.
- [x] Regenerate owned outputs through `bun run manifest:regen`.
- [x] Run focused contracts and required temporary Playwright verification.
- [x] Delete this feature's temporary Playwright spec/harness and review final scope.
- [x] Run the required repository gate and record unrelated blockers.

## Decisions

| Decision | Rationale |
|---|---|
| Extend the existing Attachment path | It already owns tenant-scoped metadata, Convex file bytes, URLs, removal, and direct closeout linkage. |
| Make evidence type optional | Existing attachments and Delivery photo callers remain compatible. |
| Use typed category values | `venueCondition`, `leftoverFood`, and `equipmentReturn` remain stable and reviewable. |
| Avoid new domain guards | The UI supplies the intended values without blocking reasonable catering operations. |

## Completion Boundary

Feature-focused verification passes. Repository-wide completion remains blocked by unrelated active work documented in `progress.md` and tracked Event issues #40, #56, and #58.
