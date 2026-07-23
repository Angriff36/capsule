# Findings & Decisions: Preferred vendor mapping

## Requirements
- Operators can tag one or more vendors as preferred for an ingredient.
- Preferences have an explicit order.
- Purchasing consolidation defaults purchase needs to preferred vendors.
- Follow Manifest generation ownership and authored UI conventions.
- Verify core behavior with a temporary Playwright test, then delete it.
- Run the required repository gate before claiming completion.

## Research Findings
- The checkout is on `main` at `b08002245589adafd772e24deb82232591e4e954` and has extensive pre-existing modified/untracked work.
- Pre-existing changes include `src/app.manifest`, `src/features/kitchen/IngredientDetailPage.tsx`, purchasing-related generated files, and root `codex-plans/` files for a separate payroll task.
- Prior repository work established an explicit, date-range-driven purchase-draft workflow that groups demand by ingredient and unit, keeps needs open until order submission, and adapts UI to generated hooks.
- Current domain files of interest are `src/culinary/ingredient.manifest`, `src/procurement/vendor.manifest`, `purchase-need.manifest`, `order.manifest`, and `event-purchasing.manifest`; authored UI seams include `IngredientDetailPage.tsx` and `PurchasingPage.tsx`.
- Current docs also describe a separate automatic weekly route through `WeeklyPurchasingConfig.routeNeed`, which currently relies on one tenant-wide default vendor.
- Domain guidance requires avoiding nuisance gates; preferred mapping should be a useful default, not a blocker that prevents normal purchasing choices.
- `npx` is installed at `C:\Program Files\nodejs\npx.ps1`, satisfying the Playwright skill prerequisite. Repository-local commands will still follow the Bun convention.

- The live `Ingredient` domain already has a nullable singular `preferredVendorId` plus `setPreferredVendor`; this existing seed confirms the intended purchasing seam but does not satisfy multiple ordered preferences.
- `IngredientDetailPage.tsx` currently shows ingredient facts and recipe usage only; it neither lists vendors nor calls the existing preference mutation.
- The existing automatic weekly path is fully Manifest-owned: `PurchaseNeedOpened` invokes `WeeklyPurchasingConfig.routeNeed`, which emits one vendor ID and creates or updates the matching weekly `VendorOrder` and line.
- `PurchasingPage.tsx` reads the resulting drafts and does not perform automatic routing itself, so default-vendor selection belongs in the Manifest source rather than a UI coordinator.
- `IngredientDetailPage.tsx` and `PurchasingPage.tsx` have no substantive targeted diff at this point; the shared stylesheet has unrelated allergen/PDF changes that must be preserved.

- Manifest supports ordered list properties and aggregate helpers, but the installed DSL does not expose a direct list-index/first-element builtin in the searched docs or parser surface.
- A first-class join row can store priority, but selecting the vendor associated with the minimum priority inside the current reaction chain is not directly expressible. The existing singular `Ingredient.preferredVendorId` is therefore useful as a denormalized primary cache.
- A lower-complexity option is to persist the ordered vendor IDs directly on `Ingredient`, keep `preferredVendorId` synchronized to the first item in the same command, and use that primary cache in automatic routing.

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Inspect live source and targeted diffs before choosing files | Avoid colliding with concurrent work or duplicating an existing partial feature |

| Keep preference selection in Manifest-owned purchasing flow | Existing weekly consolidation is domain-driven and the UI only renders its results |
| Preserve a singular primary-vendor cache | The reaction needs one scalar vendor ID, while the ordered preference collection supplies all operator choices |
| Use one `setPreferredVendors` command | A single versioned save keeps the ordered list and primary scalar in sync without multi-command partial updates |
| Use the ingredient detail page for management | Operators configure once near the ingredient catalog; purchasing then defaults automatically |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| Root planning files are owned by another active task | Use a feature-specific subdirectory and leave their files untouched |

| A planning-file patch used a stale expected line and failed twice | Re-read the live file and applied a narrower heading-anchored patch |
| The first combined implementation patch failed on an inexact Ingredient line | Split the implementation into smaller exact patches; no partial code was applied |
| An ambiguous reaction patch matched `syncFromContributions` first | Diff inspection caught it before generation; moved the argument to weekly routing |
| Builder compile rejected `self.ingredient.preferredVendorId` inside the EventApproved fanOut | Reaction completeness only allows match-entity properties; IngredientDemand now refreshes a scalar preference before purchase-need creation |
| The existing weekly runtime proof currently stops in `Invoice.issue` with `Finance staff may read invoices` during Event.approve | This is unrelated concurrent finance policy drift and occurs before the preferred-vendor routing path; supply contract/guard tests and typecheck pass |
| The repository had no Playwright configuration or package declaration | Use a disposable spec and the temporary `playwright` CLI package against the Vite harness; delete artifacts afterward |

## Resources
- `AGENTS.md`
- `.aboardai/context/*.md`
- Memory notes for the existing purchasing consolidation workflow

## Visual/Browser Findings
- None yet.
