# Stock Count Cycle Plan

## Goal
Implement a user-facing stock count session for one or more storage locations that snapshots expected quantities, guides item counting, reconciles variances through auditable adjustment entries, and closes the session.

## Constraints
- Preserve all unrelated dirty and untracked work in the shared checkout.
- Follow Manifest/Builder ownership boundaries; never hand-edit generated paths.
- Do not add or expand permanent tests; use a temporary Playwright verification spec and delete it afterward.
- Gate only real harm and keep the workflow low-tedium for catering staff.
- Run focused verification and `bun run check`; distinguish baseline failures from this feature.

## Phases

### Phase 1: Discovery
- [x] Trace existing inventory domain, storage-location model, stock ledger, adjustment commands, UI routes, and styling patterns.
- [x] Identify active overlapping edits in the dirty checkout.
- [x] Record implementation seams and constraints.
- **Status:** complete

### Phase 2: Plan
- [x] Define the smallest coherent domain, server, and UI changes.
- [x] Confirm which authored files can be safely changed.
- [x] Define focused and browser acceptance criteria.
- **Status:** complete

### Phase 3: Implementation
- [x] Add stock-count domain/server behavior using existing source-of-truth patterns.
- [x] Add the guided inventory UI and route/navigation entry.
- [x] Regenerate only through `bun run manifest:regen` if Manifest source changes are required.
- [x] Update the owning inventory documentation where required.
- **Status:** complete

### Phase 4: Verification
- [x] Run focused static/unit verification without adding permanent tests.
- [x] Run `bun run check` (executed; stopped on unrelated Event integration guard failures).
- [x] Create, run, and delete a temporary Playwright spec for the core user flow.
- [x] Log and resolve feature-caused failures; report unrelated baseline failures separately.
- **Status:** complete with repository baseline blocker recorded

### Phase 5: Delivery
- [x] Inspect the final feature surface and preserve unrelated concurrent changes.
- [x] Archive the completed plan under `docs/task-plans/`.
- [x] Provide the exact required `<summary>` block as the final output.
- **Status:** complete

## Key Questions
1. Does the current inventory model already expose storage locations and ledger adjustments suitable for counts?
2. Can a count session snapshot expected quantities without adding broad generated-domain surface?
3. What app route and navigation pattern should the guided count reuse?
4. How can Playwright verify the core flow using disposable/local state without changing production data?

## Decisions Made
| Decision | Rationale |
|---|---|
| Isolate planning artifacts under `codex-plans/stock-count-cycle/` | The shared checkout already contains many unrelated plan folders and dirty files. |
| Use a new authored `src/inventory/stock-count.manifest` module | Keeps the count lifecycle cohesive and avoids hand-editing generated output. |
| Keep count reconciliation atomic through a Manifest reaction | Generated reactions run target commands in the same Convex mutation transaction. |
| Build a focused `/inventory/counts` workspace | It fits existing inventory routing while giving staff a guided count experience distinct from the dense stock book. |

## Errors Encountered
| Error | Attempt | Resolution |
|---|---:|---|
| `rg` could not parse `src/inventory/*.manifest` as a Windows path | 1 | Use explicit paths or `--glob '*.manifest'` on the directory. |
| PowerShell parsed the double-quoted `rg` regex as syntax | 1 | Use single-quoted regex arguments for patterns containing quotes and wildcards. |
| Builder emitted `__draft.frozenQuantity` for a relationship-backed compute local in `createViaFreeze` | 1 | Reference `self.inventoryItem.quantityOnHand` directly in the mutate and event expressions, then regenerate through Builder. |
| PowerShell parsed a double-quoted `rg` pattern containing `.*` as member-access syntax | 2 | Use only single-quoted regex arguments for the remaining repository searches. |
| Temporary Playwright spec was overwritten during execution by another stock-count session, triggering Vite reloads and a timeout | 1 | Waited for the overlapping session to remove its temporary files and for feature sources to remain stable before recreating an isolated spec. |
| Overlapping cleanup removed the temporary harness HTML before the next Playwright run | 1 | Moved every temporary verification file to a unique `codex-inventory-count.*` name before retrying. |
| `bun run check` stopped at `check:event-manifest` on unrelated event-feature API/lifecycle guard violations | 1 | Preserved concurrent event work, recorded the baseline blocker, and ran independent feature formatting, test, and build verification. |
| Focused Prettier check rejected `StockCountPage.css` | 1 | Formatted only the feature CSS and reran the exact focused check successfully. |
| Prettier could not infer a parser for `stock-count.manifest` | 1 | Removed the Manifest source from the Prettier-only check; Builder ownership already validated the generated Manifest outputs. |
