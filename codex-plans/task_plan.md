# Flexible unit entry — round 4 plan

## Goal

Allow recipe ingredient and sub-recipe quantity fields to accept compact kitchen input, show an inline catalog-unit conversion or incompatibility warning, and save the entered compatible unit without downstream ambiguity.

## Phases

- [x] Inspect the existing round-3 diff, unit engine, recipe editors, tests, UI contract, and the #435 supply-manifest failure.
- [x] Make the targeted test and #435 seam fixes.
- [x] Check presentation vocabulary and record the result.
- [ ] Run every required gate separately and record its exit status.
- [ ] Perform the disposable Playwright verification against the worktree app, clean its records and artifacts, and record the observed result.
- [ ] Rewrite the planning records as single, non-contradictory documents and prepare the worktree for independent review.

## Scope boundaries

No Manifest source or generated files, deployment, Clerk-user changes, or production services. The #435 repair is limited to extracting the existing read hook into the established `features/facilities` seam location.
