# Findings: Field-level domain-term help

## Requirements
- Explain batch multiplier, yield, par level, and purchase eligibility at their entry fields.
- Use one source of wording, with relevant worked-example links.
- Provide an accessible click/tap interaction and a help destination.
- Verify with a temporary Playwright test, then remove it.

## Research Findings
- UI changes are governed by DESIGN.md and the component catalog. Existing shared UI should be reused when it fits.
- Generated frontend and Convex output must not be edited.
- Initial repository search found culinary demand documentation and runtime tests, but the exact authored field surfaces and calculation semantics still need focused inspection.
- `convex/lib/culinaryModel/demand.ts` calculates recipe-line demand as recipe line quantity times batch multiplier times servings divided by yield quantity. Its component/subrecipe path also derives batches from portions divided by yield times batch multiplier.
- `src/inventory/stock.manifest` defines below-par status as par level greater than available stock; `StockBookPage` derives a replenishment amount as max(0, par level minus available stock).
- Authored candidate entry surfaces include `KitchenCatalogCreateForm`, `ComponentDetailPage`, `DishComponentsPanel`, and `StockBookPage`. Purchase eligibility is not yet found as a staff-entered frontend control; the backend field currently denotes whether calculated event demand may feed purchasing.
- The shared UI catalog has no existing field-help component. `DropdownMenu` is intentionally an action menu, so it is not appropriate for explanatory content. The app already uses portalled overlays and tokens in `app.css`.
- The level editor in `StockBookPage` uses the shared `ActionPrompt` field renderer, so that renderer needs an additive per-field help slot to avoid leaving that entry path uncovered.
- Demand Ledger exposes a visible Purchase column but no staff-owned purchase-eligibility control; the state is automatic after event approval. Its column heading is the appropriate user-facing place to explain that non-editable downstream condition without inventing a toggle.

## Technical Decisions
| Decision | Rationale |
|---|---|
| Discover calculation semantics before drafting copy | Help must not mislead staff about demand math. |

## Issues Encountered
| Issue | Resolution |
|---|---|
| Large reference documentation exceeds terminal response limits | Inspect targeted sections and code paths directly; no generated or Manifest change is anticipated. |
