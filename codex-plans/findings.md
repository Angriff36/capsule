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
