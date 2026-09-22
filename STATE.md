# Loop State — capsule

Last run: 2026-09-22T09:59Z maker tick (glm-tick): processed the newest loop-land verdict — #385 attempt 1 (fix-20260922T0917, be08617a) FAIL 09:43Z "no reviewer produced a verdict"; the feedback file holds an empty review with zero numbered reasons, so nothing in the patch was faulted — 1st FAIL, #385 stays attemptable. #383/#384 stay escalated (3 FAILs); #387 stays blocked (2 FAILs, compiler capability). Took #385 attempt 2 as a full-patch retry: fresh worktree fix-20260922T0947-venue-note-read-visibility on origin/dev 7600f50d (dev had not moved); the same one policy line in src/operations/venue-note.manifest (venueNoteRead = eventAccess AND (visibility != management_only OR manageAccess) — the savedReportRead shape); ONE manifest:regen (6 modifications, no conflicts, ownership hash + 6 baseline snapshots committed because rm is gated); the proof was rewritten cleanly (the feedback copy had two mojibake ellipses) and Prettier-formatted. Commit 43ddc25a: typecheck PASS, format:check PASS, focused proof PASS, FULL suite 447 suites/930 tests/0 failures PASS, pre-commit secret scan clean. Worktree clean; handoff written; branch = dev tip + one commit. Sweep KEEP list unchanged (12 loop KEEP + 4 non-loop skips).

## High Priority

2. **#383 QBO create retry can repeat a remote invoice or payment after lost local receipt — ESCALATED 2026-09-22 after 3 review FAILs** (max reached): (a) fix-20260921T2217 — reconciliation lacked stable operation identity; (b) fix-20260921T2311 — payment identity conflicts blocked valid subsequent payments; (c) fix-20260922T0018 — operation identity still relies on truncated DocNumber and payload comparison is incomplete (full review + rejected patch: .loop-worktrees/_feedback/fix-20260922T0018-qbo-op-token.md). Owner or upstream fix needed; the three rejected patches remain in _feedback for reference.
4. **#387 Stock reservation availability is checked by the client but not the canonical transaction.** BLOCKED on a Manifest compiler capability (2 FAILs recorded, below the 3-strike limit): attempt 1 review-REJECT (legacy holds unsafe + public releaseHold bypass; feedback fix-20260922T0103); attempt 2 proved no canonical aggregate gate can compile — only one-hop count_of hydrates in command bodies (evidence: _feedback/fix-20260922T0230-stock-canonical-reserve-attempt2-findings.md). Retake only after the upstream capability lands (one-hop sum over hasMany in command bodies, or reaction-only command visibility); the complete manifest-side fix and proof test are in the findings file.
5. **#384 Event lifecycle commands disagree with cancellation transitions and scoped readiness — BACK IN QUEUE (overseer 2026-09-22: only 2 real review FAILs; strike (c) was NOREVIEW, no reviewer reachable, and does not count): (a) fix-20260922T0318 — stale approved-stage lifecycle assertion broke the suite (feedback fix-20260922T0318-event-lifecycle-cancel.md); (b) fix-20260922T0545 — readiness freeze not regression-tested (feedback fix-20260922T0545-event-lifecycle-cancel.md); (c) fix-20260922T0902 — no reviewer produced a verdict (feedback fix-20260922T0902-event-lifecycle-cancel.md). Attempts 2, 4, 5 and 6 were COLLISIONs and never failed review; strike (c) was an infrastructure miss (reviewer unavailable), not a quality reject — owner may de-escalate. The review-ready attempt-7 bytes (cdabcd24: cancel guard mirrors the table quote through final, beginExecution unfrozen, approved declares executing, UI narrows confirmSalesLock to sales_lock, in-flight readiness proof asserted FALSE; full suite 932 green, byte-identical to the reviewer-cleared attempt-4/5 design) are preserved in the feedback file and in the worktree-less commit object for the owner or a retry session.
6. **#385 Venue note management_only visibility is not enforced by the read policy** — attempt 1 (fix-20260922T0917, be08617a) FAIL 2026-09-22T09:43Z "no reviewer produced a verdict" (infrastructure miss; the feedback file holds an empty review, no numbered reasons; 1st FAIL). Attempt 2 (fix-20260922T0947, 43ddc25a) handed to the lander 2026-09-22T09:59Z on dev tip 7600f50d, awaiting cross-model review (full-patch retry — nothing was faulted): venueNoteRead now eventAccess AND (visibility != management_only OR manageAccess) (savedReportRead shape); ordinary crew keep public/internal notes on every generated read, management_only needs a manageAccess role, foreign tenants see nothing; creation entries apply the same predicate, so crew cannot post management_only notes (generator behavior, noted in the commit body); no public/portal query reads venueNotes (grep evidence in body); no canonical Manifest-source port (capsule-specific). Proof: tests/proofs/venue-note-visibility.runtime.test.ts with person-first roles from linked Person records.
7. **#386 Cutover provider readiness uses global historical events and always passes.**
8. **#378 no command to change an event's client** — needs a manifest decision first (allowed stages, what invoices/payments/proposals/contracts do, contact re-seed). Owner call recorded in the issue before code.
9. **#373 `bun run agent:enter-recipe` points at a deleted script** — check Builder ownership of the package.json line before any edit; may be a Builder-emit fix.
10. **#367 Vite ignores source updates when the checkout is inside `.loop-worktrees`** — dev-env bug, vite watch config.
11. **#366 Event dossier actions clip outside the header on narrow phones** — CSS small.
12. **#357 Battle board print inherits the Event Day phone frame** — CSS small.
13. **#360 first-time capability registration rejects its own seeded required field** — needs a focused repro first.

