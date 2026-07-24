# Loop State — capsule

Last run: 2026-07-24T01:10:00Z (no-op: queue empty)

## High Priority

**All open issues are non-fixable in loop:**
- #98: Builder upstream (filed)
- #77-#72: Manifest platform limitations
- #55-#50: Manifest/Convex platform
- #44, #43: Convex platform
- #34: Email infra (product decision needed)
- #25: fanOut bug (Manifest)
- #24: Auth pattern (escalated, HIGH-SCRUTINY)
- #18: Ingredient purge (requires schema/migration product decision)
- #15: prepTasks drift (PRUNED — was wiring drift, not actual drift)

**Draft PRs awaiting human merge:** #92, #93, #95-#102 (10 PRs, all CI-green)

**✅ Prior ticks (all shipped):** #85→#102, #16→#101, #17→#100, #19→#99, #38→#97, #39→#96, #89→#95, #46→#94, #20→#93, #35→#92, #91 (main CI fix)

**Open draft PRs awaiting human merge:** #92, #93, #95-#102 (10 PRs)

**Platform/Escalated (not fixable here):** #98 (Builder), #77-#72 (Manifest), #55-#50 (Manifest/Convex), #44, #43, #34 (infra), #25 (fanOut bug), #24 (auth pattern - may be fixed by #95)

**PRUNED as obsolete:** #15 (schema drift was wiring drift, not actual drift)

## Watch List

- Main CI: GREEN (last 10 runs success)
- Daily spend: ~11k / 2M cap
- Worktrees: 13 survivors with unpushed work (listed below)

## Worktree Survivors (unpushed work - preserve)

- dep-20260721T1600-actions-checkout-7 [1612ca5, ahead=1]
- fix-20260721T1645-actions-checkout-v7 [9fd577c, ahead=1]
- fix-20260723T2037-issue-24-savedreport-owner [fb3dbf8, ahead=12]
- prod-202607211313-S2-client-outstanding-balance [9031c63, ahead=1]
- prod-20260721T1852-OD056-saved-report-owner [9dd1b20, ahead=1]
- prod-20260721T2000-S6-event-attendance [f945e0f, ahead=1]
- prod-20260721T2100-OD055-payment-method-default [0b3f680, ahead=2]
- prod-20260721T2115-issue32-wiring-drift [2459d6d, ahead=1]
- prod-20260721T2136-S6-event-attendance-counts [d517984, ahead=1]
- prod-20260721T2340-issue35-preptask-claim [b497f25, ahead=1]
- prod-20260721T2345-S5-ingredient-totals [bc13023, ahead=1]
- prod-20260721T2355-S7-packlist-access-widening [a714427, ahead=1]
- prod-20260722T1000-S5-ingredient-totals [e67e9eb, ahead=2]

## Post-Run Critique

- Docs claimed bootstrap that code never did — wire CapsuleEnvLocalLoader at host entry
