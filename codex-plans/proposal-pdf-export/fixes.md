# Fixes: Proposal PDF export

Append resolved implementation or verification issues below.

## Conditional jsPDF color tuple

- Issue: `tsc` rejected a spread from `bold ? BRAND : INK` because the conditional expression lost its tuple type.
- Fix: select the tuple first and pass explicit RGB channel indexes.
- Verification: `bun run typecheck` passed.

## Menu card inherited accent fill

- Issue: the first rendered sample showed the menu card in the accent color even though a paper fill had been selected earlier.
- Fix: set the paper fill immediately before drawing the rounded menu card.
- Verification: regenerated and visually inspected the Poppler-rendered PNG.