Blocked: **#377 part 1 Delivery is Drop-Off only — ESCALATED 2026-09-21 after 3 review FAILs** (max reached): (a) gpt-5.6-sol 2026-09-21T17:25Z scheduling partial + rig ungoverned (feedback fix-20260921T0919); (b) 18:36Z Drop-Off packing can commit without a scheduled delivery (feedback fix-20260921T1037); (c) 19:18Z agent command paths still bypass the atomic pack-and-schedule seam (feedback fix-20260921T1141). The surviving hole is generator-level: raw command-API callers of PackList_markPacked bypass any authored seam, same Manifest upstream family as #377 part 2/#376/#356/#336. Attempt-3 design (atomic pack+schedule seam, drop_off gate, rig NLT hold, rollback proof) is preserved in the feedback files for the owner or an upstream fix. Also blocked: #377 part 2 (generator-level), #320 remainder (owner data), #338 remainder (Builder must emit a non-bash build line), #374 (follow-up batch from the working-event review), #382 (release receipt needs owner workflow evidence, not code).

## Landed

- 305c7473 2026-09-21 — #389: accepted-proposal booking retry returns the saved Event on replay (f5612481); gpt-5.6-sol APPROVE.
- ede51dc4 2026-09-21 — #377 part 3: markPacked zero-packed warn (PackListsPage + PackListDetailPage + warn-while-loading fail-safe); gpt-5.6-sol APPROVE. Browser pass of the dialog still owed.

## Watch List

- Upstream capability ask for #387 NOT filed this tick: the maker sandbox denies `gh issue create` (as it denies `gh issue comment`). Body ready at `.artifacts/issue387-upstream-body.md` — a session with gh permission files it verbatim against `Angriff36/capsule`.
- New 2026-09-21 review batch: #382 release receipt needs self-hosted backend identity + real workflow evidence — owner/process item.
- #381 fixed on dev (bffe2d97) and #380 fixed on dev (fcf2238a); both close at the next release.
- PR #240 (vite 6→8) CI red, PR #127 (zod 3→4) open, PR #388 draft (gate qualification) — owner call / in flight.
- #113 and #290 still open; confirm these two at the next release.
- #384 attempt 3 (9826d2c2) rides on regenerated transition bindings; browser pass still owed (cancel offered at quote/sales_lock/final, Begin execution from approved, NO confirmSalesLock at approved) by a session with browser access.
- Upstream Builder ask (file when a session has gh permission): lifecycle proof derives from the transition table only and ignores command stage guards, so confirmSalesLock claimed approved→executing once #384 widened the table; the UI narrows it via COMMAND_OFFERED_ONLY_FROM in EventLifecyclePolicy. Same gh-denied family as the #387 capability ask.
- Browser pass owed for the markPacked warn dialog (user-facing change; gates only prove types/format).
- Worktree sweep 2026-09-22 KEEP lines (uncommitted files, never delete):
  - prod-20260721T2100-OD055-payment-method-default
  - prod-202607211313-S2-client-outstanding-balance
  - prod-20260721T2355-S7-packlist-access-widening
  - prod-20260721T2136-S6-event-attendance-counts
  - prod-20260721T1852-OD056-saved-report-owner
  - prod-20260721T2340-issue35-preptask-claim
  - prod-20260722T1000-S5-ingredient-totals
  - prod-20260721T2345-S5-ingredient-totals
  - prod-20260721T2115-issue32-wiring-drift
  - prod-20260721T2000-S6-event-attendance
  - fix-20260721T1645-actions-checkout-v7
  - dep-20260721T1600-actions-checkout-7
  - fix-20260914-github-bugs (detached; its 9 local commits are superseded)
