# Task Plan: Revenue trend dashboard

## Goal
Display invoice revenue over week, month, or quarter periods; break it down by event type, client, or service line; and compare each period with the same period in the prior year.

## Current Phase
Phase 5

## Phases

### Phase 1: Requirements and discovery
- [x] Trace invoice, event, client, service-line, route, and visual-component surfaces
- [x] Identify relevant pre-existing dirty changes and generated ownership boundaries
- [x] Confirm the revenue and date semantics available in the live data model
- **Status:** complete

### Phase 2: Plan the authored implementation
- [x] Define aggregation, prior-year comparison, filters, and empty/loading behavior
- [x] Select the smallest route and authored file set
- **Status:** complete

### Phase 3: Implement
- [x] Add authored aggregation logic and dashboard UI
- [x] Wire navigation/route access using existing patterns
- [x] Preserve unrelated user changes and generated files
- **Status:** complete

### Phase 4: Verify
- [x] Run focused static verification
- [x] Create, run, and delete a temporary Playwright verification spec
- [x] Run `bun run check`
- **Status:** complete — repository gate reached and failed on pre-existing Event feature API-path violations outside this feature

### Phase 5: Delivery
- [x] Inspect the exact feature diff and final repository status
- [x] Record verification and any proven baseline blocker
- [x] Prepare the required tagged summary
- **Status:** complete

## Decisions Made

| Decision | Rationale |
|---|---|
| Use feature-specific planning filenames | Existing shared planning files belong to the completed payroll task and must not be overwritten |
| Avoid generated/Builder-owned paths | Required by repository ownership rules |
| Treat all pre-existing changes as user-owned | Checkout was heavily dirty before this feature began |
| Count issued totals, excluding voided/written-off/deleted rows | Matches the invoice lifecycle without confusing billed revenue with cash collections |
| Use rolling 13-week / 12-month / 8-quarter windows | Keeps charts readable while revealing short and seasonal patterns |
| Use the existing single Catering services classification | The source has no invoice lines or business service-line allocation; inventing a split would be misleading |
| Build a dependency-free accessible SVG chart plus table | Avoids lockfile churn and keeps exact values available to all users |

## Errors Encountered

| Error | Attempt | Resolution |
|---|---:|---|
| Initial broad memory search output was truncated | 1 | Use narrow exact searches only if prior context is needed |
| Search included nonexistent `src/crm` | 1 | Use `src/operations/event.manifest`, which owns Client in this checkout |
| Playwright availability probe returned exit 1 after finding the binary | 1 | The trailing search only had missing optional config paths/no matches; use explicit path checks |
| Presentational-component patch missed Prettier-compacted lines | 1 | Re-read the exact formatted function and patch against current text |
| First Playwright run timed out while its in-process Vite server optimized the dirty workspace | 1 | Stopped only the spawned Playwright process tree and switched the temporary spec to the repository's already-running documented server on port 7811 |
| `bun run check` failed at `check:event-manifest` | 1 | Preserve unrelated Event files; run the remaining feature-relevant gates separately and report the baseline blocker |
| Full tests and format check expose unrelated dirty-worktree failures | 1 | Keep the feature scope narrow; verify feature paths directly and report baseline counts without editing those files |

## Known Repository Blockers

- Event hook API-path violations: https://github.com/Angriff36/capsule/issues/40
- Event approval cascade executes invoice work under the caller's non-finance role: https://github.com/Angriff36/capsule/issues/32
- Repository format gate scans unformatted AboardAI/browser artifacts: https://github.com/Angriff36/capsule/issues/41

The plan remains in `codex-plans/` rather than being archived because the required full repository gate is not green.
