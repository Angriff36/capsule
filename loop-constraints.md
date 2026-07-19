# Loop Constraints — capsule

> The `loop-constraints` skill reads this file at the start of every run.
> Constraints here are **binding** — the agent MUST follow them.

## Phase

- **L2 STANDING (human decision 2026-07-19)** — draft-PR fix powers are
  permanent, not away-mode-bounded. Triage runs every tick; additionally at
  most ONE fix attempt per tick, only on items outside the denylist below.
- Check `loop-ledger.json` before any attempt: 3 failures on an item →
  escalate in STATE.md, do not retry.
- The `file:../builder` dependency was REMOVED 2026-07-19 (it broke CI's
  bun install). Builder is now a local tool (`scripts/manifest-regen.ts`
  resolves the sibling ../builder checkout); regen freshness is enforced by
  `bun run manifest:regen:check` in `.githooks/pre-push`. KNOWN NOISE until
  Manifest PR #54 ships in a release: projections stamp timestamps, so the
  check reports ~212 phantom "stale" modifications — do not treat that as an
  actionable finding.

## Git

- The human works in this checkout; the tree often carries in-flight changes.
- In the MAIN checkout: NEVER `git add`, commit, stash, checkout, or reset —
  the loop writes only STATE.md, loop-run-log.md, loop-budget.md,
  loop-ledger.json there. Read-only git commands are fine.
- Code edits happen ONLY inside a fresh worktree:
  `git worktree add .loop-worktrees/<run-id> -b loop/<run-id> main`.
  add/commit inside that worktree is allowed.

## Push & Merge

- Push ONLY `loop/*` branches (`git push origin loop/<run-id>`).
- PRs must be created with `gh pr create --draft`, verification evidence in
  the body. NEVER push main, merge, mark PRs ready, or close PRs.

## Paths (L2 denylist — enforced from day one)

- Never edit `.env`, `.env.*`, `**/secrets/**`, `**/credentials/**`
- Never edit `convex/schema.ts` or `convex/_generated/**` without human approval
- Never edit **Builder-owned files** (listed in `.builder/ownership.json`) or
  `generated/**` — regen with `bun run manifest:regen` only.
- **Never run** `manifest generate`, `manifest:build`, or
  `place-manifest-convex-react.ts`.
- Never edit `.builder/**`, `src/**/*.manifest`, or `manifest.config.yaml` —
  editable Manifest source is human-only
- Formatting policy (human-approved 2026-07-19): Prettier is a normal CI gate
  but is for CODE only — it must never touch generated trees OR doc files
  (`*.md`/`*.mdx` are in `.prettierignore` alongside the generated
  exclusions; extend the ignore file rather than reformatting). `.manifest`
  sources are formatted ONLY by the Manifest CLI's own formatter
  (`npx manifest fmt`), run whenever `.manifest` files change.
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

