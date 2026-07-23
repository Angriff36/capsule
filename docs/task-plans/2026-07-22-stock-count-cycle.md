# Stock count cycle — implementation record

**Date:** 2026-07-22  
**Route:** `/inventory/counts`

## Outcome

Capsule now supports location-scoped physical stock counts. Starting a session freezes the governed quantity for every stock line in the selected storage locations. Staff move line by line, record or revise the physical quantity, reconcile against the live ledger, post a reasoned adjustment only for a real difference, and close the session only after every line is reconciled.

The session rail resumes in-progress counts before closed history, then orders each group by newest start time.

## Source and generated surfaces

- Authored domain: `src/inventory/stock-count.manifest`
- Authored UI: `src/features/inventory/StockCountPage.tsx` and `StockCountPage.css`
- Route/navigation: `src/app/App.tsx` and `InventoryWorkspaceNav.tsx`
- Owning documentation: `docs/systems/inventory.md`
- Generated through `bun run manifest:regen`: Convex schema/queries/mutations/http, generated hooks and contracts, schemas/wiring/seed artifacts, contract tests, ownership ledger, ER diagram, and seven StockCount command sequence diagrams

## Verification

- `bun run typecheck` — passed.
- Focused Prettier check for the authored feature surface — passed.
- `bun run build` — passed and emitted the lazy StockCount page chunks.
- Temporary Playwright verification — a fresh final run passed the visible start → freeze 10 kg → count 8 kg → post a -2 kg adjustment → reconcile 1/1 → close flow in 4.1 seconds; temporary source/config/harness files were deleted afterward.
- `bun run check:supply-manifest` — blocked by the pre-existing direct `convex/react` use in `InventoryAuditLogPage.tsx`.
- `bun run check` — ownership, proof, and registry stages passed, then the existing Event integration guard failed on unrelated Event files.
- `bun run test` — 548 passed; 14 unrelated failures remained. The 366 generated Manifest contract tests passed.

## Follow-up boundary

Keep the unrelated repository gate failures in their owning Event, audit-log, navigation, and generated-expectation workstreams. Rerun `bun run check` from a stable checkout after those concurrent changes settle.
