# Resolved Issues

Append-only log for issues resolved while implementing `stock-count-cycle`.

## 2026-07-22 — Relationship snapshot in generated createVia

- Issue: Builder generated `expectedQuantity: __draft.frozenQuantity` for a compute local that read `self.inventoryItem.quantityOnHand`; the draft has no such field.
- Fix: use `self.inventoryItem.quantityOnHand` directly in the authored `mutate` and event expressions.
- Verification: `bun run manifest:regen`, then inspect `StockCountLine_createViaFreeze` in `convex/mutations.ts`.

## 2026-07-22 — Feature CSS formatting

- Issue: focused Prettier verification rejected `src/features/inventory/StockCountPage.css`.
- Fix: ran `bunx prettier --write src/features/inventory/StockCountPage.css` only.
- Verification: the focused Prettier check passed for the page, CSS, route, navigation, and inventory docs.

## 2026-07-22 — Playwright harness collision in the shared checkout

- Issue: another stock-count session replaced and then removed the first temporary Playwright files while the browser was using them, causing Vite reloads and missing-page timeouts.
- Fix: moved the complete temporary harness to unique `codex-inventory-count.*` filenames, ran it once, then deleted the source/config files and failed-run artifacts.
- Verification: `bunx playwright test --config output/playwright/codex-inventory-count.config.ts` passed the full stock-count flow in 10.3 seconds; `output/playwright/stock-count-cycle.png` remains as visual evidence.

## 2026-07-22 — Fresh disposable Playwright state snapshots

- Issue: the final isolated harness initially updated arrays in place, so memoized page data did not observe the newly created session.
- Fix: return fresh query snapshots after every disposable external-store revision, and use the repository-local Playwright 1.61.1 CLI to avoid the cached `npx` 1.60.0 mismatch.
- Verification: the fresh start → freeze → count → adjust → reconcile → close rerun passed in 4.1 seconds; the spec, config, and harness were deleted afterward.

## 2026-07-22 — Active session resume ordering

- Issue: the session comparator placed closed sheets before in-progress sheets on reload.
- Fix: sort in-progress sessions first, then sort each status group by newest start time.
- Verification: focused typecheck and production build passed after the correction.
