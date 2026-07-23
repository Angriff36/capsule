# Loop State — capsule

Last run: 2026-07-23T17:30:00Z (CI RED; queue: 15 issues; budget: 80k/2M tokens)

## High Priority (fix queue - drain in order)

**CRITICAL: Main CI RED - FIX READY AWAITING REVIEW**
- Fix ready in worktree: loop/fix-20260723T1700-main-ci-regen
- Fix: `bun run manifest:regen` refreshed Builder hashes (.builder/ownership.json, manifest-context-summary.json, wiring files)
- Scope: Only Builder-generated files, no hand-edits, minimal correct fix
- Review status: Codex CLI error (exit code 1), Cursor CLI failed (path length). No cross-model verdict obtained.
- ACTION NEEDED: Human to review diff (git diff loop/fix-20260723T1700-main-ci-regen main) or run review gate manually
- Per loop-constraints: Cannot push without cross-model APPROVE verdict

**CRITICAL: PR #27 CONFLICTING**
- HIGH-SCRUTINY auth fix (TimeRecord self-service identity) has merge conflicts
- Needs rebase onto current main before can merge
- Blocks: depends on cascade auth fix (issue #32) which may have regressed

**Infrastructure Issues (block dev/deploy):**
- issue #88: Schema drift - required Manifest fields block local Convex sync (editionNumber, headcountOverride) - NEW
- issue #85: Capsule MCP server fails live tool discovery (mcp_auth timeout) - NEW
- issue #83: Missing/mismatched CONVEX_FIELD_ENCRYPTION_KEY breaks create - NEW

**Manifest Platform Defects (escalate to backlog):**
- issue #78: Event feature hook violations block bun run check
- issue #77: Manifest projects self.id as nonexistent doc.id in Convex constraints
- issue #76: Generated encrypted money fields write strings into numeric Convex schema
- issue #75: Enforce approved time-off overlap in generated Shift.schedule paths
- issue #74: Manifest Convex schedules cannot securely sweep tenant-scoped commands
- issue #72: Manifest Convex nested aggregate hydration emits invalid Doc typing
- issue #71: Generated PrepTaskDependency mutation reads missing predecessorTask property
- issue #70: Format gate blocked by malformed loop-ledger.json (RESOLVED in STATE.md earlier)
- issue #69: Production build blocked by missing PrepTaskDependencies.css
- issue #68: Invalid loop-ledger.json blocks format:check (same as #70)
- issue #65: Event approval invoice reaction fails under event-manager authorization (was #32)
- issue #64: Supply guard blocked by InventoryAuditLog direct Convex action hook

**Unpushed Worktrees (KEPT by sweep - 12 trees):**
- loop/prod-20260721T2100-OD055-payment-method-default (ahead=2)
- loop/prod-202607211313-S2-client-outstanding-balance (ahead=1)
- loop/prod-20260721T2355-S7-packlist-access-widening (ahead=1)
- loop/prod-20260721T2136-S6-event-attendance-counts (ahead=1)
- loop/prod-20260721T1852-OD056-saved-report-owner (ahead=1)
- loop/prod-20260721T2340-issue35-preptask-claim (ahead=1)
- loop/prod-20260722T1000-S5-ingredient-totals (ahead=2)
- loop/prod-20260721T2345-S5-ingredient-totals (ahead=1)
- loop/prod-20260721T2115-issue32-wiring-drift (ahead=1)
- loop/prod-20260721T2000-S6-event-attendance (ahead=1)
- loop/fix-20260721T1645-actions-checkout-v7 (ahead=1)
- loop/dep-20260721T1600-actions-checkout-7 (ahead=1)

## Watch List

- 15 open issues on GitHub (many Manifest platform defects)
- Working tree: ~36 modified files (human WIP), ~4 untracked
- Dependabot major upgrades (TS 5.9→7.0, vite 6.4→8.1, react-router-dom 6.30→7.18) - human decision needed

## Recent Noise (ignored this run)

- Multiple issues (#70, #68, #69, #71, #78) appear to be re-filed versions of previously verified items
- Format warnings for existing codebase (274 files) - unrelated to loop fixes
- actions/checkout v7 upgrade failed (was handled in PR #7 as v6)

## Post-Run Critique

- Main CI regression occurred after PR #84 merge - manifest:regen:check now fails
- Multiple infrastructure issues (#88, #85, #83) are NEW and block development
- PR #27 conflicting - needs rebase
- Queue mostly Manifest platform defects requiring product/architecture decisions
- This tick: budget minimal (5k tokens), queue-drain not possible until CI fixed
