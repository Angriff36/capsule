# Loop Constraints — capsule

> The `loop-constraints` skill reads this file at the start of every run.
> Constraints here are **binding** — the agent MUST follow them.

## Phase

- L1 report-only: NEVER edit source code, tests, or config. Triage + state files only.
- The only files the loop may write: STATE.md, loop-run-log.md, loop-budget.md, loop-ledger.json.

## Git

- The human works in this checkout; the tree often carries in-flight changes.
- NEVER `git add`, commit, stash, checkout, or reset anything — the human
  commits the loop's state files along with their own work.
- Read-only git commands (log, status, diff, branch) are fine.

## Push & Merge

- Never push, merge, close PRs, or create PRs without human approval.

## Paths (L2 denylist — enforced from day one)

- Never edit `.env`, `.env.*`, `**/secrets/**`, `**/credentials/**`
- Never edit `convex/schema.ts` or `convex/_generated/**` without human approval
- Never edit `generated/**` — Manifest output; regenerate via the `manifest` skill, never hand-edit
- Never edit `.manifest` files or the manifest pipeline outside the `manifest` skill
- Never edit auth, payments, or billing code without human approval

## Code (applies at L2)

- ALL code edits happen in an isolated git worktree — one per fix attempt
  (`npx @cobusgreyling/loop-worktree create --run-id <id> --pattern <p>`,
  worktrees live in `.loop-worktrees/`, gitignored). The loop NEVER edits
  files in this main checkout — that stays true after graduation, not just
  at L1. Commits/branches happen only inside the attempt's worktree; the
  human merges.
- Mark the worktree `rejected`/`escalated` when the verifier or breaker says
  so; `loop-worktree cleanup` sweeps them. `active` is never swept.
- One fix per dispatch; smallest possible diff.
- Focused verification first: `bun run typecheck`, then the focused test via
  `bun run test` (vitest). Never run the full `bun run check` gate unless the
  change warrants it. Never disable tests to go green.
- Max 3 attempts per item, enforced via loop-ledger.json + `loop-context --check`.
- `convex deploy` / `bun run deploy` are forbidden.

## Budget

- At 80% of daily cap: report-only for the rest of the day.
- `loop-pause-all` in STATE.md: exit immediately.
