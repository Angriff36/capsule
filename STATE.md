# Loop State — capsule

Last run: 2026-07-23T00:15:00Z (queue empty; main CI GREEN; budget: 782k/2M tokens)

## High Priority (queue-drain mode)

**READY FOR MERGE (2026-07-22):**
- PR #79: fix issue #32 cascade auth (Event.approve/closeout under event_manager) - CI GREEN, awaiting human review/merge
- PR #73: fix issue #70 Unicode corruption - DRAFT, needs review + ready-to-merge flag

**IN-PR DRAFT FIXES (awaiting #32 merge):**
- PR #27: OD052 TimeRecord self-service identity (HIGH-SCRUTINY: auth)
- PR #28: S1 inventory reservation aggregation proof
- PR #31: S2 Client.outstandingBalance over hasMany invoices
- PR #33: S3 ProductionBatch yield variance computeds
- PR #36: S8 Vendor open-order count + outstanding total
- PR #37: S9 Invoice.totalPaid over hasMany payments
- PR #7: actions/checkout v4→v6 upgrade (v7 already merged to main)

**FIXED (2026-07-22):**
- issue #70: Unicode corruption → PR #73 draft
- issue #71: PrepTaskDependency predecessorTask → verified OK (typecheck passes)
- issue #69: PrepTaskDependencies.css → verified OK (no CSS imports exist)
- issue #65: Event approval cascade auth → PR #79 shipped (issue #32 resolution)
- issue #61: Inventory audit log bypasses hooks → verified OK (check:supply-manifest passes)
- issue #60: Event UI bypassing generated hooks → verified OK (check:event-manifest passes)
- issue #59: Ingredient substitution hook missing → verified OK (build passes)
- issue #58: Event integration guard blocking → verified OK (check:event-manifest passes)

**ESCALATED (require product decision):**
- issue #35: PrepTask.claim Person FK resolution pattern
- issue #24: savedReportDefinitions ownership pattern

**MAIN CI STATUS:**
- CI GREEN (PR #79 cascade auth fix + #80 merge)
- All blocked PRs (#27, #28, #31, #33, #36, #37) can proceed once #79 merges

## Watch List

- Working tree carries normal human WIP (~235 modified, ~150 untracked)
- **Architectural decision needed #35**: How should staff self-service resolve Person FK from Clerk user.id?
- **Architectural decision needed #24**: savedReportDefinitions ownership pattern

## Recent Noise (ignored this run)

- Dependabot major upgrades (typescript 5.9→7.0, vite 6.4→8.1, react-router-dom 6.30→7.18) - require human risk decision
- Format warnings for existing codebase (274 files) unrelated to loop fixes
- Issue #57 (PrepBoard Router) already merged to main
- Baseline cap decay (ROOT_CAP vs module inventory) - fixed by commit 35b8bc2

## Post-Run Critique

- Main blocker RESOLVED: issue #32 cascade auth fixed by PR #79, CI GREEN
- Queue empty: all fixable items shipped or in PRs awaiting #32 merge
- Multiple PRs ready to proceed once #79 merges (#27, #28, #31, #33, #36, #37)
- Budget: 782k tokens spent (39% of daily cap), well under limit
- Efficiency: verified pruned items with focused checks, no full runs needed
