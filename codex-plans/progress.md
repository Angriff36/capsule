# Progress log

## 2026-10-05
- Phase 1 in progress: project guidance read; working tree pinned; incomplete prior attempt identified.
- Inspected shell, list-state coordinator, virtual window, Events/Kitchen integration, and target list/detail link patterns.
- Added shared typed list-origin/history primitives and replaced passive scroll cleanup with layout lifecycle persistence; corrected the JSX module extension after the focused typecheck reported it.
- Browser verification used an isolated Vite server from this worktree on port 7813 at revision `4d0b5cf9`. The temporary Playwright script was removed after it captured an unauthenticated failure screenshot and assertion output under `.artifacts/`.
- `bun run typecheck` passed. `bun run check` passed its pre-test gates, typecheck, formatting, and secrets, then entered coverage with unrelated failures in backend audit attribution, kitchen menu-price flow, receipt empty-location return, and workspace-entry behavior; it cannot be reported green.

## Test results
| Test | Result |
|---|---|
| Pending | |
# 2026-10-05 — Round-3 remediation started

- Reopened the prior feature implementation after its independent review identified unpersisted controls, visit-classification bugs, virtual-list restoration races, and incomplete verification.
- Preserving existing uncommitted task work as the baseline; no generated, Manifest, or Convex files will be edited for this UI-only repair.
- Tooling note: combined delete/add patch against the same file was rejected by the patch tool; split the shared-manager changes into individual patches.

## Sticky header repair
- Started implementation repair and loaded design, component, domain-restraint, and verification guidance.

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
