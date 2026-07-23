# Task Plan: BEO document generation

## Goal
Compile an event's operational details into a polished single-page BEO and let authorized app users download it as a PDF from the event record.

## Current Phase
Phase 5

## Phases

### Phase 1: Requirements and discovery
- [x] Capture the requested BEO fields and Playwright requirement
- [x] Confirm no concurrent process is actively rewriting the relevant files
- [x] Trace the current event detail data, navigation, PDF helpers, and styling patterns
- [x] Record authored/generated boundaries and pre-existing relevant changes
- **Status:** complete

### Phase 2: Implementation plan
- [x] Choose the smallest authored-file implementation that matches current patterns
- [x] Define the single-page layout and resilient missing-data behavior
- [x] Define focused verification steps without adding permanent tests
- **Status:** complete

### Phase 3: Implementation
- [x] Implement BEO data compilation and downloadable PDF generation
- [x] Wire the feature into the event record UI
- [x] Preserve unrelated dirty work and avoid generated files
- **Status:** complete

### Phase 4: Verification
- [x] Run focused static checks
- [x] Run the repository-required `bun run check` gate (blocked by three unrelated raw-hook violations)
- [x] Create and run a temporary Playwright test for the core flow
- [x] Inspect the downloaded PDF visually and confirm it is one page
- [x] Delete the temporary Playwright test and harness
- **Status:** complete with unrelated repository blocker

### Phase 5: Review and delivery
- [x] Inspect the final diff and verify only intended files were changed
- [x] Record resolved issues in the append-only fixes log
- [x] Provide the exact required `<summary>` handoff
- **Status:** complete with unrelated repository blocker recorded

## Key Questions
1. Which current event, client, venue, menu, timeline, and staff fields are already available on the event detail page?
2. Is the existing untracked `beoPdf.ts` part of active concurrent work or stable pre-existing work to preserve and complete?
3. What PDF library and branding helpers are already used in the app?
4. How can the core download flow be verified in Playwright without durable production writes?

## Decisions Made
| Decision | Rationale |
|---|---|
| Use a task-specific plan directory | The shared `codex-plans/` files already belong to other active tasks. |
| Do not touch generated ownership paths | Root project instructions explicitly prohibit hand-editing them. |
| Use `EventAssignment` plus `Person` for the staffing section | It is the canonical authored model for a person assigned to an event in an operational role. |
| Disable BEO download until every source query resolves | A source-of-truth document must not silently omit late-loading timeline, menu, client, or staffing data. |
| Use a fixed letter page with a compact overview, three operational columns, and a special-instructions band | The layout keeps the document scannable for team leads while enforcing one page without pagination. |
| Fit section typography to the available area instead of adding pages | This preserves the single-page contract and retains all list entries for realistic event sizes. |
| Verify with a temporary Playwright spec using Bun, then remove it | The user explicitly requires a temporary Playwright test, while project rules prohibit permanent test expansion. |

## Errors Encountered
| Error | Attempt | Resolution |
|---|---:|---|
| Batched template/status/memory read returned a generic exit 1 | 1 | Split the checks; templates and repository status succeeded, while the exact memory search had no match. |
| Initial temporary-verification patch used update directives for new files | 1 | Reissued the patch with add-file directives; no repository source was changed by the failed attempt. |
| `bun run check` found Event Detail using a raw timeline query | 1 | Replaced the BEO source query with generated `useListEventTimelineActivity` and scoped the list to the current event. Unrelated raw-hook violations remain outside this feature. |
| Final hygiene `rg` regex was malformed by shell quoting | 1 | Re-ran with a PowerShell single-quoted regex; no source edit was needed. |

## Constraints
- Preserve all unrelated dirty and untracked work.
- Do not create or expand permanent tests.
- Use Bun commands from repository instructions; do not use npm/npx for repo workflows.
- Use `bun run manifest:regen` only if Manifest regeneration becomes necessary.
- Do not commit, push, deploy, or merge.
