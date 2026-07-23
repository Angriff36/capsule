# Task Plan: Proposal PDF export

## Goal

Render a styled, downloadable proposal PDF containing the event overview, proposed menu with per-person pricing, total estimate, validity date, and terms.

## Current Phase

Phase 5: delivery

## Phases

### Phase 1: Requirements and discovery

- [x] Trace proposal, event, menu, pricing, and existing PDF patterns
- [x] Identify the smallest authored UI seam and avoid generated paths
- [x] Record baseline dirty files that overlap likely implementation files
- **Status:** complete

### Phase 2: Plan

- [x] Define data inputs, document layout, download behavior, and route placement
- [x] Define focused verification and required full gate
- **Status:** complete

### Phase 3: Implement

- [x] Add authored PDF rendering/export code
- [x] Wire the export into the relevant authored proposal UI
- [x] Preserve all unrelated user changes
- **Status:** complete

### Phase 4: Verify

- [x] Run focused static/runtime checks
- [x] Create, run, and delete a temporary Playwright verification spec
- [ ] Run `bun run check`
- **Status:** blocked by pre-existing Event integration-guard failures tracked in GitHub issue #40

### Phase 5: Review and delivery

- [x] Inspect the exact feature diff and final status
- [x] Record resolved issues in `fixes.md`
- [x] Deliver the required tagged summary
- **Status:** complete

## Constraints

- Do not edit Builder/Manifest generated or owned paths.
- Do not add or expand permanent tests; the requested Playwright spec is temporary and must be deleted.
- Do not overwrite or clean unrelated dirty work.
- Use Bun project commands and the repository's existing patterns.

## Errors Encountered

| Error | Attempt | Resolution |
| --- | --- | --- |
| A PowerShell `rg` pattern for JSX `type="date"` lost escaping and failed regex parsing | 1 | Use fixed-string search or single-quoted PowerShell arguments on the next lookup |
| TypeScript rejected a spread from a conditional color tuple | 1 | Store the selected tuple, then pass its three indexed channels to `setTextColor` |
| Parallel Playwright discovery aborted when one optional lookup returned exit 1 | 1 | Treat optional-file/no-listener probes independently so absence does not cancel the remaining checks |
| Combined PowerShell cleanup command was rejected by tool policy | 1 | Delete each exact verified temporary path separately with native PowerShell |
| Focused format check found the post-render fill edit unformatted | 1 | Run Prettier on the feature helper, then restart the focused gates |
| `bun run check` stopped at the Event Manifest guard on two unrelated untracked Event files | 1 | Preserve concurrent work; confirm the exact blocker is already tracked in GitHub issue #40 |
