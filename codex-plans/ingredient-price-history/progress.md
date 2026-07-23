# Progress Log: Ingredient purchase price history

## Session: 2026-07-22

### Phase 1: Requirements and discovery

- **Status:** in progress
- Read the project rules supplied for the checkout.
- Read the planning-with-files and Playwright skill instructions.
- Pinned branch, HEAD, dirty status, and Playwright prerequisite availability.
- Confirmed existing planning files belong to other features and created an isolated task plan.
- Located upstream recipe-cost and preferred-vendor feature evidence.
- Read the binding domain-gating, no-invented-deferrals, and command-contract guidance.
- Located the authored receipt domain in `src/procurement/order.manifest` and the UI in `src/features/inventory/VendorOrderPage.tsx`.
- Confirmed inventory stock has a separate mutable `unitCost`, while recipe costing currently accepts `Ingredient.costPerUnit`.
- Traced the exact receipt command/event and confirmed vendor provenance is available through the order relation.
- Traced the recipe calculator integration and Ingredient detail page.
- Selected the domain model and UI integration approach; no new restrictive guard is needed.

### Phase 3: Implement

- **Status:** in progress
- Added required receipt-time `unitPrice` and retained it as the line's latest confirmed cost.
- Added immutable `IngredientPriceObservation` rows created idempotently from each receipt event.
- Added an authored newest-price selector with catalog fallback for recipe costing.
- Added a vendor-filterable ingredient price ledger with trend line, change summary, and receipt history.
- Added receipt UI entry/display and responsive ledger styling.
- Ran `bun run manifest:regen`; Builder applied the new generated entity, command signature, query/hook, reaction, schema, and companion artifacts with no conflicts or assembly errors.
- Inspected the generated reaction and corrected exact-payload retry handling before verification.

## Verification Results

| Check | Result |
| --- | --- |
| Builder regeneration | Pass: no conflicts, complete assembly, 0 errors/blockers |
| TypeScript | Pass: `bun run typecheck` |
| Focused existing tests | Pass: 6 files / 313 tests |
| Temporary Playwright browser test | Pass: 1 Chromium test in 2.3s; newest price, vendor filter, change calculation, and reactive new receipt verified |
| Culinary/supply integration guards | Pass |
| Feature-targeted Prettier check | Pass |
| Secret scan | Pass: fixture detected, tracked files clean |
| Production build | Pass: 590 modules transformed |
| Full existing suite | 479 passed; 12 unrelated failures across Event integration, navigation, and cascade invoice authorization |
| Required `bun run check` | Blocked at unrelated `check:event-manifest`; GitHub #40 and #32 are open |

### Phase 4: Verify

- **Status:** in progress
- Reused the already-running user Vite server at `http://localhost:7811`; did not start, restart, or stop it.
- Created a disposable Vite harness and Playwright spec importing the real helper/component.
- Verified the newest confirmed receipt overrides catalog price for recipe costing.
- Verified vendor filtering recalculates latest price and percentage change.
- Verified adding a newer receipt updates the recipe price and trend ledger.
- Deleted the temporary HTML, TSX harness, and Playwright spec after the passing run.
- Ran `bun run check`; it stopped at unrelated Event direct-hook violations already tracked by open GitHub issue #40.
- Updated culinary and weekly purchasing documentation with receipt-price, observation, recipe-cost, and stock-boundary behavior.

### Phase 5: Delivery

- **Status:** complete
- Confirmed the temporary Playwright files are deleted.
- Ran targeted `git diff --check`; feature files are clean.
- Reviewed the authored/generated file set and preserved unrelated dirty work.
- Kept this plan unarchived because the required repository-wide gate remains blocked outside the feature.

## Error Log

| Error | Attempt | Resolution |
| --- | --- | --- |
| Combined skill/memory command returned nonzero when optional memory grep found no match | 1 | Separated required reads and made optional searches non-failing |
| `rg` received the Windows-incompatible literal path `src/**/*.manifest` | 1 | Search concrete source roots/files instead of shell glob arguments |
| A nested-quote regex for policy combinations was malformed | 1 | Use concrete-file inspection; no custom command policy is required by the selected design |
| Prettier rejected `src/procurement/order.manifest` because it has no registered parser | 1 | Re-run Prettier only for TS/CSS/Markdown and let Manifest compilation validate source formatting |
| Generated matched-reaction path reran `record` against an already-observed row | 1 | Allow only an exact same-payload replay and preserve the original observation timestamp |
| Expected root `playwright.config.ts` was absent | 1 | Use Playwright's default discovery with an explicit temporary spec path, matching prior repository verification |
| Combined PowerShell server/test/cleanup command was rejected by the command policy | 1 | Use a yielded `bun run dev` cell and terminate that exact cell through the tool after Playwright completes |
| `bun run check` stopped at `check:event-manifest` on direct Convex hooks in two unrelated Event files | 1 | Preserve concurrent Event work; verify the existing GitHub escalation and report the blocked full gate separately from passing feature checks |
| Full `bun run test` had one stale governed-creation expected entry from this feature plus 12 unrelated failures | 1 | Add only the new generated mapping to the existing invariant; leave Event/navigation failures untouched |
| Repository-wide `git diff --check` reports pre-existing trailing spaces in `AGENTS.md` and `docs/commands.md` | 1 | Do not alter unrelated user files; keep feature-targeted Prettier check as the formatting proof |
| PowerShell parsed `-or` as a `Test-Path` parameter in a temporary-file assertion | 1 | Check exact temporary paths with `Get-ChildItem`/individual parenthesized expressions |
