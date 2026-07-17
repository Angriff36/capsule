# Loop State — capsule

Last run: 2026-07-17T05:05:59Z (manual first tick, L1 report-only)

## High Priority (loop is acting or waiting on human)

- **CI RED on main**: `check` job fails at `bun run proof:emit` —
  `emitCapsuleProofKit` throws at `scripts/emit-proof-kit.ts:94`
  (runs 29550592283 @ 6bd3e83 and 29548513332 @ 4007aca, both ~13s fail-fast).
  Started at or before the 3.6.14 pin commit. Human: run `bun run proof:emit`
  locally against a clean checkout to reproduce. Effort guess: small-medium.
- **All 6 open Dependabot PRs fail the same CI** — blocked behind the
  proof:emit failure, not their own changes (typescript 7, vite 8,
  react-router 7, react-dom, plugin-react, actions/checkout are separate
  risk decisions once CI is green). Note: typescript 5.9→7.0 and vite 6→8
  are majors — human-gate per safety.md regardless.

## Watch List

- Working tree carries ~36 uncommitted paths (human's in-flight convex/src
  work) — normal, flag only if unchanged for days.
- `actions/checkout@v4` + Node 20 deprecation warnings in CI — bump when
  convenient.

## Recent Noise (ignored this run)

- Dependabot Updates workflow runs (green, bot traffic).

## Post-Run Critique

- First tick ran manually as setup verification; cron takes over next
  weekday tick (9:15–17:15 local, every 2h). `gh` visibility confirmed
  working via settings.local.json allowlist.

---

Architecture: `LOOP.md`. Constraints: `loop-constraints.md`. Budget: `loop-budget.md`. Safety: `docs/safety.md`.
