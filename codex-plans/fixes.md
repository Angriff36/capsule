# Flexible unit entry — fixes

## 2026-10-05 — shared unit vocabulary and tiny quantity round trips

The acceptance test copied the recipe-line unit array, so it could drift from the actual picker vocabulary. It now imports `UNIT_OF_MEASURE`. It also covers `1e-7`; `formatQuantityEntry(1e-7, "gram")` emits `0.0000001 gram`, which the parser accepts back to the original quantity.

Verification: `bunx vitest run tests/culinary-model-acceptance.test.ts` (35 tests passed).

## 2026-10-05 — supply manifest guard #435

The supply panel directly imported `useQuery` from `convex/react`, contrary to the project seam convention and preventing `bun run check` from reaching later gates. `origin/dev` did not contain a repair. The query was moved intact to `src/features/facilities/useIngredientDemandProvenance.ts`, and the panel now imports that hook. No behavior or generated file changed.

## 2026-10-05 — previous Clerk contradiction resolved

The earlier “Clerk has no users” result was not evidence about Clerk. A nested PowerShell `node -e` command mangled its environment-file line parser; the secret was absent and the request sent `Bearer undefined`. The standalone script correctly parsed the copied environment and signed in as Angriff36.
