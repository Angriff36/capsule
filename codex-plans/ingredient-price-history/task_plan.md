# Task Plan: Ingredient purchase price history

## Goal

Record the confirmed unit price with every vendor-order-line receipt, retain ingredient/vendor price observations over time, feed the recipe cost calculator from the newest confirmed observation, and expose price trends using authored UI plus Manifest-governed domain behavior.

## Current Phase

Phase 5

## Phases

### Phase 1: Requirements and discovery

- [x] Capture repository constraints and protect the dirty shared checkout
- [x] Trace VendorOrderLine receipt, Ingredient costing, generated hooks, and current purchasing UI
- [x] Confirm the narrowest Manifest source changes and required generated impact
- **Status:** complete

### Phase 2: Implementation plan

- [x] Define observation identity, receipt semantics, newest-price selection, and trend UI
- [x] Identify authored versus generated files and focused verification
- **Status:** complete

### Phase 3: Implement

- [x] Change authored Manifest source and UI seams only
- [x] Regenerate exclusively with `bun run manifest:regen` if domain source changes
- [x] Preserve unrelated user changes
- **Status:** complete

### Phase 4: Verify

- [x] Run focused existing tests/static checks
- [x] Create, run, and delete the temporary Playwright verification spec
- [x] Run `bun run check`
- **Status:** blocked outside feature — Event direct-hook violations stop the gate; issues #40 and #32 track the remaining baseline failures

### Phase 5: Delivery

- [x] Inspect the exact diff and status
- [x] Keep the plan unarchived because the required full gate is blocked
- [x] Provide the exact tagged feature summary
- **Status:** complete

## Key Constraints

- Do not hand-edit generated or Builder-owned paths.
- Do not add permanent tests; the owner requested only a temporary Playwright test that must be deleted.
- Read domain-gating restraint before changing Manifest policies or guards.
- Use `bun run manifest:regen` as the only regeneration entry.
- Preserve all pre-existing dirty/untracked work, including `.aboardai/**`.

## Errors Encountered

| Error | Attempt | Resolution |
| --- | --- | --- |
| Initial parallel skill/memory read stopped when the memory search had no matches | 1 | Read the skills directly and made subsequent optional searches explicitly non-failing |
| PowerShell passed `src/**/*.manifest` literally to `rg` | 1 | Search source roots and concrete files |
| Nested quoting produced an invalid policy-search regex | 1 | Inspect concrete source; selected design does not need command-policy syntax |
| Prettier cannot infer a parser for `.manifest` files | 1 | Format supported TS/CSS/Markdown files separately; leave Manifest formatting to the repository toolchain |
| Full gate fails on unrelated Event direct-hook violations | 1 | Do not alter concurrent Event work; confirm the repository blocker issue and retain focused passing evidence |

## Implementation Scope

- `src/procurement/order.manifest`: required receipt price plus durable observation reaction.
- `src/features/inventory/VendorOrderPage.tsx`: receipt-time price entry and confirmed-price display.
- `src/features/kitchen/RecipeDetailPage.tsx`: newest confirmed observation selection with catalog fallback.
- `src/features/kitchen/IngredientDetailPage.tsx` and a focused authored helper/component: price ledger and trend presentation.
- `src/styles/app.css`: local responsive presentation, preserving the existing Capsule palette/type system.
- Generated ownership paths only through `bun run manifest:regen`.
