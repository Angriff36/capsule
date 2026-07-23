# Task Plan: Google Calendar Sync

## Goal
Implement a narrow, production-shaped Google Calendar connection and synchronization path so confirmed CapsuleX events create calendar entries, reschedules update them, and cancellations remove them.

## Current Phase
Phase 5

## Phases

### Phase 1: Requirements and discovery
- [x] Capture requested lifecycle and verification requirements.
- [ ] Trace current Event shape, statuses, commands, UI, Convex seam patterns, auth/org patterns, and environment contract.
- [x] Trace current Event shape, statuses, commands, UI, Convex seam patterns, auth/org patterns, and environment contract.
- [x] Confirm candidate shared files were stable during discovery; re-check immediately before editing.
- **Status:** complete

### Phase 2: Implementation design
- [x] Select a dedicated Convex provider module plus authored library and an Administration integration page.
- [x] Define signed OAuth state, encrypted refresh-token ledger storage, deterministic Google event IDs, reconciliation, and provider error handling.
- [x] Record exact files and focused verification plan.
- **Status:** complete

### Phase 3: Implementation
- [x] Add the connection/sync backend seam without hand-editing generated files.
- [x] Add the user-facing Administration connection/status controls.
- [x] Preserve all unrelated dirty changes.
- **Status:** complete

### Phase 4: Verification
- [x] Run focused TypeScript and Playwright lifecycle checks.
- [x] Run the required repository gate (`bun run check`); document unrelated baseline blockers and issue links.
- [x] Create, run, and delete a temporary Playwright test for the core sync flow.
- **Status:** complete

### Phase 5: Delivery
- [x] Inspect the final narrow diff and verify temporary artifacts are absent.
- [x] Keep the plan in place rather than archive it because the mandatory repository gate is blocked by shared baseline issues.
- [ ] Provide the exact required `<summary>` block.
- **Status:** in_progress

## Key Questions
1. What exact Event status represents confirmed, rescheduled, and cancelled events?
2. Where can lifecycle sync run without hand-editing generated Convex files?
3. Does the repo already have an OAuth/integration settings pattern and secure per-organization token storage?
4. How can Playwright verify the feature without using a real production Google account?

## Decisions Made
| Decision | Rationale |
|---|---|
| Use a feature-specific plan directory | The shared checkout contains several concurrent feature plans and broad unrelated changes. |
| Do not add permanent tests | AGENTS.md forbids adding or expanding tests unless asked; the user asked only for a temporary Playwright verification test that must be deleted. |
| Use Google web-server OAuth with signed state and offline access | Background sync needs refresh tokens; state binds the callback to the initiating actor and tenant. |
| Use deterministic Google event IDs | Repeated reconciliation and lost ledger writes cannot create duplicate calendar entries. |
| Self-schedule reconciliation per active connection | Covers every command source without hand-editing generated mutations or crons. |
| Sync `approved` and later non-cancelled stages | `approved` is CapsuleX's confirmed stage; executing/completed events remain valid calendar history. |
| Restrict connection changes to tenant administrators | Replacing a shared organization calendar connection is a proportionate administrative action; read/status remains available to tenant users. |

## Errors Encountered
| Error | Attempt | Resolution |
|---|---:|---|
| PowerShell `rg` call used Unix-style path globs (`convex/*.ts`) and exited 1 | 1 | Use `rg ... convex` with `--glob '*.ts'`; do not repeat the invalid argument shape. |
| Brave Search helper lacked its installed `@mozilla/readability` dependency | 1 | Do not mutate the shared skill installation; use the built-in web tool restricted to official Google documentation. |
| A combined search named absent `playwright.config.ts`, causing `rg` exit 1 | 1 | Check file existence first and search only existing files. |
| Prettier reported no parser for `.env.example` | 1 | Leave the simple environment-comment edit as-is and format only TypeScript/TSX targets. |
| TypeScript did not preserve `status !== undefined` narrowing inside later event-handler closures | 1 | Bind the narrowed query result to `connection` after the loading return and use that stable value. |
| First combined narrowing patch missed Prettier-wrapped JSX context | 1 | Inspect the exact formatted lines and apply smaller targeted hunks. |
| A multi-file patch contained a malformed hunk separator | 1 | Reapply as valid, smaller file hunks. |
| `bun run check` stopped at `check:event-manifest` on seven unrelated pre-existing event-feature guard violations | 1 | Do not alter concurrent work; record the exact baseline blocker and run remaining feature-relevant gates independently. |
| Independent `bun run baseline:decay` failed because 57 root entries exceed the cap of 44 | 1 | Do not delete or move unrelated shared files; file a separate blocker issue and report it as baseline debt. |
| Full `bun run format:check` found 80 unrelated `.aboardai`/Playwright-MCP formatting warnings and a missing `test-results/.last-run.json` | 1 | Preserve `.aboardai`; inspect and remove only Playwright test artifacts created by this task, then rely on the passing narrow format check for feature files. |
| Independent production build fails because `IngredientSubstitutionEditor.tsx` imports missing generated hook `useIngredientConfigureSubstitutes` | 1 | Do not modify unrelated kitchen/generated files; search for an existing issue and escalate if needed. |
| Independent coverage suite has 14 failures across 10 unrelated test files | 1 | Preserve test/generated/domain work; classify existing issues and escalate the newly proven Event.approve → Invoice.issue authorization break. |
