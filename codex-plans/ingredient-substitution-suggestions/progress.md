# Progress: Ingredient substitution suggestions

## Session: 2026-07-22

### Phase 1: Requirements and discovery
- **Status:** in_progress
- Read the supplied project context and the planning/Playwright skill instructions.
- Captured the current worktree baseline: `main` is ahead of `origin/main` by 3 with extensive pre-existing modified and untracked work.
- Confirmed `npx` is available for the Playwright wrapper prerequisite, while repository commands will follow Bun conventions.
- Created isolated feature planning artifacts.
- Located existing ingredient cost/allergen fields, ingredient-to-recipe/stock relationships, ingredient demand, and the event-menu stock shortage flow.
- Detected active concurrent automation and narrowed the next step to exact target diff/hash checks before any product edit.
- Confirmed candidate ingredient/recipe changes are older, stable additions from other features and recorded their exact diffs before overlap.
- Chose a source-first design: ordered substitute IDs on Ingredient, configuration on Ingredient detail, and ranking in the existing event-menu shortage banner.
- Added authored domain configuration, a pure availability/allergen/cost ranking utility, an ingredient mapping editor, and ranked event-menu shortage suggestions.
- Formatted the new/changed TS and TSX files and confirmed scoped `git diff --check` is clean.
- Ran `bun run manifest:regen`: Builder applied the new command with zero conflicts and emitted the generated Convex/client/schema/contract/diagram artifacts.
- Ran `bun run typecheck`: passed, including the generated `useIngredientConfigureSubstitutes` hook and all new UI types.
- Created and ran the required temporary Playwright spec against a Vite-rendered production shortage banner; 1 Chromium test passed in 5.8 seconds.
- Verified ranking order, allergen warnings, cost deltas, reservation-adjusted availability, shortage coverage, exclusion of unstocked mappings, and dismiss behavior.
- Deleted the temporary Playwright spec and its temporary Vite harness after the successful run; retained only the screenshot evidence under `output/playwright/`.
- Ran `bun run check`; toolchain, ownership, proof emission/validation, and registry pin passed before the gate stopped on seven unrelated Event integration violations already tracked in GitHub issue #58.
- Ran culinary integration, scoped formatting, and secrets independently; all passed.
- Ran coverage independently; substitution-relevant Culinary and stock coordinator suites passed, while unrelated shared baseline failures remain tracked in issues #32, #57, and #58.
- Ran the production build independently; it passed with the generated substitution hook included.
- Ran baseline decay independently; it failed on the known root-entry cap mismatch tracked in issue #47 (57 current entries versus cap 44).
- Completed the final scoped diff/ownership audit: no whitespace errors, no temporary verification files, and every new capability reference is present across the Builder-owned contract surfaces.

## Test Results
| Test | Expected | Actual | Status |
|---|---|---|---|
| Manifest regeneration | Builder accepts source and emits bindings without conflict | Completed; assembly report had zero errors/blockers | Pass |
| TypeScript | New domain bindings and UI compile | `bun run typecheck` exited 0 | Pass |
| Temporary Playwright spec | Core substitution suggestions render and rank correctly in Chromium | 1 test passed; temporary spec/harness deleted | Pass |
| Full repository gate | Complete all required gates | Stopped at pre-existing Event UI integration violations; tracked in #58 | Blocked (unrelated) |
| Culinary integration | Generated culinary APIs/lifecycle remain authoritative | Passed | Pass |
| Scoped formatting | All authored substitution files follow Prettier | Passed | Pass |
| Secret scan | No committed secret values | Passed across 728 tracked files | Pass |
| Coverage suite | All tests pass | Feature-adjacent suites passed; shared baseline failures tracked in #32/#57/#58 | Blocked (unrelated) |
| Production build | Vite bundles the new editor and banner | Passed; 644 modules transformed | Pass |
| Baseline decay | Repository root-entry count is below hygiene cap | Known 57-versus-44 mismatch tracked in #47 | Blocked (unrelated) |

## Error Log
| Timestamp | Error | Attempt | Resolution |
|---|---|---:|---|
| 2026-07-22 | Broad `rg`/process output was truncated | 1 | Use narrow file/symbol reads in subsequent commands. |
| 2026-07-22 | Prettier had no parser for `ingredient.manifest` | 1 | Leave Manifest source formatting intact and validate with the required Builder regeneration command. |
| 2026-07-22 | `apply_patch` rejected an invalid hunk boundary | 1 | Reissued the same narrow CSS-class fix with valid patch syntax. |
| 2026-07-22 | `playwright.config.ts` was absent | 1 | Prepare a self-contained temporary verification without changing project dependencies. |
| 2026-07-22 | Two planning updates missed exact context | 2 | Split updates by file after re-reading current content. |
| 2026-07-22 | `bun run check` failed in `check:event-manifest` | 1 | Verified the exact existing blocker is tracked by `Angriff36/capsule#58`; do not alter unrelated concurrent Event files. |
| 2026-07-22 | `bun run test:coverage` failed in unrelated snapshots/Event/PrepBoard/Invoice proofs | 1 | Verified existing issues #32, #57, and #58 cover the distinct failures. |
| 2026-07-22 | `bun run baseline:decay` failed root-entry cap | 1 | Verified existing issue #47 covers the tooling threshold mismatch. |

## Scope Baseline
- Feature edits are limited to Ingredient domain configuration, two new authored substitution modules, narrow kitchen-page integrations, and Builder-owned generated outputs.
- Existing generated and authored changes belong to the user/other sessions and remain preserved.
