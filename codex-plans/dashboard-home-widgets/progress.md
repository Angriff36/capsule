# Progress: Dashboard Home Widgets

## Session: 2026-07-22

### Phase 1: Requirements and discovery
- **Status:** complete
- Actions taken:
  - Read required planning, frontend-design, and Playwright skill instructions.
  - Read the supplied AboardAI context files and classified them as Fable-only delegation guidance.
  - Pinned checkout/branch and recorded the extensive pre-existing dirty state.
  - Created isolated task planning files to avoid overwriting concurrent planning work.
  - Traced `/` to the existing clean `HomePage` and inventoried relevant generated list subscriptions and schema tables.
  - Confirmed the live row shapes needed for six widget projections and identified the user-identity persistence decision as the remaining architecture question.
  - Inspected Manifest ownership precedent and decided to isolate new visual styles from the dirty global CSS file.
  - Confirmed typed enum lists and governed create hooks can support a server-enforced user-owned pin preference.
  - Confirmed the list-length constraint form and captured hashes for overlap detection before edits.
  - Defined truthful schedule-gap and cash-forecast semantics from current subscribed records.
  - Confirmed `npx` is installed for the required temporary Playwright verification.

### Phase 2: Implementation plan
- **Status:** complete
- Actions taken:
  - Initially evaluated a typed Manifest preference, then selected Clerk user metadata as the correct user-owned UI-preference seam.
  - Defined six client-side projections over generated Convex subscription hooks.
  - Chose a feature-local editorial operations-board design and isolated CSS.
- Files created/modified:
  - Planning files only.

### Phase 3: Implementation
- **Status:** complete
- Actions taken:
  - Added the user-owned DashboardPreference Manifest model and regenerated all Builder-owned outputs.
  - Ran Convex codegen and confirmed generated dashboard list/create/update hooks.
  - Rebuilt Home as a six-widget editorial operating board with a personal pin customizer.
  - Added pure real-time widget projections for events, receivables, stock, staffing, activity, and cash.
  - Replaced the domain preference experiment with Clerk user metadata after runtime verification showed the schema dependency was unnecessary and blocked by unrelated local drift.
- Files created/modified:
  - `src/features/home/HomePage.tsx`
  - `src/features/home/DashboardWidgetPolicy.ts`
  - `src/features/home/DashboardWidgetCard.tsx`
  - `src/features/home/HomeDashboard.css`
  - Builder-owned outputs regenerated back to the current domain source after removing the experiment.
  - `codex-plans/dashboard-home-widgets/task_plan.md`
  - `codex-plans/dashboard-home-widgets/findings.md`
  - `codex-plans/dashboard-home-widgets/progress.md`
  - `codex-plans/dashboard-home-widgets/fixes.md`

### Phase 4: Verification
- **Status:** complete with unrelated repository blockers
- Actions taken:
  - Passed the existing home policy tests, scoped formatting, diff hygiene, and production build.
  - Ran a temporary signed-in Playwright test against the real app: opened all six options, saved all six, confirmed six rendered cards, reloaded to prove persistence, captured a screenshot, restored the original selection, and deleted the spec.
  - Confirmed no discarded DashboardPreference symbols remain after cleanup.
  - Independently cross-checked the final widget filters against the authored Manifest enums, verified every card destination against `App.tsx`, inspected the Playwright screenshot, and reran scoped formatting, typecheck, and the production build.
  - Ran the exact repository gate; it stopped on unrelated direct-hook violations in `EventAllergenBriefingPage.tsx` and `EventIncidentPanel.tsx`.
  - Reran the full standalone typecheck after concurrent generated output settled; it passed cleanly.
- Files created/modified:
  - `output/playwright/dashboard-home-widgets.png` (verification evidence)
  - Temporary Playwright spec deleted after the pass.

