# Loop State — capsule

loop-pause-all

Last run: 2026-07-24T03:15:42Z (PR #107 Fixes #55; CI green; issue closed)
Paused: 2026-07-24T03:21:00Z — human requested stop loop

## High Priority

**All remaining open issues are non-fixable in loop (platform / product):**
- #98: Builder upstream (filed)
- #77-#72: Manifest platform limitations
- #54-#50: Manifest/Convex platform
- #44, #43: Convex platform
- #34: Email infra (product decision needed)
- #25: fanOut bug (Manifest)

**Draft PRs awaiting human merge:** #92, #93, #95–#107 (CI-green where last checked)

**✅ Recent ticks:** #55→#107, #15→#106, #18→#105, #24→#104 (+ prior)

**Platform/Escalated (not Capsule-loop-fixable):** #98 (Builder), #77–#72 (Manifest), #54–#50, #44, #43, #34, #25

## Watch List

- Main CI: GREEN (PR #107 check passed)
- After merge of Manifest/Convex PRs: human `npx convex deploy -y`
- Worktrees: survivors with unpushed work listed below

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

- #55 needed surgical mutations patches (restore fanOut deletedAt filter + reinstate previousQuantity guard order) because Builder baseline/codegen quirks — keep baselined mutations until IR emits correctly
