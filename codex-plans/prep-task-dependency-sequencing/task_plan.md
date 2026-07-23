# Task Plan: Prep task dependency sequencing

## Goal

Allow a PrepTask to declare predecessor tasks and prevent starting dependent work in both the Prep Board and KDS until every prerequisite is complete.

## Current Phase

Phase 5 — complete; full repository gate has an unrelated baseline blocker

## Phases

### Phase 1: Discover the live implementation

- [x] Trace PrepTask source, generated contracts, authored UI, KDS, and start commands
- [x] Separate pre-existing dirty work from this feature's edit surface
- [x] Confirm the correct Manifest representation and regeneration boundary
- **Status:** complete

### Phase 2: Plan the smallest implementation

- [x] Define domain fields/commands and dependency evaluation behavior
- [x] Define Prep Board and KDS start-state presentation
- [x] Select focused verification and temporary Playwright flow
- **Status:** complete

### Phase 3: Implement

- [x] Update authored Manifest source and regenerate only through `bun run manifest:regen`
- [x] Update authored UI/seams without hand-editing generated files
- [x] Preserve unrelated user changes
- **Status:** complete

### Phase 4: Verify

- [x] Run focused type/static verification
- [x] Create, run, and delete the requested temporary Playwright spec
- [x] Run `bun run check` and record its unrelated Event integration-guard blocker
- **Status:** complete with unrelated repository-gate blocker documented

### Phase 5: Review and deliver

- [x] Inspect the exact diff and final status
- [x] Record resolved issues in `codex-plans/fixes.md`
- [x] Keep the plan in place because the required full repository gate is not green
- [x] Provide the required tagged summary
- **Status:** complete

## Constraints and Decisions

| Item | Decision |
| --- | --- |
| Dirty checkout | Treat every pre-existing modification and untracked file as user-owned |
| Generated files | Never hand-edit; regenerate only with `bun run manifest:regen` if source changes require it |
| Tests | Do not add permanent tests; the owner requested one temporary Playwright spec and deletion after use |
| Guard behavior | Block only the concrete harmful action: starting a task before predecessors are complete |
| Planning files | Use an isolated feature directory because the shared default plan belongs to payroll work |
| Domain model | Normalize dependencies as immutable `PrepTaskDependency` edges; the dependent relation is declared first so generated inverse hydration uses `dependentTaskId` |
| Start authority | Use a named Manifest constraint over live predecessor status, not an app-only guard |
| Declaration UX | Add predecessor selection to new-task creation; this avoids cycles without a speculative dependency editor |
| UI behavior | Disable only Start when unresolved; keep Claim, Complete, quality, and lead actions available |
| Browser proof | Exercise both Prep Board and KDS against the running app with a temporary Playwright spec, then delete it |

## Errors Encountered

| Error | Attempt | Resolution |
| --- | --- | --- |
| PowerShell `rg` rejected wildcard paths such as `playwright.config.*` | 1 | Use `rg --files` and explicit discovered paths instead of Windows wildcard arguments |
| `rg` rejected a backreference in a default-regex relationship search | 1 | Split the search into simple patterns instead of relying on PCRE backreferences |
| Combined Manifest parser/fixture inspection returned exit code 1 without output | 1 | Run explicit file reads and file discovery as separate commands to identify the missing path |
| Focused Prettier command could not infer a parser for `task.manifest` | 1 | Exclude Manifest DSL files from Prettier and format only supported TS, CSS, and Markdown files |
| Generated nested start constraint failed TypeScript because hydrated `predecessorTask` is not part of the persisted Convex `Doc` type | 1 | Keep the normalized edge but persist `isSatisfied`, initialize it from predecessor status, and update it through a generated `PrepTaskCompleted` fan-out reaction |
| Combined Playwright state discovery returned exit code 1 when an `rg` path had no matches | 1 | Inspect directories and environment separately with non-failing PowerShell enumeration |
| A previously listed temporary overtime Playwright spec was removed before inspection | 1 | Treat it as another task's expected temporary-spec cleanup; discover remaining harness files without touching its artifacts |
| Temporary Playwright web server doubled the harness path and could not resolve its Vite config | 1 | Use the config-directory-relative `vite.config.ts` command because Playwright starts `webServer` from the Playwright config directory |
| `bun run check` stopped at the Event Manifest integration guard on pre-existing Event files outside this feature | 1 | Preserve unrelated Event work; record the exact failures and run focused production, type, format, secret, test, and build verification |
| Existing Prep Board presentation test mock omitted the new dependency list/create hooks | 1 | Extend only the existing full-module mock surface with empty/no-op dependency hooks; do not add or broaden test assertions |
| Final parallel TypeScript/test/build run caused the previously passing culinary runtime test to exceed its 5s timeout | 1 | Do not relax tests; rerun verification sequentially to avoid local CPU contention |
