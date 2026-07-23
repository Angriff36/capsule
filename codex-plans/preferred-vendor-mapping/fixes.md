# Fixes Log

## 2026-07-22

- Issue: Preferred vendor selection existed only as one unused scalar and weekly purchasing always chose the tenant default.
  Fix: Added an ordered Ingredient preference list, one governed save command, demand/need preference propagation, and a preferred-first weekly routing branch with tenant fallback.
  Commands: `bun run manifest:regen`, `bun run typecheck`, `bun run check:culinary-manifest`, `bun run check:supply-manifest`, `bun run build`.
- Issue: Manifest reaction completeness rejected relation traversal from an EventApproved fanOut.
  Fix: Refresh `IngredientDemand.preferredVendorId` through existing governed demand commands and reference the scalar in the purchase-need reaction.
  Command: `bun run manifest:regen`.
- Issue: The first disposable Playwright run resolved mismatched test packages.
  Fix: Used `playwright/test` with the matching `bunx playwright test` runner; the retry passed, then all temporary files were deleted.
  Command: `bunx playwright test output/playwright/preferred-vendor-mapping.spec.ts --reporter=line --workers=1`.
