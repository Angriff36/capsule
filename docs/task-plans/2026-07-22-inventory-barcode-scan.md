# Inventory Barcode Scan

## Outcome

Implemented a Stock book receiving dock that resolves scanned Capsule InventoryItem and IngredientDemand references, narrows demand receipts to matching stock lines, and records quantity plus optional unit cost through the existing generated `InventoryItem.receiveStock` command.

## Design decisions

- USB scanners use a normal text input and resolve on Enter.
- Camera scanning uses the browser-native `BarcodeDetector` API and falls back to USB/manual input when unavailable.
- Accepted payloads include raw record IDs, typed `inventory:<id>` / `demand:<id>` references, JSON keys, and URL query parameters.
- Demand scans preserve Event context and narrow the stock-line choice by ingredient; they do not claim that receiving automatically fulfills demand.
- The component is prop-driven so the actual UI can be mounted with disposable fixture data for browser verification without authenticating or writing tenant data.
- No Manifest source, generated output, package dependency, lockfile, or permanent test was changed.

## Files

- `src/features/inventory/StockReceiptScanner.tsx`
- `src/features/inventory/StockReceiptScanner.css`
- `src/features/inventory/StockBookPage.tsx`
- `codex-plans/fixes.md`

## Verification

- `bun run typecheck` — passed.
- `bun run build` — passed.
- Scoped Prettier check — passed.
- `bun run secrets` — passed.
- Temporary Playwright verification — 2 passed: USB demand scan recorded the expected stock receipt, and mocked camera QR scanning resolved an InventoryItem URL. The spec, harness, bundle, screenshot, and result marker were deleted afterward.
- `bun run check` — blocked before feature checks by unrelated Event integration violations tracked in GitHub issue #58.
- `bun run check:supply-manifest` — blocked by unrelated `InventoryAuditLogPage.tsx` direct Convex hooks tracked in #61.
- `bun run test` — 526 passed and 14 unrelated failures remained across finance reaction policy (#32), Event/supply guards (#58/#61), stale createVia expectations (#62), and admin navigation expectations (#63).

## Initial checkout context

- Branch: `main`
- Starting HEAD: `a421dc5`
- The repository was extensively dirty with concurrent authored and generated work. All pre-existing changes were preserved.

