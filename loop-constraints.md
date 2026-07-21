# Loop Constraints — capsule

> The `loop-constraints` skill reads this file at the start of every run.
> Constraints here are **binding** — the agent MUST follow them.

## Phase

- **L2 STANDING (human decision 2026-07-19; throughput redesign 2026-07-21)**
  — draft-PR fix powers are permanent. **The PR gate is the safety boundary**:
  every change is worktree-isolated, test-verified, Codex-reviewed, and ships
  only as a draft PR the human must approve — so the loop does NOT pre-filter
  work into "safe" and "unsafe". Anything reviewable is attemptable.
- **Drain the queue every tick.** Work items in priority order — one fresh
  worktree and one draft PR per logical fix — and keep going until there are
  no actionable items left or the budget gate trips. There is NO per-tick fix
  cap. (One-fix-per-iteration is for back-to-back loops; a scheduled tick
  that stops after one fix is throughput theater — human decision 2026-07-21.)
- High-scrutiny areas (auth, payments, billing, schema, manifest sources) are
  ATTEMPTABLE, not skipped — but the PR title/body must flag them loudly
  (e.g. "HIGH-SCRUTINY: touches payments") so the human reviews accordingly.
- Check `loop-ledger.json` before any attempt: 3 failures on an item →
  escalate in STATE.md, do not retry.
- The `file:../builder` dependency was REMOVED 2026-07-19 (it broke CI's
  bun install). Builder is now a local tool (`scripts/manifest-regen.ts`
  resolves the sibling ../builder checkout); regen freshness is enforced by
  `bun run manifest:regen:check` in `.githooks/pre-push`. The "phantom
  stale/modified" mystery is SOLVED (2026-07-21, proven): git converted
  Builder's LF output to CRLF on every fresh checkout/worktree, so Builder's
  byte-hash ownership check saw ~290 "modified" files. Fixed permanently by
  `.gitattributes` (eol=lf on Builder-owned trees) — ships in PR #14. After
  #14 merges, regen conflicts in a clean worktree are REAL findings again.

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
- **AUTO-MERGE IS ON (human enabled 2026-07-21): once a PR is marked ready, a
  green CI merges it with no further human step.** The Codex review verdict is
  therefore a HARD gate: never push a PR branch without a recorded Codex
  APPROVE for the change. There is NO `REVIEW_GATE` override mechanism — the
  2026-07-22 `REVIEW_GATE=0` push (PR #31) was a violation, not a precedent.
  Codex REJECT → fix or escalate in STATE.md; never push around the gate.

## Paths (hard rules — the short list that is NOT about caution)

- Never edit or commit `.env`, `.env.*`, `**/secrets/**`, `**/credentials/**`
  (loop branches get pushed; a leaked secret is unrecallable).
- Never HAND-EDIT generated output — `generated/**`, `convex/_generated/**`,
  Builder-owned files per `.builder/ownership.json`. Not caution: hand-edits
  to generated files are wrong by construction (the next regen erases them).
  When a fix requires manifest source changes, edit `src/**/*.manifest` in
  the worktree AND run `bun run manifest:regen` inside that worktree so
  source + generated output land together in one reviewable PR. (Regen in
  the MAIN checkout stays forbidden — it would stomp human WIP.)
- Never leave `*.manifest` under `.artifacts/` (or other non-`src/` scratch
  dirs) in a worktree. Builder/manifest globs pick them up; relative `use`
  paths then resolve to e.g. `/.artifacts/workforce/...` and regen dies.
- Manifest-source (C:\Projects\Manifest-source) is canonical for the domain
  model: a PR that edits capsule `.manifest` files must say in its body
  whether the change needs porting to canonical (or came from it).
- Formatting policy (human-approved 2026-07-19): Prettier is a normal CI gate
  but is for CODE only — it must never touch generated trees OR doc files
  (`*.md`/`*.mdx` are in `.prettierignore` alongside the generated
  exclusions; extend the ignore file rather than reformatting). `.manifest`
  sources are formatted ONLY by the Manifest CLI's own formatter
  (`npx manifest fmt`), run whenever `.manifest` files change.
- Auth, payments, billing, `convex/schema.ts`: attemptable via draft PR with
  a HIGH-SCRUTINY flag (see Phase) — the PR is the request for human
  approval; do not silently skip these items.

## Code (applies at L2)

- ALL code edits happen in an isolated git worktree — one per fix attempt
  (`npx @cobusgreyling/loop-worktree create --run-id <id> --pattern <p>`,
  worktrees live in `.loop-worktrees/`, gitignored). The loop NEVER edits
  files in this main checkout — that stays true after graduation, not just
  at L1. Commits/branches happen only inside the attempt's worktree; the
  human merges.
- Mark the worktree `rejected`/`escalated` when the verifier or breaker says
  so; `loop-worktree cleanup` sweeps them. `active` is never swept.
- One logical fix per worktree/PR (reviewability), smallest diff that truly
  fixes it — but as many worktrees/PRs per tick as the queue and budget allow.
- Focused verification first: `bun run typecheck`, then any **existing**
  focused tests via `bun run test` (vitest). Never invent new test files
  unless the backlog item or owner explicitly asks. Never run the full
  `bun run check` gate unless the change warrants it. Never disable tests
  to go green.
- Max 3 attempts per item, enforced via loop-ledger.json + `loop-context --check`.
- `convex deploy` / `bun run deploy` are forbidden.

## Budget

- At 80% of daily cap: report-only for the rest of the day.
- `loop-pause-all` in STATE.md: exit immediately.

