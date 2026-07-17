# LOOP.md — capsule loop configuration

Architecture per [loop-engineering](https://github.com/cobusgreyling/loop-engineering).
Ported from the retired capsule-pro loop 2026-07-16 (13 clean L1 ticks there).
**Current phase: L1 report-only.**

Stack note: this repo is Bun + Vite + Convex + Vitest (NOT the capsule-pro
pnpm/turbo monorepo). All commands are `bun run <script>`; see package.json.

## Model routing

| Role                            | Model                     | Mechanism                                              |
| ------------------------------- | ------------------------- | ------------------------------------------------------ |
| Scheduler                       | Claude Code `/loop` ticks | 2h ticks, work hours, weekdays                         |
| Brain (triage, state, dispatch) | Fable 5                   | runs `loop-triage`, owns STATE.md                      |
| Implementers (L2 — **OFF**)     | TBD at graduation         | dispatch mechanism decided then                        |
| Review gate (L2 — **OFF**)      | Codex (gpt-5.6-sol)       | `.claude/agents/loop-verifier.md` wraps `codex exec`   |
| Circuit breaker                 | loop-context              | `loop-ledger.json`; 3× same error / 5 fails → escalate |
| Final gate                      | Human (Ryan)              | STATE.md High Priority + escalations                   |

## Active loops

| Pattern                   | Cadence                        | Status         |
| ------------------------- | ------------------------------ | -------------- |
| Daily Triage (2h variant) | work hours, weekdays, every 2h | L1 report-only |

## L1 → L2 graduation criteria (all required — evidence bar, not calendar)

1. ≥10 L1 ticks with <20% noise in High Priority
2. One _manual_ dispatch → verifier round-trip proven (Codex gate)
3. Human flips this file's implementer status to ON

## Coordination

- The human works in this checkout daily and the tree is often dirty with
  in-flight work. The loop **never edits or commits in this checkout at any
  level** — L1 writes only the four loop state files; L2 fix attempts each
  get their own worktree under `.loop-worktrees/` (loop-worktree tool) and
  the loop's commits exist only on `loop/<run-id>` branches there. The human
  merges approved attempts.
- Single loop for now. Adding a second requires the multi-loop rules
  (separate state files, `acting_on:` claims, shared denylist).

## Connectors

MCP not required for this pattern — triage uses `gh` CLI (read-only) and git.

## Budget

- Caps in `loop-budget.md`; `loop-budget` skill runs at start/end of each tick.
- Kill switch: set `loop-pause-all` in STATE.md → every tick exits immediately.

## Human gates (always, regardless of level)

- Anything matching the denylist in `loop-constraints.md`
- Convex schema changes (`convex/schema.ts`) and anything under `convex/_generated`
- Manifest pipeline changes — go through the `manifest` skill; never hand-edit `generated/**`
- Deploys: `convex deploy` / `bun run deploy` are forbidden to the loop
- Pushes, merges, PR closes
