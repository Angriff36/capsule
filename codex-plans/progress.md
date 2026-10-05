# Flexible unit entry — progress

## Completed

- Inspected the prior implementation and confirmed its unit-list test drift, exponent-format gap, and #435 gate failure.
- Replaced the copied test vocabulary with `UNIT_OF_MEASURE`, added `1e-7` to every-unit round trips, and added the explicit fixed-decimal assertion.
- Extracted the unchanged demand-provenance query into the facilities hook seam.
- Ran `bunx vitest run tests/culinary-model-acceptance.test.ts` separately: exit code 0, 35 tests passed. Recorded in `.artifacts/gate-focused-vitest.txt`.
- Ran `bun scripts/check-design-vocab.ts`: exit code 0. Recorded in `.artifacts/gate-design-vocab.txt`.

## Browser verification

Pending. The prior `node -e` Clerk check was invalid because PowerShell's nested quoting mangled the line split, leaving `CLERK_SECRET_KEY` undefined and sending `Bearer undefined`. The standalone script parsed `.env.local` and successfully created an Angriff36 sign-in ticket. This round uses only one standalone `.cjs` verifier with a real line parser; it will report each required save/reload assertion and clean all disposable data before completion.

## Remaining gates

- `bun run typecheck`
- `bun run format:check`
- `bun run build`
- `bun run check`

Each will run separately and record its own exit code.
