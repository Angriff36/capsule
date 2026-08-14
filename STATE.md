# Loop State — capsule

Last run: 2026-08-14T14:30:00Z (queue-drain tick, NO-OP)
Resumed: 2026-08-01 — human requested loop continue (pause of 2026-07-24 removed)

## High Priority

**ESCALATED (2/3 failures reached - scope/product decision needed):**
- #141: [High] Create Event from proposal drops data — ESCALATED (2/3 failures). Needs: proposal→event linking for menu copy cascade, real venue selection (not free-text), proper local datetime conversion, end time prefill. Product decision needed: comprehensive fix vs scoped approach.

**Recently shipped (awaiting human merge on draft PRs):**
- #156: ✅ FIXED (PR #156, Codex APPROVED) — CI green, awaiting human merge
- #155: ✅ FIXED (PR #155) — CI green, awaiting human merge
- #154: ✅ FIXED (PR #154) — CI green, awaiting human merge
- #153: ✅ FIXED (PR #153) — CI green, awaiting human merge
- #152: ✅ FIXED (PR #152) — CI green, awaiting human merge

**Stale loop PRs (likely conflicting, need human rebase/close decision):**
- #102-#107: 6 PRs (auth, schema, MCP, recipe, prep tasks, deny-guard, ownership, format) — from 2026-07-24, likely conflicting with recent main changes
- #127-#131: 5 Dependabot PRs — clerk, zod major versions failing (non-blocking); fontsource, vite, react-dom upgrades stale

**Remaining UI audit issues (Medium/Low - not High Priority):**
- #142-#151: Pack-list errors, equipment/reservation dead-ends, dish tags discarded, food cost missing, time records not event-linked, date field mangling, stock unit unconstrained, polish cluster

**Platform/Escalated (non-fixable in loop):**
- #136: [Critical] Invoice numbers raw DB IDs — ESCALATED (requires sequential invoice number generator + event→invoice link architecture)
- #98: Builder upstream (filed)
- #77-#72, #54-#50, #44, #43: Manifest/Convex platform limitations
- #34: Email infra (product decision needed)
- #25: fanOut bug (Manifest)
- #125: UI audit gaps (backend/product decisions)
- #124: Dashboard parity delta list
- #123: Inbound message capture (external prerequisites)
- #122: Nowsta payroll sync (blocked on API credentials)
- #121: Owner input needed (commission/split basis)
- #119: Occasion/service style selects render empty in production
- #113: bun run seed is a no-op

## Watch List

- Main CI: GREEN (latest SUCCESS 2026-08-12)
- 2 failing Dependabot PRs: clerk/react-6.12.8, zod-4.4.3 (major version upgrades, not blocking)
- 10 draft PRs awaiting human merge (#156-#152, #127-#131)
- Worktrees: 12 survivors (2026-08-13T13:30:00Z): prod-20260721T2100-OD055-payment-method-default (ahead=2), prod-202607211313-S2-client-outstanding-balance (ahead=1), prod-20260721T2355-S7-packlist-access-widening (ahead=1), prod-20260721T2136-S6-event-attendance-counts (ahead=1), prod-20260721T1852-OD056-saved-report-owner (ahead=1), prod-20260721T2340-issue35-preptask-claim (ahead=1), prod-20260722T1000-S5-ingredient-totals (ahead=2), prod-20260721T2345-S5-ingredient-totals (ahead=1), prod-20260721T2115-issue32-wiring-drift (ahead=1), prod-20260721T2000-S6-event-attendance (ahead=1), fix-20260721T1645-actions-checkout-v7 (ahead=1), dep-20260721T1600-actions-checkout-7 (ahead=1)

## Recent Noise (ignored this run)

- None this run - all recent issues are genuine defects from UI audit or platform limitations

## Post-Run Critique

- Triage complete (2026-08-14T14:30:00Z): NO-OP tick. Queue drained — no new actionable High Priority items. #156-#152 await human merge (all MERGEABLE + CI SUCCESS, #156 Codex APPROVED). #141 ESCALATED (2/3 failures) needs product decision: comprehensive fix vs scoped approach. Stale loop PRs (#102-#107, #127-#131) need human rebase/close. CI healthy (latest main SUCCESS 2026-08-11, Dependabot clerk/zod major-version failures non-blocking). 12 worktree survivors. Budget: ~15k tokens this run vs 2M cap.
