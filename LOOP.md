# LOOP.md — capsule loop configuration

## Loops in this repo (2026-07-21)

1. **Hygiene tick** (`capsule-loop-tick`, every 2h 9:15-17:15): triage scan ->
   STATE.md queue -> queue-drain fix flow. Prompt: `.claude/loop-tick-prompt.txt`.
2. **Product loop** (`capsule-product-loop`) — **OFF, do not enable as is
   (2026-09-20).** It has no real work: an AI session wrote
   `PRODUCT-BACKLOG.md` without asking the owner, and all six PRs it produced
   were closed unmerged. `PROMPT-product.md` + `.claude/product-loop.cmd`
   still use the retired draft-PR design (maker reviews its own work, runs
   with permission checks off). Before any restart: the owner supplies a real
   backlog, and the prompt + runner are converted to the maker/lander design
   used by the hygiene tick.
   Kill switch for both loops: `loop-pause-all` in STATE.md.

Architecture per [loop-engineering](https://github.com/cobusgreyling/loop-engineering).
Ported from the retired capsule-pro loop 2026-07-16 (13 clean L1 ticks there).
**Current phase: AUTO-LAND (owner decision 2026-09-20 — see loop-constraints.md). Approved fixes land on `dev` with no human step; the draft-PR design is retired (26 of 37 loop PRs went stale unapproved).**

Stack note: this repo is Bun + Vite + Convex + Vitest (NOT the capsule-pro
pnpm/turbo monorepo). All commands are `bun run <script>`; see package.json.

## Model routing

| Role                        | Model                                                 | Mechanism                                                                                                                                                                                                                                                |
| --------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scheduler                   | Windows Task Scheduler (`capsule-loop-tick`)          | 9:15–17:15 every 2h, daily (switched from weekdays 2026-07-17 for away coverage) → `.claude/loop-tick.cmd` → headless `claude -p` on a worker profile                                                                                                    |
| Tick runner (triage, state) | **GLM 5.2** (z.ai plan), auto-fallback **MiniMax-M3** | `~/.claude/claude-glm.ps1` / `claude-minimax.ps1` profiles — zero Anthropic quota; reads `.claude/loop-tick-prompt.txt`, runs `loop-triage`, owns STATE.md; scoped Edit perms (state files only). Manual alternate: Codex `gpt-5.6-luna` (`codex exec`). |
| Overseer                    | Fable 5 — on-demand only                              | reviews STATE.md when the human asks; judges graduation; NEVER runs ticks. No Anthropic-quota model runs ticks (incl. Sonnet).                                                                                                                           |
| Maker | GLM/MiniMax, in-tick | One fix per round, inside `.loop-worktrees/<run-id>` only. Commits there, writes a hand-off file, stops. NEVER checks or lands its own work. Runs with permission checks ON + deny list `.claude/loop-maker-settings.json` |
| Checker + lander | `.claude/loop-land.ps1` (plain code) + a reviewer from a DIFFERENT PROVIDER: Codex gpt-5.6-sol (OpenAI); fallback grok via Cursor CLI (xAI) | Reruns typecheck itself, gets the review, and on APPROVE pushes the fix onto `dev`. Anything else: records why, deletes the attempt. The pre-push hook refuses loop-worktree pushes that do not come from the lander |
| Circuit breaker             | loop-context                                          | `loop-ledger.json`; 3× same error / 5 fails → escalate                                                                                                                                                                                                   |
| Release gate | Human (Ryan) says "release" | Nothing reaches production until then. Escalations (3 failures on an item) are listed in STATE.md |

## Active loops

| Pattern                   | Cadence                     | Status         |
| ------------------------- | --------------------------- | -------------- |
| Daily Triage (2h variant) | work hours, daily, every 2h | AUTO-LAND on `dev` (2026-09-20): maker -> independent check -> land, up to 4 fixes per tick |

## L1 → L2 graduation criteria (all required — evidence bar, not calendar)

1. ≥10 L1 ticks with <20% noise in High Priority
2. One _manual_ dispatch → verifier round-trip proven (cross-model review gate)
3. Human flips this file's implementer status to ON

## Coordination

- The human works in this checkout daily and the tree is often dirty with
  in-flight work. The loop **never edits or commits in this checkout at any
  level** — it writes only the four loop state files there; each fix attempt
  gets its own worktree under `.loop-worktrees/`, started from `origin/dev`.
  The maker commits there and stops; `.claude/loop-land.ps1` checks the
  attempt and lands approved ones on `dev`.
- Single loop for now. Adding a second requires the multi-loop rules
  (separate state files, `acting_on:` claims, shared denylist).

## Connectors

MCP not required for this pattern — triage uses `gh` CLI (read-only) and git.

## Budget

- NO token cap (owner rule 2026-09-21; see `loop-budget.md`). The limits are 3 FAILs per item, 4 rounds per tick, and work-hours ticks only.
- Kill switch: set `loop-pause-all` in STATE.md → every tick exits immediately.

## Hard limits (always)

`loop-constraints.md` is binding and wins over this file. Auth, payments,
billing, schema, and Manifest source are ATTEMPTABLE there (HIGH-SCRUTINY
commit subject, listed for the release review) — they are not human-only.

- Anything matching the denylist in `loop-constraints.md`
- **Builder-owned trees** (see `.builder/ownership.json`) and anything under
  `convex/_generated`: never hand-edit.
  Regen happens ONLY via the app-local Builder CLI —
  `bun run manifest:regen`). Conflicts block apply.
  Details: `docs/generation/manifest-builder.md`, Builder `mintlify/guides/safe-regeneration.mdx`.
- Editable Manifest source (`src/**/*.manifest`): edit in the worktree only,
  always with `bun run manifest:regen` in the same commit. `.builder/**` and
  `manifest.config.yaml`: the loop never edits these
- Deploys: `convex deploy` / `bun run deploy` are forbidden to the loop
  (Builder never deploys Convex either — `bun run codegen` / `bun run dev:convex`
  are human steps after apply)
- The maker never pushes; only the lander pushes, and only onto `dev`.
  Production ships only when the owner says "release"
  (`bash scripts/deploy-production.sh`). The loop never opens, merges, or
  closes PRs.
