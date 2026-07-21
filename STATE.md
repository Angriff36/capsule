# Loop State — capsule

Last run: 2026-07-21T19:45:00Z (queue-drain tick: OD052 & S1 rebased onto main, CI expected green; next: OD056 or schema regens)

## High Priority (queue-drain mode)

**PR #27 OD052 - REBASED (CI expected green)**
- TimeRecord self-service identity via Person.authSubjectId
- Rebased onto main (includes agent modules fix 0226af6)
- Codex APPROVED, awaiting CI verification

**PR #28 S1 - REBASED (CI expected green)**
- Inventory reservation aggregation proof
- Rebased onto main (includes agent modules fix)
- Test at tests/proofs/inventory-reservation-aggregation.runtime.test.ts

**OD056 - REJECT (1/3 failures - Codex rejected identity fix)**
- SavedReport owner identity mismatch
- Codex rejected: personId == user.id compares Person FK with auth subject (wrong)
- Removed owner-scoped reads (broke existing workflow)
- Needs correct pattern: resolve Person.authSubjectId for identity checks
- Worktree preserved at .loop-worktrees/prod-20260721T1852-OD056-saved-report-owner

**PR #26 MERGED by human 2026-07-21T20:39Z (verified via gh). Human also
enabled repo AUTO-MERGE: green PRs now land without manual review — treat CI
green as the final gate and keep Codex review verdicts in PR bodies. Local
main has origin merged back in (4f5190f).**

**MAIN CI IS RED — issue #32 (overseer 2026-07-22, verified in clean
worktrees): committed wiring drifted from committed manifests; after faithful
regen the cascade-approve feature (cee67e3) still runs invoice reads under the
CALLER's role → ~10 event/closeout proofs throw "Finance staff may read
invoices"; plus governed-creation-mappings 53≠52 and navigation-catalog
/facilities≠/admin. This is a PRODUCT decision (cascade authorization
context), not a test-tweak — do NOT paper over by editing tests. Hold
manifest-touching pushes/rebases until #32 resolves; PR #27 was updated with
main merged in (fixes #29/#30 CI noise) and will stay red only on #32's
failures.**
- Pre-push from worktrees was actually fixed by repairing `BUILDER_DIR`: both
  `.claude/product-loop.cmd` and `.claude/loop-tick.cmd` contained a literal
  backspace byte (`C:\Projects<BS>uilder`); fixed, plus user-level
  `setx BUILDER_DIR C:\Projects\builder`. PR #26 only fixes EOL phantom
  staleness for fresh checkouts.
- PR #27/#28 CI red root causes (verified from run logs, NOT fixed by rebase):
  **issue #29** (agent-document-enter proof hits live OIDC via
  CapsuleRecipeStatusLoader — escapes the convex-test harness) and
  **issue #30** (capsule-command-catalog test expects 21 capabilities, wiring
  exposes 270). Both defect-shaped → fix queue. Every PR from main stays red
  until they land.

**NEW BUGS FROM 2026-07-21 (defect-shaped → fix queue):**
- **issue #25**: Convex fanOut where id= never matches people (Manifest upstream bug - wait for fix, then bump pin)
- **issue #24**: savedReportDefinitions.ownerId stores Clerk user_ id (schema drift; needs regen + data repair - ready to attempt)
- **issue #22**: packListItems schema drift (orphan fields; needs regen + data repair - ready to attempt)
- **issue #21**: missing agent bridge modules (PRUNED - fixed in 0226af6)
- **issue #20**: ownership ledger drift (PRUNED - fixed in PR #26)
- **issue #17**: enter-recipe idempotency returns retired recipe ids (PRUNED - generation-bump retry in code at L151-174)
- **issue #16**: Capsule MCP stale capability catalog (ESCALATED - needs architectural decision: catalog rebuild vs host restart)
- **issue #15**: prepTasks/dishTasks schema drift (needs regen + data repair - ready to attempt)

**DEPENDENCY UPGRADES (attemptable from main checkout):**
- actions/checkout v4→v6 (PR #7 draft exists, needs update/push)
- 5 remaining Dependabot majors: plugin-react, vite, react-dom, react-router-dom, typescript

## Watch List

- **issue #19**: Recipe.reinstate enhancement (product-shaped → backlog)
- **issue #18**: Ingredient.discontinue not a wipe (product gap → backlog)
- Working tree carries normal human WIP (~35 modified, ~7 untracked)

## Recent Noise (ignored this run)

- Items #21, #20, #17 pruned (already fixed/obsolete)
- Dependabot major upgrade CI failures expected
- S1/OD052 CI failures need investigation, not retry without diagnosis
