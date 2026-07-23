# Progress: Prep task dependency sequencing

## 2026-07-22

- Read repository instructions plus planning, frontend, and Playwright skill instructions.
- Pinned branch and dirty working-tree state.
- Read Manifest guard-restraint, no-invented-deferrals, and blocker-escalation rules.
- Checked process state for active writers; found long-running Convex processes but no matching Codex/Claude implementation process.
- Created an isolated feature plan to avoid overwriting the existing payroll plan.
- Located PrepTask domain source, both production UI surfaces, and the generated start hook.
- Logged and corrected a PowerShell wildcard search error.
- Read the full PrepTask entity/command source and current KDS implementation.
- Identified normalized dependency edges plus a generated `count_of` start guard as the likely source-of-truth design.
- Logged a second search-only regex error and narrowed subsequent relation-syntax searches.
- Traced Prep Board creation, row actions, bulk actions, and lifecycle invocation code.
- Confirmed bulk Start requires the same dependency filtering as individual Start.
- Read Manifest through-join and nested aggregate hydration proofs; narrowed risk to self-relation edge selection.
- Verified the Convex relation planner's exact inverse-selection behavior and established a direct incoming-edge model with generated-output inspection as a required proof.
- Confirmed generated governed creation returns the new document id needed to attach selected predecessor edges.
- Confirmed constraint expressions participate in generated aggregate hydration and will surface a useful failure message through the existing banner classifier.
- Confirmed repository scripts/tooling and the absence of a committed Playwright test setup.
- Compared the target authored files to HEAD and captured their timestamps; existing bulk-action and KDS work is pre-existing user work to preserve.
- Completed discovery and implementation design; moved into authored Manifest/UI implementation.
- Added the Manifest-owned dependency edge and PrepTask start constraint.
- Added shared dependency summary logic, Prep Board declaration/row/bulk blocking, and KDS blocker presentation.
- Ran `bun run manifest:regen`; Builder applied the generated delta with no conflicts and a complete assembly report.
- Inspected generated schema, queries, hooks, and start mutation; inverse and nested predecessor hydration are correct.
- Logged the expected Prettier parser limitation for `.manifest`; rerunning formatting on supported authored files only.
- Focused formatting passed for all supported authored feature files.
- `bun run typecheck` failed on generated nested relation typing; root cause is proven and the Manifest source design is being adjusted to a persisted reaction-maintained satisfaction flag.
- Regenerated the reaction-maintained satisfaction design with no Builder conflicts and inspected all four generated paths: declaration initialization, completion fan-out, satisfaction mutation, and start rejection.
- `bun run typecheck` passes after the source-level resolution.
- Implementation phase complete; started focused and browser verification.
- `bun run check:production-manifest` passed.
- Confirmed Playwright prerequisite availability and live local app response on port 7811.
- Logged a no-match Playwright state search error; switching to explicit directory enumeration.
- Confirmed there is no repository-local Playwright auth state; investigating existing temporary harness conventions without reading secret values.
- An unrelated temporary spec disappeared as its owning task cleaned up; no feature source or generated files changed, so verification continues without touching that task's artifacts.
- Confirmed local Playwright test-runner availability; preparing an isolated temporary component harness under `output/playwright/`.
- First Playwright attempt did not start a browser because its web-server config path was doubled; corrected the temporary config for a clean rerun.
- Temporary Playwright verification passed (1 test, 3.0 seconds) across Prep Board and KDS blocked/ready states.
- Deleted the temporary Playwright spec, harness, and result file after the successful run.
- Removed the now-empty temporary verification directory.
- Filed GitHub issue #72 for the proven Manifest Convex nested aggregate relation typing defect.
- Started the required full `bun run check` gate.
- `bun run check` stopped at unrelated pre-existing Event integration guard failures before reaching later gate stages; no Event files were changed.
- Focused run: production integration guard and culinary governed-creation tests passed; Prep Board presentation rendering failed only because its full generated-hook mock lacked the two new dependency exports.
- Updated the existing Prep Board test mock only for the new generated hooks; the focused 12-test run then passed.
- Focused Prettier check, secret scan, production build, and `git diff --check` passed.
- Final review added live predecessor-complete guards to the externally callable satisfaction command before regeneration.
- Final regeneration completed without conflicts; inspected the generated satisfaction runner and confirmed both relation-existence and completed-status guards.
- Parallel final verification caused one previously passing runtime test to time out under CPU contention; switching to sequential commands without changing tests.
- Logged a no-output local Manifest inspection failure; switching to explicit paths and separate reads.
- Sequential final verification passed for typecheck, the production Manifest guard, all 12 focused tests, and the production build.
- Inspected the final authored and generated feature surface, recorded the generator workaround in `codex-plans/fixes.md`, and preserved unrelated dirty files.

## Verification log

- `bun run manifest:regen`: passed, conflict-free.
- `bun run typecheck`: passed.
- `bun run check:production-manifest`: passed.
- `bun run test tests\production-manifest-integration-guard.test.ts tests\prep-board-presentation.test.ts tests\culinary-governed-creation.runtime.test.ts`: 3 files and 12 tests passed.
- Temporary Playwright test: 1 passed in 3.0 seconds; spec, harness, results, and empty directory deleted afterward.
- `bun run secrets`: passed.
- `bun run build`: passed with only existing chunk-size and dynamic-import warnings.
- `bun run check`: reached the Event Manifest integration guard and stopped on unrelated pre-existing Event feature findings; no Event files were changed.
