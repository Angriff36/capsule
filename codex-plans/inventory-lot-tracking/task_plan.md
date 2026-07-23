# Inventory lot tracking implementation plan

## Goal

Attach a supplier lot number to each stock receipt and preserve the purchase-order-line link so received inventory can support traceability and targeted recalls.

## Constraints

- Preserve unrelated dirty and untracked work.
- Author domain changes in `src/**/*.manifest`; never hand-edit generated ownership paths.
- Use only `bun` repository commands and `bun run manifest:regen` for generation.
- Do not add or expand permanent tests; the requested Playwright verification spec must be temporary and deleted afterward.
- Run `bun run check` before claiming completion.

## Phases

- [x] Inspect the live receipt domain, generated hooks, and inventory UI.
- [x] Choose the smallest source-first design and record affected files.
- [x] Implement the authored Manifest/UI changes and regenerate owned outputs once.
- [x] Run focused verification and `bun run check` (focused verification passed; full gate was run and is blocked by unrelated Event guard violations tracked in #40 and #60).
- [x] Create, run, and delete the temporary Playwright verification spec.
- [ ] Archive the completed plan and summarize the result.

## Errors encountered

- A combined read command exited 1 because ripgrep rejected a literal `\n` pattern and PowerShell passed `playwright.config.*` as an invalid literal path. The useful source output completed first; future searches will use separate valid globs/patterns rather than repeat the command.
- Whole-worktree `git diff --check` exited 1 on pre-existing trailing spaces in `AGENTS.md:50` and `docs/commands.md:4`. The generated receipt/lot inspection completed first, and the feature files themselves had already passed targeted `git diff --check`; unrelated owner changes will not be reformatted.
- `bun run check` stopped at `check:event-manifest` on unrelated direct-hook/lifecycle-metadata violations in `CommandFailure.ts`, `EventAllergenBriefingPage.tsx`, `EventIncidentPanel.tsx`, and `EventTimelinePanel.tsx`. Existing issue #40 covers the allergen/incident violations; issue #60 records the expanded current blocker. No unrelated workaround was applied.

## Design decision

- Add an immutable `InventoryLot` fact for every partial vendor-line receipt, keyed by vendor order line plus cumulative received quantity.
- Require `supplierLotNumber` on `VendorOrderLine.recordReceipt`, include it in the receipt event, and create the lot through a Manifest reaction.
- Preserve direct links from each lot to vendor order line, vendor order, ingredient, location, optional demand, and optional event.
- Show the recorded lot history under each order line. Do not claim or add automatic `InventoryItem` quantity mutation; current receipt-to-stock automation remains a separate unverified behavior.

## Generated result

- `bun run manifest:regen` completed with no conflicts or assembly blockers.
- Builder added the `InventoryLot` schema/query/mutations/bindings/contracts and the generated `diagrams/sequence-InventoryLot-record.mmd` companion.
- Builder explicitly left Convex deployment as a separate follow-up; no deploy is authorized by this task.

## Verification so far

- `bun run typecheck` passed.
- `bun run check:supply-manifest` passed.
- `bun run test -- tests/supply-slice-contract.test.ts tests/manifest-convex.contract.test.ts` passed: 341 tests.
- Temporary `bunx playwright test output/playwright/inventory-lot-verification.spec.ts --reporter=line` passed: 1 test. It rendered the real `VendorOrderPage` in a Vite harness with mocked data hooks, verified an existing supplier lot and PO-line suffix, confirmed the new input is required, and observed the trimmed lot number plus exact line ID in the receipt command payload.
- The temporary Playwright spec and harness files were deleted immediately after the successful run.
- `bun run build`, `bun run secrets`, scoped Prettier, targeted `git diff --check`, and temporary-file absence checks passed.
- Full `bun run check` passed toolchain, ownership, proof emission/registry, and Manifest registry pin, then stopped at the unrelated Event Manifest integration guard; it cannot be reported green.
