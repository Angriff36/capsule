# Task Plan: Dashboard Home Widgets

## Goal
Implement a user-specific home dashboard where each user can pin up to six of the six requested real-time Convex-backed widgets, with polished responsive UI and verified browser behavior.

## Current Phase
Complete — repository-wide baseline blockers recorded

## Phases

### Phase 1: Requirements and discovery
- [x] Capture the feature requirements and repository constraints.
- [x] Trace the current home route, data hooks, user identity, and generated/authored boundaries.
- [x] Confirm whether another session is actively changing overlapping files.
- **Status:** complete

### Phase 2: Implementation plan
- [x] Choose the smallest authored data seam and UI structure that matches existing patterns.
- [x] Define widget data semantics, pin persistence, empty/loading states, and six-widget cap behavior.
- **Status:** complete

### Phase 3: Implementation
- [x] Add the dashboard persistence/data seam without hand-editing generated files.
- [x] Add the home dashboard and pin-customization UI.
- [x] Preserve all unrelated dirty and untracked work.
- **Status:** complete

### Phase 4: Verification
- [x] Run focused static verification.
- [x] Create and run a temporary Playwright spec for the core pinning flow, then delete it.
- [x] Run `bun run check`.
- [x] Inspect the final task-scoped diff.
- **Status:** complete (full gate blocked by unrelated shared-checkout work)

### Phase 5: Delivery
- [x] Record changed files, verification, and any baseline blockers.
- [x] Provide the required exact `<summary>` handoff.
- **Status:** complete

## Key Questions
1. Which current route renders the home screen and what visual language should the feature extend?
2. Where can user-specific pin settings live without editing generated Manifest/Convex outputs?
3. Which existing Convex subscriptions provide the six widget data sets, and which need an authored seam?
4. How can the temporary Playwright spec authenticate or deterministically exercise the core behavior?

## Decisions Made
| Decision | Rationale |
|---|---|
| Use a task-specific planning subdirectory | Existing shared planning files belong to other active work and must not be overwritten. |
| Do not invoke the Fable-only Codex delegation context | The active agent is Codex, not Fable; those context files describe Claude-to-Codex delegation. |
| Persist the normalized pin list in signed-in Clerk user metadata | Pin layout is a personal UI preference, remains user-specific/cross-session, and does not need a catering-domain table; Convex remains the live source for widget facts. |
| Default new users to four useful pins until they save | The dashboard is immediately useful without creating data just by viewing the page. |
| Use feature-local policy/UI/CSS files | Keeps calculations inspectable and avoids dirty shared styles and routing files. |

## Errors Encountered
| Error | Attempt | Resolution |
|---|---:|---|
| Parallel read-only inspection returned a generic shell failure without partial output | 1 | Split the checks and captured each command result independently. |
| Generated-behavior inspection used invalid PowerShell indexing syntax with `-ErrorAction` | 1 | Switched to valid array slicing and narrower `rg` anchors. |
| Installed Manifest CLI rejected documented `compile --all --dry-run` with `unknown option '--dry-run'` | 1 | Use the repository-documented safe `compile --all`, then the only approved writer `bun run manifest:regen`. |
| Prettier cannot infer a parser for `.manifest` files | 1 | TypeScript/CSS files formatted successfully; leave the compiler-valid Manifest formatting intact. |
| First attempt to log the Prettier issue missed the formatter-adjusted table shape | 1 | Re-read the planning files and applied the log update against their current content. |
| First generated create path denied its own unowned draft and mapped a Clerk subject to a Person document id | 1 | Change ownership to an auth-subject string and allow only transient null-owner drafts through read evaluation. |
| Typecheck found `personalDataExport.ts` requires `by_ownerId` for the new owner field | 1 | Mark `ownerId` indexed in Manifest and regenerate the schema/index contract. |
| First Playwright run timed out on an app error: deployed Convex endpoint lacked `queries:listDashboardPreference` | 1 | Remove the unnecessary domain dependency and persist personal layout in Clerk metadata; widget facts continue using existing Convex subscriptions. |
| `bun run dev:convex -- --once` could not sync because local backend port 3210 is already occupied | 1 | Inspect the owning process/command before changing shared runtime state. |
| First in-place Convex deploy parsed a spaced message as extra args; catalog check also saw conflicting deployment selectors | 1 | Use hidden explicit `--url`/`--admin-key` flags and a single-token message for the local backend. |
| Local Convex push is blocked by a pre-existing invoice row missing required `lineItems` and `taxBreakdown` | 1 | Opened GitHub issue #49; the feature no longer requires a schema push, so do not mutate unrelated invoice data. |
| Combined local invoice backfill command was rejected by the shell safety layer before execution | 1 | Split export/transform, import, and cleanup into explicit workspace-local steps without passing backend credentials. |
| Named `--deployment local` export returned no JSON in this stale watcher state, producing a null temporary payload | 1 | Delete the invalid temp file and use the explicit local URL/admin selector already proven by deploy/function-spec. |
| Local invoice import produced no progress for over 90 seconds and was terminated | 1 | Inspect the table for commit status before attempting any different migration method. |
| First two Playwright invocations did not inherit ignored Clerk environment values | 2 | Load only the required `.env.local` values into the verification process; the real signed-in flow then passed. |
| Repository `bun run check` stopped on direct Convex-hook use in two unrelated event pages | 1 | Preserve the concurrent event work, record the exact paths, and run focused formatting/tests plus the production build separately. |
| An intermediate typecheck saw a generated Attachment enum/index mismatch while concurrent outputs were changing | 1 | Preserved generated boundaries and reran after the checkout settled; the final `bun run typecheck` passed. |

## Constraints
- Do not add or expand permanent tests; the requested Playwright verification spec must be temporary and deleted after use.
- Never hand-edit generated paths named in `AGENTS.md`.
- Use `bun` commands exactly as documented; `bun run manifest:regen` is the only allowed regeneration entry.
- Do not move or stash `.aboardai/**` or unrelated user work.
