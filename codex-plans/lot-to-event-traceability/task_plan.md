# Lot-to-event traceability implementation plan

## Goal

Given a supplier lot number or receipt date range, show every event that consumed inventory from matching lots, including the affected client, consumption quantity, and traceability details.

## Constraints

- Preserve the extensive pre-existing dirty and untracked work; do not revert or reformat unrelated files.
- Author domain changes only in `src/**/*.manifest` and UI/seam changes in authored paths.
- Never hand-edit generated ownership paths; use `bun run manifest:regen` if source changes require generation.
- Follow the existing InventoryLot and event reservation/consumption model instead of inventing parallel records.
- Do not add permanent tests. The requested Playwright verification spec must be temporary and deleted after the run.
- Use repository-standard `bun` commands and run `bun run check` before claiming completion.

## Phases

- [x] Trace the live lot, reservation consumption, event, and client data model plus existing report/navigation patterns.
- [x] Record the smallest source-first design and exact owned/authored file boundaries.
- [x] Implement the traceability report and any necessary governed provenance changes.
- [x] Regenerate through Builder if needed and inspect the generated result.
- [x] Run focused existing verification and the required `bun run check` gate. (feature-local checks passed; full gate stopped on unrelated open issue #60)
- [x] Create, run, and delete the temporary Playwright verification test.
- [x] Archive the completed plan and deliver the exact required summary.

## Current decision

- Build on the in-progress immutable `InventoryLot` receipt facts already present in this checkout.
- Add optional `inventoryLotId` provenance to `InventoryReservation.reserve`, validate a supplied lot against the same ingredient/location as its stock item, preserve it through reserve/consume events, and let legacy/unattributed stock remain explicit rather than guessed.
- Make the event allocation coordinator lot-aware when lot data is supplied: allocate oldest receipts first, split reservations at lot boundaries, subtract active and consumed lot allocations, and cap all allocations by aggregate stock availability.
- Add `/inventory/traceability` as an authored, print-ready incident-response report using generated list hooks. Filters support supplier lot text and lot receipt-date range; results join consumed reservations to lots, events, and clients.

## Errors encountered

- A combined read command exited 1 because PowerShell passed Unix-style wildcard path arguments (`src/features/inventory/*.tsx`) to `rg` as invalid literal Windows paths. Earlier source output completed successfully. Future searches will use `--glob` from the repository root.
- A later StockBook search used a quoted alternation that PowerShell truncated before `rg`, producing an unclosed-regex error after the useful source reads completed. Future inspection uses fixed-string searches or direct line ranges.
- Targeted Prettier exited 1 after formatting the TypeScript/CSS targets because Prettier has no parser for `.manifest`. The Manifest source was left as authored; the remaining Markdown plan files will be formatted separately and Manifest syntax will be verified by Builder.
- Focused supply/contract verification produced two unrelated baseline failures: the supply guard rejects the pre-existing untracked `InventoryAuditLogPage.tsx` direct `convex/react` action hook, and the existing inventory command runtime proof fails while seeding an approved Event because a generated `Invoice.issue` reaction requires `financeAccess`. The feature-local coordinator tests and all 345 generated contract tests passed. These baseline blockers will be checked against existing GitHub issues and the affected concurrent files will not be edited.
- The first temporary Playwright run failed before browser launch because `webServer.command` is resolved from the config directory, duplicating `output/playwright` in the Vite config path. The command was corrected to the config-directory-relative filename before retrying.
- The first receipt-date semantics patch did not apply because Prettier had compacted the expected multiline condition. The patch made no changes; the current formatted source was re-read and the correction was split into exact smaller hunks.
