# PL-BUILD first-increment build-gate evidence — 2026-09-21

Receipt for the first PL-BUILD increment (issue #380 root-count repair) on shared `dev`.
Documentation only here; the increment changed `scripts/check-baseline-decay.ts`, added
`tests/baseline-decay.test.ts`, and documented the count method in `BASELINE.md`. No UI or
product behavior changed. Workers `glm-5.3-flash` authored the code; orchestrator
`gpt-6-astra` read the diffs and verified independently. Review APPROVE covers this
root-count increment only, not all prior `dev` commits. No app-user policy, guard, or
approval was added. No subjective presentation work, so no J gate applies.

## Source identity

- HEAD before increment: `89c103bc94f79e745ac3b5bb4b8e38cfdeca1695`.
- Required upstream `89262916f59e32dbed5d63749999309a62586742` is present in history and
  was confirmed ancestral by the orchestrator preflight; `git pull --no-rebase origin dev`
  was up to date.
- Environment: Windows 11, Bun 1.3.4, Node 22.22.2 (toolchain banner,
  `.artifacts/iteration-pl-build/check-before.log`).
- Tested file identity (SHA-256, read by the receipt writer 2026-09-21):
  - `scripts/check-baseline-decay.ts`
    `3121b01cdcb4c9f60cc885f1b17f6abdd8b0eebe1352c61e65fd42f1bdf96675`
  - `tests/baseline-decay.test.ts`
    `1a684394f98837dcaf83baa9143191c11a1b733c4a5be02cc0f109c9280847a8`

## Why index counting is the fix (#380)

The old check ran `readdirSync` on one machine's directory. That failed twice, in opposite
directions:

1. **False failure from local artifacts.** Untracked and gitignored files
   (`.ralph-tasks`, `.ralph-workers.log`, an ignored plan backup, an untracked owner spec)
   pushed the local count to 75 against the 71 cap. A clean CI checkout has 71. The check
   failed a tree that ships green.
2. **Hidden indexed roots.** A file staged with `git add -f` under an ignored name was
   returned by `readdirSync`, but the old root-name list then excluded it, so its drift
   stayed hidden. A tracked root deleted from disk without staging the removal was
   instead absent from the directory listing. Both cases hid drift that a clean checkout
   would materialize.

The check now counts distinct root entries in the Git index
(`git ls-files --cached --full-name -z`). A clean checkout materializes exactly the index:
staged additions already count, staged removals already do not, untracked and gitignored
local artifacts never count. A 72nd indexed root still fails, deletion without staging
keeps failing, and a missing Git index refuses loudly instead of passing silently. The cap
is unchanged at 71.

## Gate runs (logs under `.artifacts/iteration-pl-build/`)

| Run | Result | Proof |
| --- | ------ | ----- |
| `check-before.log` | FAIL | Full chain green through `typecheck` + nine Manifest integration guards, then `format:check` exited 1 on pre-existing `loop-ledger.json` line endings (CRLF). |
| `test-before.log` | PASS | 193 files / 892 tests. Includes `tests/proofs/proposal-event-booking.runtime.test.ts` (11 tests), `tests/builder-regen-guard.test.ts` (2), and all nine `tests/*-manifest-integration-guard.test.ts`. No `baseline-decay.test.ts` yet. |
| `regen-check.log` | PASS | `bun run manifest:regen:check` — "generated output is current"; no tracked owned-output drift. |
| `check-after.log` | PASS | Full `bun run check`: typecheck, format, secrets, nine Manifest integration guards, coverage ratchet (194 files / 896 tests), frontend build (✓ 9.15s), `baseline-decay: ok`. |
| `test-after.log` | PASS | 194 files / 896 tests. Adds `tests/baseline-decay.test.ts` (4 tests). Booking proof still 11 tests; all guards still green. |

The expected counts (194/896) were taken from the log footers above, not assumed. The 4
new regression tests failed against the old directory-count implementation and pass
against the index-based implementation (increment run record; the before/after suite
delta — 193→194 files, 892→896 tests — corroborates the added file and test count).

`loop-ledger.json` was normalized CRLF→LF only, which unblocked `format:check`. Exact
backup: `.artifacts/iteration-pl-build/loop-ledger-before.json` (parsed JSON and
normalized text both equal). It stays unstaged and must not enter any commit for this
increment. All other startup file bytes are unchanged.

## Preview identity (local serving only)

`http://127.0.0.1:7813` was verified with the read-only
`powershell.exe -NoProfile -File ./ralph-preview.ps1 -Port 7813`; `.ralph.env` already
holds that exact command. Frontend PID 45384 serves `C:/Projects/capsule/src/main.tsx` by
source map, with a Vite command line rooted in this checkout, and its transformed frontend
points at `http://127.0.0.1:3210`. Backend PID 55244 has storage under
`C:/Projects/capsule/.convex/local/default` with the parent Convex dev process from this
checkout; anonymous `authStatus:getAuthStatus` returns status success. No process secrets
or full command lines were copied. This proves checkout-local serving only — not
authenticated business workflows and not production. The browser connector was
unavailable, so no browser interaction is claimed.

## Criterion outcome

- AC-356, AC-362, AC-395, AC-396, AC-439 → PASS on this Windows evidence.
- AC-162 stays PENDING: the Linux CI leg has not run for this increment. The Windows leg
  (`manifest:regen:check` + full `bun run check` green) is retained. PL-BUILD stays
  unchecked until that CI leg passes. No criterion was renumbered, deleted, retired, or
  weakened.
