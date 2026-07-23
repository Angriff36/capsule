# Task Plan: Preferred vendor mapping

## Goal
Let operators maintain an ordered list of preferred vendors for each ingredient and have purchasing draft consolidation choose those vendors by default.

## Current Phase
Complete

## Phases

### Phase 1: Requirements and discovery
- [x] Capture user requirements and repository constraints
- [x] Trace current ingredient, vendor, purchase-need, and draft-generation seams
- [x] Identify overlapping work in the dirty checkout
- **Status:** complete

### Phase 2: Plan the implementation
- [x] Define the Manifest source model and authored UI/coordinator changes
- [x] Confirm generated paths remain untouched except through `bun run manifest:regen`
- [x] Define focused verification and disposable Playwright coverage
- **Status:** complete

### Phase 3: Implement
- [x] Add the smallest source and authored UI/coordinator changes
- [x] Regenerate only through the Builder-owned command if required
- [x] Preserve unrelated user changes
- **Status:** complete

### Phase 4: Verify
- [x] Run focused existing tests without adding permanent tests
- [x] Create, run, and delete a temporary Playwright verification spec
- [x] Run `bun run check` (blocked by unrelated Event UI integration violations; issues #40 and #41 filed)
- **Status:** complete

### Phase 5: Delivery
- [x] Review the exact diff and repository status
- [x] Record resolved issues in fixes.md
- [x] Provide the required tagged summary
- **Status:** complete

## Key Questions
1. Does the live domain already model ingredient-to-vendor relationships or vendor preference?
2. Where does purchase consolidation currently select or require a vendor?
3. Can ordered preferences be managed from the ingredient detail screen without adding user tedium?
4. Is the checkout actively being changed by another session in the same files?

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Treat all pre-existing changes as user-owned | The checkout was extensively dirty before this task |
| Namespace this plan under `codex-plans/preferred-vendor-mapping/` | The root planning files belong to a concurrent payroll task and must not be overwritten |
| Do not add permanent tests | Repository owner rules forbid new or expanded tests unless explicitly requested; Playwright coverage will be temporary as required |
| Store the ordered vendor IDs on Ingredient and keep the first ID in the existing scalar field | One governed save updates both operator-visible priority and the scalar needed by generated routing |
| Fall back to WeeklyPurchasingConfig.defaultVendorId | Ingredients without a preference retain the current automatic purchasing behavior |
| Put the editor on Ingredient detail | Preferences are ingredient-specific catalog data and this avoids adding selection tedium to each purchasing run |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| Planning-file patch expected an inexact table row | 1-2 | Re-read the live file and used narrower heading anchors |
| Initial combined implementation patch used one inexact Ingredient property line | 1 | Split the patch into exact, smaller source/UI edits |
| Preferred vendor forwarding landed in the first matching reaction params block | 1 | Inspected the diff and moved it to `WeeklyPurchasingConfig.routeNeed` |
| `manifest:regen` rejected relation traversal in a fanOut reaction | 1 | Cache the current preference on IngredientDemand during calculate/refresh and reference its scalar property in the reaction |
| Existing weekly runtime proof stops in unrelated Invoice.issue policy | 1 | Keep feature verification separate; do not alter concurrent finance policy or tests |
| Background `Start-Process` command was rejected by execution policy | 1 | Run the documented dev command in a yielded shell cell and terminate it after Playwright |
| First temporary Playwright run loaded mismatched runner packages | 1 | Import from `playwright/test` and run the matching `playwright` CLI package |
| Full repository gate blocked on unrelated Event direct-hook violations and broad local-artifact formatting | 1 | Filed GitHub issues #40 and #41; preserved concurrent files and completed focused feature gates |
