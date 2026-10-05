# Findings

- `EventIngredientContribution` is the per-recipe source for an aggregate
  `IngredientDemand`; it already holds revision-two source keys and quantity
  metadata but not every input used to calculate the displayed equation.
- `DemandLedgerPage.tsx` renders the demand ledger. It currently uses generated
  list hooks, so provenance needs a separate authored Convex query invoked only
  for an expanded row.
- The UI must keep CapsuleX's rule-led, flat operational-document language from
  `DESIGN.md`; nested cards and a palette/type-system change are out of scope.
