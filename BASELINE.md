# Capsule baseline checklist

~~Title previously said “CapsuleX”.~~ **Correction (2026-07-16):** this repo is **Capsule**.

Day-0 gates for this repo. Evidence: `.artifacts/baseline-evidence.md` (local)
and the last green `bun run check` / CI run.

## Enforced here

- [x] Bun pinned (`.bun-version`, `packageManager`) + `bun run toolchain`
- [x] Node major via `.nvmrc` / `engines` + `.npmrc` `engine-strict=true`
- [x] Single lockfile `bun.lock`; competing lockfiles gitignored/rejected
- [x] TypeScript `strict: true`
- [x] Prettier format gate (`format:check` in `check`)
- [x] Secret scan pre-commit + CI (`bun run secrets` + fixture)
- [x] Vitest + coverage ratchet (`test:coverage` thresholds in `vite.config.ts`)
- [x] Smoke path test (`tests/smoke-app-path.test.ts`)
- [x] One local truth: `bun run check` == CI job `check`
- [x] Dependabot (bun weekly, actions monthly)
- [x] Docs split: `AGENTS.md` / `CLAUDE.md` / `docs/**` / `PRESET.md`
- [x] `.artifacts/` for scratch; monthly `baseline:decay`

## Explicitly N/A or blocked

| Item                        | Status               | Reason                                                                                                                                                         |
| --------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `noUncheckedIndexedAccess`  | Blocked on generator | Enabling it typechecks Manifest-generated `convex/mutations.ts` via `api` imports and fails massively. Fix in Builder emit; do not hand-patch generated files. |
| Classic SQL migrations      | N/A                  | Schema authority is Convex + Manifest assemble; no Prisma/SQL migration tree.                                                                                  |
| Shared disposable Docker DB | N/A                  | Data plane is Convex cloud/dev deployment; local reset via Convex CLI/dashboard (see `docs/operations/local-dev.md`).                                          |
| Branch protection on `main` | Blocked (platform)   | GitHub Free private repo: rulesets/protection API returns 403. See `.github/branch-protection.md`.                                                             |
| Browser E2E suite           | N/A (for now)        | Smoke is policy-level product path; full Playwright deferred until Clerk/Convex test harness exists.                                                           |
| ESLint                      | N/A by choice        | Prettier is the format gate; no parallel linter until a rule set is CI-enforced.                                                                               |

## Root cap

~~Aim ≤35 tracked root entries (excluding `node_modules` / `dist` / `graphify-out`).~~
~~**Correction (2026-07-16):** Aim ≤37 — live Manifest project adds root
`manifest.config.yaml` and `.builder/` (ownership).~~
**Correction (2026-07-17):** Aim ≤40 — loop engineering adds durable root
`loop-budget.md`, `loop-constraints.md`, and `loop-ledger.json` (daily-triage
L1, commit 94a79c9). Still excludes `node_modules` / `dist` / `graphify-out`.
Enforced by `bun run baseline:decay`.
