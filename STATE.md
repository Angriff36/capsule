# Loop State — capsule

Last run: 2026-07-21T23:40:00Z (queue-drain mode: new critical bugs + cascade auth context block main CI)

## High Priority (queue-drain mode)

**issue #37 — CRITICAL: S7 PackList widening exposes cross-tenant data leak (2026-07-21 product-loop)**
- Widening PackList/PackListItem policies to kitchenAccess generated tenant-scoped list queries
  (listPackListByTenantId, listPackListItemByTenantId) that don't bind tenantId argument to auth context
- Kitchen users could pass another tenant's ID to these queries and receive cross-tenant pack-list data
- review-gate blocked push: VERDICT FAIL - "newly authorized kitchen users can pass another tenant's ID
  to listPackListByTenantId or listPackListItemByTenantId and receive cross-tenant pack-list data"
- Worktree at .loop-worktrees/prod-20260721T2355-S7-packlist-access-widening (commit a714427)
- This is a Manifest platform issue: TenantScoped entity read queries must bind tenantId to __auth.tenantId
- Product decision: does S7 need to block until platform fixes cross-tenant query binding, or can we work around?

**issue #35 — CRITICAL: PrepTask.claim writes Clerk user.id into Person FK (v.id("people"))**
- Same bug pattern as OD052/OD056: self-service commands write auth subject (user.id) into relation FK
- src/operations/event.manifest line ~338: `mutate assignedToId = user.id` where assignedToId is v.id("people")
- Breaks claim for all staff under real auth (id never matches Person table)
- Blocks: Event preparation self-service workflow
- Fix: resolve Person.authSubjectId == user.id or use roleAllows(workforceManageAccess)
- Pattern established: OD052, OD056, savedReportDefinitions (issue #24)

**issue #32 — CRITICAL: Main CI red (cascade auth context)**
- cascade-approve runs invoice reads under CALLER's role vs Finance role
- ~10 event/closeout proofs fail "Finance staff may read invoices"
- Product decision: should cascade operations run under caller or elevated role?
- Blocks: PRs #27 OD052, #28 S1, #31 S2, #36 S8
- Action: decide cascade authorization policy → fix wiring or adjust proofs

**issue #24 — ESCALATED: savedReportDefinitions.ownerId stores Clerk user_ id**
- 3rd entity with ownership pattern issue after TimeRecord/SavedReport
- Needs coordinated auth pattern fix + data repair, not isolated patches
- Product decision: entities store direct Person FK or resolve via authSubjectId?

**PR #27 OD052 — BLOCKED on #32 (HIGH-SCRUTINY: auth)**
- TimeRecord self-service identity via Person.authSubjectId
- Codex APPROVED, test failing on #32's cascade failures
- Worktree at .loop-worktrees/prod-20260721T1600-OD052-timerecord-identity

**PR #28 S1 — BLOCKED on #32**
- Inventory reservation aggregation proof
- Failing on cascade auth failures

**PR #31 S2 — BLOCKED on #32**
- Client.outstandingBalance over hasMany invoices
- Codex APPROVED, blocked on cascade fallout

**PR #36 S8 — BLOCKED on #32**
- Vendor open-order count + outstanding total
- Codex APPROVED, failing on cascade failures

**PR #33 S3 — CI green, awaiting auto-merge**
- ProductionBatch yield variance computeds
- Draft, ready for human review

**OD056 — REJECT (1/3 failures)**
- SavedReport owner identity mismatch
- Codex rejected: personId == user.id compares Person FK with auth subject
- Needs correct pattern: resolve Person.authSubjectId for identity checks
- Worktree preserved at .loop-worktrees/prod-20260721T1852-OD056-saved-report-owner

**OD054 — REJECT (1/3 failures)**
- Qualification.expire() guard
- Codex rejected: test uses past deadline, UI still offers Expire before deadline
- Needs UI changes to unblock

**PR #26 MERGED 2026-07-21T20:39Z** (fix-20260721-eol-gitattributes)
- Fixed Builder CRLF drift
- AUTO-MERGE enabled: green PRs land without manual review

**PRUNED/OBSOLETE (2026-07-21 issues):**
- **issue #25**: Convex fanOut where id= never matches people (Manifest upstream)
- **issue #22**: packListItems schema drift (same wiring drift as #32)
- **issue #21**: missing agent bridge modules (FIXED in 0226af6)
- **issue #20**: ownership ledger drift (FIXED in PR #26)
- **issue #17**: enter-recipe idempotency (FIXED in code)
- **issue #16**: Capsule MCP stale catalog (architectural decision)
- **issue #15**: prepTasks/dishTasks schema drift (same wiring drift as #32)

**OTHER ISSUES (product gap → backlog):**
- **issue #34**: No email delivery infrastructure for invoice reminders
- **issue #19**: Recipe.reinstate enhancement
- **issue #18**: Ingredient.discontinue not a wipe

**DEPENDENCY UPGRADES (blocked by #32):**
- actions/checkout v4→v6 (PR #7 draft, CI red)
- 5 Dependabot majors: plugin-react, vite, react-dom, react-router-dom, typescript

## Watch List

- **issue #19**: Recipe.reinstate enhancement (product-shaped → backlog)
- **issue #18**: Ingredient.discontinue not a wipe (product gap → backlog)
- Working tree carries normal human WIP (~35 modified, ~7 untracked)

## Recent Noise (ignored this run)

- Items #21, #20, #17 pruned (already fixed/obsolete)
- Dependabot major upgrade CI failures expected
- S1/OD052 CI failures need investigation, not retry without diagnosis
