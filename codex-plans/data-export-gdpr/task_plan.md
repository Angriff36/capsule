# Task Plan: Personal Data Export (GDPR / CCPA)

## Goal
Allow an organization admin to find a named client contact or staff person and download all associated organization data as a structured JSON or CSV package without database access.

## Current Phase
Complete

## Phases

### Phase 1: Requirements and discovery
- [x] Read feature metadata and domain-gating guidance
- [x] Trace admin routes, identity/contact models, generated query hooks, and existing export/download patterns
- [x] Identify target-file dirtiness and a collision-safe implementation boundary
- **Status:** complete

### Phase 2: Plan
- [x] Define export data coverage, authorization, serialization, UI, and download behavior
- [x] Record exact authored files and verification strategy
- **Status:** complete

### Phase 3: Implementation
- [x] Implement the narrow authored server/domain seam
- [x] Confirm no Manifest source change or Builder regeneration is needed
- [x] Implement the admin-facing export workflow
- **Status:** complete

### Phase 4: Verification
- [x] Run focused existing checks
- [x] Create, run, and delete a temporary Playwright test
- [x] Run `bun run check` (blocked by unrelated Event direct-hook violations)
- [x] Inspect the final scoped diff and confirm temporary files are gone
- **Status:** complete

### Phase 5: Delivery
- [x] Record resolved issues in the fixes log
- [x] Provide the exact required `<summary>` output
- **Status:** complete

## Constraints
- Preserve all pre-existing dirty and untracked work.
- Do not hand-edit generated files.
- Do not add or expand permanent tests; the requested Playwright spec is temporary and must be deleted.
- Avoid specialty-role tedium beyond the real requirement that this export is for an organization admin.
- Do not commit, push, deploy, or merge.

## Implementation Scope
- `convex/personalDataExport.ts`: authored admin-only subject listing and selected-package queries.
- `src/features/admin/personalDataExport.ts`: deterministic JSON/CSV serialization and filename helpers.
- `src/features/admin/PersonalDataExportPage.tsx`: named-person search, package preview, and one-click downloads.
- `src/features/admin/AdminWorkspaceNav.tsx`: add the Data exports tab.
- `src/app/App.tsx`: lazy route at `/admin/data-export`.
- `convex/_generated/api.d.ts`: update only through `bun run codegen`.

## Verification Strategy
- Run targeted formatting on only feature-authored TS/TSX files.
- Run `bun run codegen` and `bun run typecheck`.
- Create a disposable Playwright/Vite harness for the real export view/serializer, verify search, selection, both download formats, and parsed contents, then delete every temporary file.
- Run the required `bun run check` and classify only proven pre-existing blockers if it cannot complete.

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| Parallel discovery command returned exit 1 because PowerShell passed wildcard config paths to `rg` as invalid literal paths | 1 | Keep the successful source findings, log the error, and use `rg --files` or explicit paths for config discovery instead of repeating the command. |
| Generated-hook search returned no matches and made the second parallel command exit 1, obscuring the admin command output | 1 | Treat `rg` no-match as a valid discovery result and explicitly normalize exit code 1 in subsequent searches. |
| PowerShell policy rejected recursive removal of the validated temporary Playwright directory | 1 | Delete the known temporary files with `apply_patch`, inspect for generated remnants, and remove only any empty directory afterward. |
| `bun run check` stopped at `check:event-manifest` on pre-existing direct Convex hooks in two Event feature files | 1 | Preserve unrelated Event work; the blocker is already tracked in Capsule issue #40 and run feature-relevant downstream gates independently. |
| `bun run test` reported 13 failures across 9 existing test files | 1 | Preserve unrelated Event/finance/generated-mapping/navigation work; record the 52-file/507-test pass baseline and continue with isolated build, secret, and format checks. |
| Recompile found duplicate `dashboardPreferences` declarations/keys after another process edited the same new server file | 1 | Pause feature edits, inspect the live file and stability, then remove only this session's redundant insertion while preserving the concurrent implementation. |
| Combined schema/format/typecheck call returned nonzero after an optional actor-field `rg` had no matches, hiding parallel check output | 1 | Preserve the schema evidence, add the discovered dashboard-preference coverage, and run formatting/typecheck independently with optional searches normalized. |
| Alias-safe dashboard preference update exposed duplicate tuple/query/result entries from the earlier overlapping patch | 1 | Remove only the stale duplicate entries and rerun scoped formatting plus TypeScript. |
