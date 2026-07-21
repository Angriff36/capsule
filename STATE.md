# Loop State — capsule

Last run: 2026-07-20T21:05:00Z (triage: CI GREEN on main, no actionable items)

**2026-07-21 overseer intervention (Fable)**: the "systemic Builder tooling
failure" that blocked all 8 product-loop items is RESOLVED — root cause was
worktrees branched from a pre-2f30419 base (CRLF checkout vs LF ownership
hashes), not a Builder limitation. Residual package.json phantom staleness
fixed via .gitattributes in PR #26 (Codex APPROVE; fresh-worktree
regen:check exit 0 verified). product-loop.cmd BUILDER_DIR had a literal
backspace byte — fixed. Backlog items reset to open, strikes cleared, stale
worktrees pruned (uncommitted diffs salvaged to
`.loop-worktrees/_salvage-20260721/`). Product loop re-triggered manually.
Second blocker found and fixed: 904ace6 (fix(agent)) referenced ~20 src/agent
modules that were never git-added — every fresh worktree failed typecheck
(TS2307), and PR CI inherited the breakage. Completed the commit by adding the
src/agent WIP (verified: scratch worktree from main + those files → tsc exit
0). NOTE for human: local main is ahead of origin and 904ace6 was red on CI
until the completion commit — push when ready. PR #26 rebased onto origin/main
so it carries only the .gitattributes fix.

## High Priority (queue-drain rules 2026-07-21: attempt everything reviewable; one worktree + draft PR per item)

- **ATTEMPT: Dependabot major upgrades — one worktree + draft PR each, in this
  order** (bump, fix breakage, typecheck + focused tests, Codex gate, draft PR
  with evidence; 3 strikes per item then escalate):
  1. actions/checkout 4→7 (CI-only, smallest)
  2. @vitejs/plugin-react 4.7→6.0
  3. vite 6.4→8.1 (pair with plugin-react if they must move together)
  4. react-dom + @types/react-dom
  5. react-router-dom 6.30→7.18 (real API changes expected — read the v7 migration notes)
  6. typescript 5.9→7.0 (expect new errors; fix them, do not suppress)
  Do NOT push to the Dependabot branches — fresh loop/* worktree branches; note
  in each PR body which Dependabot PR it supersedes.
- **CI GREEN on main** (status note): `fix(preset)` (87fb200) passed 2026-07-19.
- **All commercial-billing work shipped locally** — awaiting human push authorization:
  Closeout→Invoice (6238bdc), Proposal→Event (ee6a94e), Invoice backlinks (0e5bd98),
  Client/Contract→Invoice (680e0d6), PaymentMethod UI (9119692), SavedReportDefinition (bb2ffae),
  Slice 9 (f2ec316), Slice 8b (17a6b60), Slice 8 (3a7d5c6), Slice 7b (800ca7d), Slice 6 (679afd6).
- **All 6 Dependabot PRs blocked**: major upgrades (typescript 5.9→7.0, vite 6.4→8.1,
  react-router-dom 6.30→7.18, react-dom, @vitejs/plugin-react 4.7→6.0, actions/checkout 4→7)
  need human risk decision.

## Watch List

- Working tree carries normal human WIP (~72 modified, ~20 untracked).
- Next: Event dossier → Invoice when EventDetail WIP clears; OD035/OD038 automation;
  report chart render.

## Recent Noise (ignored this run)

- No new actionable items beyond CI RED and Dependabot PRs.
- Working tree has normal in-flight work (event prep coordination, various features).
- All commercial-billing work is locally committed and ready to push when authorized.
