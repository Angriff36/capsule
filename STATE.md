# Loop State — capsule

Last run: 2026-07-17T06:00:00Z (glm-tick, L1 report-only)

## High Priority (loop is acting or waiting on human)

- **CI still RED on main, unchanged**: `check` job fails at `bun run proof:emit` —
  `emitCapsuleProofKit` throws at `scripts/emit-proof-kit.ts:94`
  (latest push run 29550592283 @ 6bd3e83, ~12s fail-fast; no newer push to
  main since — the 94a79c9 loop-setup commit didn't trigger a CI run).
  Human: run `bun run proof:emit` locally against a clean checkout to
  reproduce. Effort guess: small-medium. No action taken yet.
- **All 6 open Dependabot PRs still fail the same CI**, blocked behind the
  proof:emit failure, not their own changes (typescript 5.9→7.0,
  vite 6.4→8.1, react-router-dom 6.30→7.18, react-dom, plugin-react 4.7→6.0,
  actions/checkout 4→7). typescript, vite majors and actions/checkout major
  are separate human-gated risk decisions once CI is green (safety.md).

## Watch List

- Working tree carries ~28 uncommitted paths (human's in-flight convex/src +
  docs/task-plans work) — normal, flag only if unchanged for days.
- `.claude/loop-tick-prompt.txt` and `.claude/loop-tick.cmd` are untracked
  (not part of the 94a79c9 loop-setup commit) — cosmetic, human's call
  whether to commit.
- `actions/checkout@v4` + Node 20 deprecation warnings in CI — bump when
  convenient (PR #1 open, itself blocked behind proof:emit CI red).

## Recent Noise (ignored this run)

- Dependabot Updates workflow runs (green, bot traffic).

## Post-Run Critique

- Third consecutive tick with identical state — same CI failure, same PR set, no new commits to main. Triage cadence reduction recommended: only re-verify CI status (cheap gh run check) instead of full PR re-derivation until the proof:emit blocker is resolved. Current full sweeps are wasted tokens when the root cause is unchanged.

---

Architecture: `LOOP.md`. Constraints: `loop-constraints.md`. Budget: `loop-budget.md`. Safety: `docs/safety.md`.
