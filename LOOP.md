# LOOP.md — capsule loop configuration

Architecture per [loop-engineering](https://github.com/cobusgreyling/loop-engineering).
Ported from the retired capsule-pro loop 2026-07-16 (13 clean L1 ticks there).
**Current phase: L2 standing (draft PRs; human decision 2026-07-19 — see loop-constraints.md).**

Stack note: this repo is Bun + Vite + Convex + Vitest (NOT the capsule-pro
pnpm/turbo monorepo). All commands are `bun run <script>`; see package.json.

## Model routing

| Role                        | Model                                                 | Mechanism                                                                                                                                                                                                                                                |
| --------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scheduler                   | Windows Task Scheduler (`capsule-loop-tick`)          | 9:15–17:15 every 2h, daily (switched from weekdays 2026-07-17 for away coverage) → `.claude/loop-tick.cmd` → headless `claude -p` on a worker profile                                                                                                    |
| Tick runner (triage, state) | **GLM 5.2** (z.ai plan), auto-fallback **MiniMax-M3** | `~/.claude/claude-glm.ps1` / `claude-minimax.ps1` profiles — zero Anthropic quota; reads `.claude/loop-tick-prompt.txt`, runs `loop-triage`, owns STATE.md; scoped Edit perms (state files only). Manual alternate: Codex `gpt-5.6-luna` (`codex exec`). |
| Overseer                    | Fable 5 — on-demand only                              | reviews STATE.md when the human asks; judges graduation; NEVER runs ticks. No Anthropic-quota model runs ticks (incl. Sonnet).                                                                                                                           |
| Implementers (L2 — **ON, away mode**) | GLM/MiniMax, in-tick                        | One fix attempt per tick, inside `.loop-worktrees/<run-id>` only; draft PRs; per loop-constraints.md away-mode rules                                                                                                                                     |
| Review gate (L2 — **ON, away mode**)  | Codex (gpt-5.6-sol)                         | Tick pipes worktree diff to `codex exec -s read-only`; REJECT blocks the PR                                                                                                                                                                              |
| Circuit breaker             | loop-context                                          | `loop-ledger.json`; 3× same error / 5 fails → escalate                                                                                                                                                                                                   |
| Final gate                  | Human (Ryan)                                          | STATE.md High Priority + escalations                                                                                                                                                                                                                     |

## Active loops

| Pattern                   | Cadence                     | Status         |
| ------------------------- | --------------------------- | -------------- |
| Daily Triage (2h variant) | work hours, daily, every 2h | L2 away mode (draft PRs) |

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
- **Builder-owned trees** (see `.builder/ownership.json`): never hand-edit.
  Regen happens ONLY via the app-local Builder CLI —
  `bun run manifest:regen`). Conflicts block apply.
  Details: `docs/generation/manifest-builder.md`, Builder `mintlify/guides/safe-regeneration.mdx`.
- Editable Manifest source (`src/**/*.manifest`, `manifest.config.yaml`) and
  `.builder/**` — human-only; the loop reports, never edits
- Deploys: `convex deploy` / `bun run deploy` are forbidden to the loop
  (Builder never deploys Convex either — `bun run codegen` / `bun run dev:convex`
  are human steps after apply)
- Pushes, merges, PR closes
