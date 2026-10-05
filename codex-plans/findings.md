# Findings and decisions

## Requirements
- Restore filters, sort, pagination, and scroll after list-to-detail navigation.
- Provide safe browser-back and visible return-link behavior for the listed routes.
- Verify with a temporary Playwright test and leave evidence under `.artifacts/`.

## Research findings
- The worktree has an incomplete prior implementation in `src/features/list-state/`, Events, Kitchen, shell, saved views, and virtual scrolling.
- The shell has one persistent `<main>` scroller; current restoration saves during passive cleanup and observes the scroller rather than its changing workspace content.
- Existing Events and Kitchen list state is query-backed but schemas are recreated on every render, and saved views use `location.search.length` instead of recognized-list-state detection.
- Existing list/detail links outside Events and Kitchen are direct links with no origin state, so route coverage needs focused integration rather than a global route interception.
- Round-3 remediation must preserve all prior in-progress feature changes while replacing incomplete free-function state/scroll behavior with the requested focused manager structure.
- Repository-design rules require this authored UI work to retain the established visual language; no visual redesign is needed for URL and navigation behavior.

## Technical decisions
| Decision | Rationale |
|---|---|
| Inspect existing patterns before broad edits | Route and detail-page coverage must match the application’s actual paths and links. |
| Use `ReturnToListLink` for visible list returns | It retains normal anchor behavior for modified clicks and only consumes browser Back when the stored predecessor is exact. |

## Issues encountered
| Issue | Resolution |
|---|---|
| | |

## Sticky header findings
- Existing sticky header implementation needs repair, not replacement.
- The application scroll container is `.app-canvas`; observers must use it as root.

# Flexible unit entry — findings

## Implementation

- `convex/lib/culinaryModel/units.ts` owns parsing, canonicalization, conversion description, safe fallback selection, and decimal edit formatting.
- `src/ui/QuantityUnitInput.tsx` is deliberately hook-free; recipe callers own their governed save mutations while the control gives immediate parse and conversion feedback.
- Ingredient and sub-recipe lines retain the entered recipe unit after save. The catalog-unit equivalent is a preview, which is consistent with the required reload assertions (`2 pound`, `500 gram`, `2 fluid ounce`).
- `UnitOfMeasureMapper.ts` has no React, Vite-only, or browser-global import. Its `UNIT_OF_MEASURE` declaration is `as const`, and its inferred union is structurally compatible with `readonly UnitCode[]`; the acceptance test now imports that one source of truth.

## #435

`origin/dev` has no later change to `src/features/inventory/IngredientDemandProvenancePanel.tsx`. The panel's direct `convex/react` query therefore moved unchanged into `src/features/facilities/useIngredientDemandProvenance.ts`, matching the existing facilities seam-hook convention. The panel preserves its exact loading, unavailable, and populated behavior.

## Presentation compliance

`bun scripts/check-design-vocab.ts` passed: it confirmed both that `app.css` matches `DESIGN.md` and that the source contains no off-vocabulary classes. The feature classes are defined as follows:

- `text-warn` follows the warning semantic color in `DESIGN.md:29` and the contract's label-plus-color requirement in `DESIGN.md:364`; it is an existing color token in `src/styles/app.css:347`.
- `text-ink-3` follows quiet `ink-3` in `DESIGN.md:14`; it is used by existing input/helper styles in `src/styles/app.css:207` and `:376`.
- `text-xs` and `text-2xs` resolve to the approved 13px minimum stated in `DESIGN.md:399` and declared in `src/styles/app.css:81-82`.
- `min-w-44` and `space-y-1` are existing Tailwind spacing utilities, used inside the compact recipe form grammar described by `DESIGN.md:412` and accepted by the repository scanner.
- `input` implements the documented input component at `DESIGN.md:170` and `DESIGN.md:508`, defined in `src/styles/app.css:206`.
- `btn btn-ghost btn-sm` follows the documented ghost button at `DESIGN.md:149` and `DESIGN.md:496`, defined in `src/styles/app.css:188-204`.
- `field-label` and `culinary-line-form` are existing authored component classes, defined in `src/styles/app.css:215` and `:1240` respectively.

No new palette, type scale, radius, or component shape was introduced.
