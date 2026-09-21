# Loop Constraints — capsule

> The `loop-constraints` skill reads this file at the start of every run.
> Constraints here are **binding** — the agent MUST follow them.

## Phase

- **AUTO-LAND (owner decision 2026-09-20; replaces the draft-PR design).**
  **The independent review is the safety boundary**: every change is
  worktree-isolated, test-verified, and reviewed by a different provider than
  the maker (see Check & Land). APPROVE → the lander puts the fix on the
  shared `dev` branch at once: no PR, no human step. `dev` is the work copy; production changes only
  when the owner says "release". The loop does NOT pre-filter work into "safe"
  and "unsafe". Anything reviewable is attemptable.
  Why the change: the owner does not code and cannot approve PRs. Under the
  draft-PR design 26 of 37 loop PRs sat unapproved, went stale against a
  moving tree, and were thrown away — most of them never looked at.
- **One fix at a time, as many per tick as the budget allows.** Each fix
  starts from the newest `origin/dev`, lands, and only then does the next one
  start. NEVER hold two fixes open together — nearly every fix regenerates
  the same Builder-owned files, so parallel fixes collide.
- High-scrutiny areas (auth, payments, billing, schema, manifest sources) are
  ATTEMPTABLE, not skipped — they land on `dev` like the rest, but the commit
  subject starts "[loop] HIGH-SCRUTINY:" and STATE.md lists them under
  "Landed - check before release" so the release review sees them.
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

- **NEVER switch branches, checkout, or commit in the human's main checkout
  (C:\Projects\capsule).** AboardAI's board and the human's tools follow the
  checkout's current branch — a branch switch blanks his workspace (happened
  2026-07-22). ALL landing/batch/fix work happens in a worktree, no
  exceptions, including batch commits of the shared tree's WIP.

- The human works in this checkout; the tree often carries in-flight changes.
- In the MAIN checkout: NEVER `git add`, commit, stash, checkout, or reset —
  the loop writes only STATE.md, loop-run-log.md, loop-budget.md,
  loop-ledger.json there. Read-only git commands are fine.
- Code edits happen ONLY inside a fresh worktree:
  `git fetch origin dev` then
  `git worktree add .loop-worktrees/<run-id> -b loop/<run-id> origin/dev`.
  add/commit inside that worktree is allowed.

## Check & Land (the maker does neither — owner rule 2026-09-20)

- **The maker never checks and never lands its own work.** It commits in its
  worktree, writes `.loop-worktrees/_handoff/<run-id>.json`, and stops. It
  never pushes, never runs or reads a review, never opens a PR. Its session
  runs with permission checks ON and a deny list
  (`.claude/loop-maker-settings.json`), and `.githooks/pre-push` refuses any
  push from a loop worktree that does not come from the lander.
- **The lander is `.claude/loop-land.ps1` — plain code, no AI.** It brings
  the worktree up to date with `origin/dev`, reruns typecheck itself, then
  asks a reviewer from a DIFFERENT PROVIDER than the maker. APPROVE → it
  pushes the commit onto `dev`. Anything else → it records why in
  loop-ledger.json + loop-run-log.md and deletes the attempt. No verdict from
  any reviewer counts as REJECT. There is NO override — the 2026-07-22
  `REVIEW_GATE=0` push (PR #31) was a violation, not a precedent.
- A collision with newer `dev` work is NOT a strike on the item: the lander
  records COLLISION and the maker retries from a fresh worktree.
- `dev` pushes are chores (Vercel ignores non-`main` refs). `main` is only
  ever changed by `bash scripts/release.sh` when the owner says "release";
  the pre-push hook blocks every other push to `main`.
- Reviewer selection (owner 2026-09-20): **the reviewer must come from a
  different PROVIDER than the maker**, and the lander picks and runs it — the
  maker never does. The maker is GLM (z.ai) or MiniMax; the reviewer is
  Codex gpt-5.6-sol (OpenAI), and when Codex gives no verdict (quota/outage),
  grok via Cursor CLI (`cursor-grok-4.5-high-fast`, xAI). No verdict from
  either → the attempt is recorded as FAIL and nothing lands. The lander
  stamps the landed commit with `Reviewed-by: <model> APPROVE`.

## Paths (hard rules — the short list that is NOT about caution)

- Never edit or commit `.env`, `.env.*`, `**/secrets/**`, `**/credentials/**`
  (loop branches get pushed; a leaked secret is unrecallable).
- Never HAND-EDIT generated output — `generated/**`, `convex/_generated/**`,
  Builder-owned files per `.builder/ownership.json`. Not caution: hand-edits
  to generated files are wrong by construction (the next regen erases them).
  When a fix requires manifest source changes, edit `src/**/*.manifest` in
  the worktree AND run `bun run manifest:regen` inside that worktree so
  source + generated output land together in one reviewable commit. (Regen in
  the MAIN checkout stays forbidden — it would stomp human WIP.)
- Never leave `*.manifest` under `.artifacts/` (or other non-`src/` scratch
  dirs) in a worktree. Builder/manifest globs pick them up; relative `use`
  paths then resolve to e.g. `/.artifacts/workforce/...` and regen dies.
- Manifest-source (C:\Projects\Manifest-source) is canonical for the domain
  model: a commit that edits capsule `.manifest` files must say in its body
  whether the change needs porting to canonical (or came from it).
- Formatting policy (human-approved 2026-07-19): Prettier is a normal CI gate
  but is for CODE only — it must never touch generated trees OR doc files
  (`*.md`/`*.mdx` are in `.prettierignore` alongside the generated
  exclusions; extend the ignore file rather than reformatting). `.manifest`
  sources are formatted ONLY by the Manifest CLI's own formatter
  (`npx manifest fmt`), run whenever `.manifest` files change.
- Auth, payments, billing, `convex/schema.ts`: attemptable with a
  HIGH-SCRUTINY commit subject (see Phase); do not silently skip these items.

## Code (applies at L2)

- ALL code edits happen in an isolated git worktree — one per fix attempt
  (`npx @cobusgreyling/loop-worktree create --run-id <id> --pattern <p>`,
  worktrees live in `.loop-worktrees/`, gitignored). The loop NEVER edits
  files in this main checkout — that stays true after graduation, not just
  at L1. Commits/branches happen only inside the attempt's worktree; the
  lander lands them.
- Mark the worktree `rejected`/`escalated` when the verifier or breaker says
  so; `loop-worktree cleanup` sweeps them. `active` is never swept.
- One logical fix per worktree (reviewability), smallest diff that truly
  fixes it, one at a time.
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

