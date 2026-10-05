# Findings and decisions

## Requirements
- Restore filters, sort, pagination, and scroll after list-to-detail navigation.
- Provide safe browser-back and visible return-link behavior for the listed routes.
- Verify with a temporary Playwright test and leave evidence under `.artifacts/`.

## Research findings
- The worktree has an incomplete prior implementation in `src/features/list-state/`, Events, Kitchen, shell, saved views, and virtual scrolling.
- The shell has one persistent `<main>` scroller; current restoration saves during passive cleanup and observes the scroller rather than its changing workspace content.
- Existing Events and Kitchen list state is query-backed but schemas are recreated on every render, and saved views use `location.search.length` instead of recognized-list-state detection.
- Existing list/detail links outside Events and Kitchen are direct links with no origin state, so route coverage needs focused integration rather than a global route interception.
- Round-3 remediation must preserve all prior in-progress feature changes while replacing incomplete free-function state/scroll behavior with the requested focused manager structure.
- Repository-design rules require this authored UI work to retain the established visual language; no visual redesign is needed for URL and navigation behavior.

## Technical decisions
| Decision | Rationale |
|---|---|
| Inspect existing patterns before broad edits | Route and detail-page coverage must match the application’s actual paths and links. |
| Use `ReturnToListLink` for visible list returns | It retains normal anchor behavior for modified clicks and only consumes browser Back when the stored predecessor is exact. |

## Issues encountered
| Issue | Resolution |
|---|---|
| | |