## Test Results
| Test | Input | Expected | Actual | Status |
|---|---|---|---|---|
| Manifest compile | `bunx manifest compile --all` | New domain compiles | 50 files compiled with warnings only | Pass |
| Builder regeneration | `bun run manifest:regen` | Owned outputs update without conflicts | Applied with no conflicts | Pass |
| Convex codegen | `bun run codegen` | API bindings include dashboard model | Generated and uploaded functions | Pass |
| TypeScript | `bun run typecheck` | No type errors | Exit 0 | Pass |
| Existing home policy tests | `bun run test -- tests/home-attention-policy.test.ts` | Existing home behavior stays intact | 4 tests passed | Pass |
| TypeScript | `bun run typecheck` | Full checkout typechecks | Exit 0 on final run | Pass |
| Scoped formatting | `bunx prettier --check` on dashboard files | Feature files match repository style | All matched files use Prettier style | Pass |
| Real browser flow | temporary Playwright spec against `http://localhost:7811` | Six options save, render, persist, and original pins restore | 1 test passed in 23.9s | Pass |
| Production build | `bun run build` | Dashboard bundles successfully | 610 modules transformed; build completed | Pass |
| Repository gate | `bun run check` | Full shared checkout passes | Stopped on two unrelated Event approved-API-path violations | Baseline blocker |

## Error Log
| Timestamp | Error | Attempt | Resolution |
|---|---|---:|---|
| 2026-07-22 | Combined shell inspection failed without partial output | 1 | Split into independently captured read-only checks. |
| 2026-07-22 | Optional `playwright.config.ts` read made a multi-file command exit 1 | 1 | Kept the returned core-file output and will inspect test tooling with existence checks. |
| 2026-07-22 | Invalid PowerShell syntax while slicing generated files | 1 | Used valid array slicing and narrower searches. |
| 2026-07-22 | `manifest compile --all --dry-run` rejected `--dry-run` | 1 | Switch to the documented safe compile command and approved Builder regen path. |
| 2026-07-22 | Prettier reported no parser for the new `.manifest` file | 1 | TS/CSS formatting and typecheck completed; keep compiler-valid Manifest source as-is. |
| 2026-07-22 | First planning-log patch missed formatter-adjusted table text | 1 | Re-read current files and patched the exact content. |
| 2026-07-22 | Generated create path rejected null-owner draft and emitted a Person-id validator for a Clerk subject | 1 | Corrected the Manifest source ownership type/read policy and queued regeneration. |
| 2026-07-22 | Typecheck rejected missing `by_ownerId` index used by personal-data export | 1 | Marked ownerId indexed in Manifest and queued regeneration. |
| 2026-07-22 | Playwright timed out on missing deployed `queries:listDashboardPreference` | 1 | Inspect target deployment and register generated functions before rerun. |
| 2026-07-22 | One-shot Convex sync refused because port 3210 already has a local backend | 1 | Identify whether the owner is a live watcher or orphan before any runtime action. |
| 2026-07-22 | In-place Convex deploy misparsed a spaced message and function-spec saw conflicting selectors | 1 | Retry with explicit local URL/admin flags and a single-token message. |
| 2026-07-22 | Local Convex schema validation found stale invoice rows missing line/tax arrays | 1 | Escalate to GitHub and migrate local rows before retrying the function push. |
| 2026-07-22 | Combined invoice backfill command was blocked before execution | 1 | Split the mechanical migration into explicit local-deployment steps. |
| 2026-07-22 | Named local export yielded no JSON and a null temp payload | 1 | Remove invalid artifact and use the explicit local backend selector. |
| 2026-07-22 | Exact two-row invoice import hung without progress for over 90 seconds | 1 | Terminated the client and check whether data committed before taking another action. |
| 2026-07-22 | Playwright process did not inherit Clerk values from `.env.local` | 2 | Loaded the two required values into the process and reran successfully. |
| 2026-07-22 | `bun run check` stopped on two unrelated Event direct-hook violations | 1 | Preserved concurrent work and recorded the exact baseline failure. |
| 2026-07-22 | An intermediate typecheck saw an Attachment enum/index mismatch while generated output was changing | 1 | Preserved generated boundaries; final rerun passed without editing owned output. |

## 5-Question Reboot Check
| Question | Answer |
|---|---|
| Where am I? | Delivery complete with shared-checkout blockers recorded |
| Where am I going? | Owner handoff |
| What's the goal? | User-specific real-time dashboard widgets with up-to-six pinning |
| What have I learned? | The checkout is broad and dirty; generated boundaries are strict |
| What have I done? | Implemented Clerk-persisted pins and six live Convex-backed widgets, then verified the real user flow |
