# Fixes log (resolved issues)

## 2026-10-05
- Issue: List scroll was saved in passive cleanup after an incoming route could restore the persistent shell scroller.
  Fix: Persist scroll in layout cleanup and observe workspace-sheet content while retaining a pending target during loading.
  Commands: `bun run typecheck`
- Issue: Detail returns treated any saved URL as proof that browser Back was safe and broke modified-anchor behavior.
  Fix: Added entry-key/history-index origin tracking and `ReturnToListLink`, which only consumes Back when the immediate predecessor matches.
  Commands: `bun run typecheck`

## 2026-10-04 - truthful cascade feedback and purchasing scope
- Removed the pre-approval ingredient-demand count from the event success notice because the generated transaction can repair eligibility before it creates purchase needs.
- Added `usePurchasingScopeViewModel` so “Show all events” clears the explicit route filter and the page-local working-event scope together.
- Added the real `ActionResultHost` Storybook states and focused cascade-message test. `bunx vitest run tests/automation-cascade-feedback.test.ts` and `bun run build-storybook` passed.

# Flexible unit entry — fixes

## 2026-10-05 — shared unit vocabulary and tiny quantity round trips

The acceptance test copied the recipe-line unit array, so it could drift from the actual picker vocabulary. It now imports `UNIT_OF_MEASURE`. It also covers `1e-7`; `formatQuantityEntry(1e-7, "gram")` emits `0.0000001 gram`, which the parser accepts back to the original quantity.

Verification: `bunx vitest run tests/culinary-model-acceptance.test.ts` (35 tests passed).

## 2026-10-05 — supply manifest guard #435

The supply panel directly imported `useQuery` from `convex/react`, contrary to the project seam convention and preventing `bun run check` from reaching later gates. `origin/dev` did not contain a repair. The query was moved intact to `src/features/facilities/useIngredientDemandProvenance.ts`, and the panel now imports that hook. No behavior or generated file changed.

## 2026-10-05 — previous Clerk contradiction resolved

The earlier “Clerk has no users” result was not evidence about Clerk. A nested PowerShell `node -e` command mangled its environment-file line parser; the secret was absent and the request sent `Bearer undefined`. The standalone script correctly parsed the copied environment and signed in as Angriff36.
