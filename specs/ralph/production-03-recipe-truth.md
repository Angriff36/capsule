# PR03 — Turn source recipes into usable kitchen formulas

_Serves JTBD(s):_ Kayden — know what to prep; Josh — know actual ingredient requirements and food cost.

## Job Statement

Use an imported recipe to prepare the right quantity with traceable ingredients and honest costs.

## Baseline and ownership

Draft requirements; shared contract: [production readiness](../../docs/product/production-readiness.md). Owners: `src/culinary/component.manifest`, `component-import.manifest`, `dish.manifest`, `src/features/kitchen/import/`, `src/agent/CapsuleMeasureUnit.ts`, and `src/agent/CapsuleEventBundlePlan.ts`. Component imports and BOM entities exist. The migration preserved 143 content-bearing recipe drafts; 74 other unique entries lacked ingredient lines. Draft source text is not a normalized BOM. Issue #248 is a unit/nutrition interpretation risk to verify.

## Required behavior

Resolve finished Dish → reusable Component recipe → Ingredient lines, with DishTask templates for work instructions. Do not turn “portion sauce” into a purchased Ingredient. Preserve nested formulas, source yields, serving basis, method, and heating/serving instructions. Unit conversion requires compatible dimensions; count-to-weight needs an ingredient-specific conversion with provenance. Unknown ingredient price or unmatched units are incomplete cost, not zero cost.

## Acceptance Criteria

- [ ] PR03-01: A source recipe with nested subrecipes can be parsed, matched, corrected, and used from the normal recipe book. Its source text remains accessible after normalization.
- [ ] PR03-02: Repeated category exports do not create duplicate recipes. Different source formulas with the same name remain distinguishable revisions until resolved; identical scaled formulas normalize without losing their original serving basis.
- [ ] PR03-03: Mixed fractions, small quantities, mass, volume, count, batch, yield, waste factor, and purchase-pack units retain their meaning. Fluid ounces are not mass ounces; unknown conversions never default to each or round a fractional requirement to one.
- [ ] PR03-04: Ingredient lines, subrecipes, and prep instructions are classified separately. Cycles or missing nested formulas identify the affected recipe only and cannot cause recursive work or inflated demand.
- [ ] PR03-05: Changing an event from 100 to 150 servings scales its applicable demand by the verified serving/yield ratio exactly once. Replaying the change does not double demand; event overrides and already completed work remain identifiable.
- [ ] PR03-06: Ingredient prices carry units, effective dates, and provenance. Cost views show known cost plus missing-cost coverage; a missing/zero/unmatched source price cannot silently produce a misleading complete margin or food-cost percentage.
- [ ] PR03-07: Publishing a verified formula preserves its version for historical event costing. Editing tomorrow's recipe does not rewrite yesterday's actuals or an accepted client sell price.
- [ ] PR03-08: Recipe instructions with incomplete costing remain usable by kitchen staff with specific missing-data notices. Empty source entries are labeled incomplete rather than fabricated as working recipes; no global approval gate prevents unrelated prep.
- [ ] PR03-09: Allergen and nutrition claims retain evidence and unknown states. Absence of source allergens is not an allergen-free claim; a volumetric portion is never presented as a count-unit weight.

## Dependencies and proof

PR01/PR02 supply source and identity; PR04 consumes quantities; PR11 consumes cost coverage. Exercise a nested recipe, scaled duplicate, incompatible units, missing cost, and an event-specific substitution through the normal UI and governed commands.

## Out of Scope

No product capability is excluded. Stock movements belong to PR04; commercial sell prices belong to PR06. Recipe editing must not perform either implicitly.

## Open Questions

Source-specific missing yields or unit conversions require verified source values or a recorded kitchen correction. No density, portion weight, or nutrition value is assumed to finish the import.
