# Task Plan: Role permission audit

## Goal
Implement an admin-facing snapshot report that lists every organization member, their assigned role, the Manifest policies they satisfy, and clearly flags elevated access such as `workforceManageAccess`.

## Current Phase
Phase 5

## Phases

### Phase 1: Requirements and discovery
- [x] Capture the requested behavior and repository constraints
- [x] Determine whether overlapping dirty files are safe to edit
- [x] Trace existing organization-member, role, policy, and admin-report patterns
- [x] Document findings
- **Status:** complete

### Phase 2: Implementation design
- [x] Choose the smallest authored UI/data seam
- [x] Define snapshot contents and elevated-access presentation
- [x] Confirm no generated files need hand edits
- **Status:** complete

### Phase 3: Implementation
- [x] Implement the audit report using existing patterns
- [x] Preserve unrelated user changes
- [x] Avoid adding permanent tests unless required by the owner
- **Status:** complete

### Phase 4: Verification
- [x] Run focused static/test verification
- [x] Create and run a temporary Playwright test for the core flow
- [x] Delete the temporary test after verification
- [x] Run `bun run check` (blocked by unrelated issue #58 after earlier gates passed)
- **Status:** complete

### Phase 5: Delivery
- [x] Review the final diff for scope and generated-file safety
- [x] Archive the completed plan under `docs/task-plans/`
- [x] Provide the required exact `<summary>` handoff
- **Status:** complete

## Key Questions
1. Is the existing dirty `src/features/admin/PermissionsPage.tsx` change part of this feature or unrelated/concurrent work?
2. Where does the live app source organization membership and role data?
3. How are Manifest policies represented and evaluated in authored UI today?
4. What existing browser/auth fixture can verify the report without altering durable production data?

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Use authored seams only | Repository instructions forbid hand-editing generated Manifest and Convex outputs. |
| Treat the existing dirty tree as user-owned | The repository contains extensive pre-existing changes; only feature-specific edits may be made. |
| Use a temporary Playwright spec | The owner explicitly requires a temporary test despite the repository default against adding tests. |
| Add an authored report helper and view, then mount it in `PermissionsPage` | This keeps domain calculations testable and avoids routes, schema changes, and generated output. |
| Generate a frozen snapshot plus downloadable CSV | This gives admins a review artifact rather than a continuously changing list. |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| Initial combined inspection exited 1 because `rg` found no memory keyword match | 1 | Treat as no relevant memory hit; continue with live repository evidence and avoid repeating the broad search. |
| Combined implementation patch was rejected by the tool parser before applying | 1 | Split the change into smaller patches with safer quoting; no feature files were changed by the failed attempt. |
| Focused typecheck found a case-insensitive component/helper import collision and an implicit role-definition type | 1 | Rename the component to a distinct `RolePermissionAuditPanel` basename and annotate the inherited role definition before rerunning. |
| Initial focused Prettier check found formatting changes in the two new files | 1 | Ran targeted Prettier write, then reran typecheck and the targeted formatting check successfully. |
| First Playwright assertion for `workforceManageAccess` matched both policy chips and summaries across two elevated rows | 1 | Narrow the assertion to the workforce-manager row and use exact text for access-status counts. |
| Second Playwright access-status count included the summary metric plus two member flags | 2 | Scope elevated/standard status counts to `role-audit-member-row` locators. |
| Recursive removal of the temporary Playwright directory was blocked by the command policy before execution | 1 | Enumerate the exact files and delete them explicitly through `apply_patch`; do not retry the blocked command. |
| Required `bun run check` stops at pre-existing Event integration-guard violations | 1 | Confirm existing GitHub issue #58 covers the exact seven violations; preserve unrelated work and verify this feature independently. |
| Standalone test suite has 14 failures in unrelated dirty/generated areas | 1 | Confirm the failure classes are covered by existing issues #58, #61/#64, #62, #63, and #65; do not widen this feature into those repairs. |
| First archive patch targeted stale delivery-checklist wording | 1 | Re-read the live plan and apply the archive/checklist updates against the exact current text; the failed patch changed nothing. |
| Repository-wide `git diff --check` reports pre-existing trailing whitespace in `AGENTS.md` and `docs/commands.md` | 1 | Preserve those unrelated edits; the scoped feature diff check passes. |

## Notes
- Required gate: `bun run check`.
- Do not edit generated paths listed in `AGENTS.md`.
- Do not move or stash `.aboardai/**`.
- Stop if active concurrent edits overlap this feature.