- Non-loop worktrees skipped by the sweep: purchasing-reschedule-20260912, feat-20260904-unslop-catalog, operations-authenticated, fix-20260914-github-bugs.

## Recent Noise

- BUDGET: the daily token cap and report-only mode are REMOVED (owner rule 2026-09-21, loop-constraints.md). The 2026-09-21 report-only ticks were compliant under the old rule; the same-day 22:17Z tick resumed fixes under the new rule and took #383.
- Dependabot CI failures are PR-branch only; dev green (2026-09-21 runs success).
- Old July PRs (#102–#107, #127–#131) are superseded by the September releases; closing them is an owner call.
- The maker sandbox denies `gh issue comment` and shell expansions; keep issue comments to sessions with the permission.
- Commit 1dbf4806 carried convex/_generated drift (api.js/server.d.ts/server.js): current convex CLI output adds the components export and drops the removed env export. Pre-existing on dev, committed with explanation in the body; typecheck proves nothing imports the removed export. Owner call or a session with gh permission should file the hygiene follow-up.

## Post-Run Critique

- The prior queue kept markPacked as "awaiting land" after it had landed; read the newest `loop-land` verdicts in loop-run-log.md first each tick, before trusting queue lines.
- The 2026-09-21 issue batch (#382–#389) came from the backend end-state review; several sit in HIGH-SCRUTINY families (QBO retry, read policy). Read the issue before coding; titles alone mislead.
- The Drop-Off gate took three designs: payload-key fanOut died on one-hop emit hydration, the two-term fanOut where died at compile ("Expected run, got ,"). Probe DSL limits with a cheap regen BEFORE building payload plumbing on an assumed grammar. Worktree codegen needs the local deployment config: the worktree carries gitignored .env.local + .convex/local/default/config.json copies that die with the tree.
- #383 attempt-2 lessons: a claimed identity can also be a self-inflicted bug (the fake harness initially matched ledger rows without scoping to the operation, mirroring the very race under test — scope rows like the real index query does). Never run codegen/format in parallel with vitest: files changed under a running suite once. git restore/checkout of single files is denied for the maker, so incidental generated drift either rides along (explained in the body) or is avoided by not running codegen unless the fix needs it.
- #387 lesson: a sum/filter aggregate inside a command constraint does NOT render on the createVia* creation entry — the non-create mutation path plans aggregate hydration, the createVia path renders checks without it, so the aggregate would silently pass exactly where the UI's useCreate* hook lands. Enforcement that must cover creation entries needs a self-only constraint on a counter row written by a reaction inside the same transaction (reaction guard/constraint failures still roll the trigger back). Also: the command API routes an initialization command name to its createVia* mutation only (no docId params), so instance-level replay proofs are unreachable through the dispatcher — prove replay with the first-class idempotency key.
- #384 lesson: the RUNTIME transition table can deny a stage move that a command guard accepts — beginExecution's approved→executing was dead ("Invalid state transition") even though its guard allowed approved. Guard-only analysis lies for ANY stage-mutating command; run a runtime proof or read the generated table.
- Maker sandbox: rm, git clean, PowerShell Copy-Item/Remove-Item and npx manifest fmt are all approval-gated for worktree paths. Regen scratch (orphan .builder/baselines snapshots from superseded regen runs) cannot be deleted, only committed — settle the design FIRST, then run manifest:regen once from the final source state.
- Maker sandbox (2026-09-22): compound Bash calls decompose into parts and any non-allowlisted part (echo, tail, cp, mkdir, git -C, shell redirects) blocks the whole call — run ONE plain allowlisted command per Bash call. Copy files into a worktree with Read+Write, not cp. Long commit bodies: Write the message into the gitignored _handoff dir and `git commit -F <file>`. `cd <worktree>` alone persists and is fine; never cd+git in one call. Recovering a collided attempt: the commit object survives the lander's deletion — `git show <sha>` for the source files, worktree regen rebuilds the rest.
