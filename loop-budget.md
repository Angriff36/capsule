# Loop Budget — capsule

> Primary loop: queue-drain triage + fix ticks (L2 standing), GLM/MiniMax
> worker plan — ZERO Anthropic spend. Updated 2026-07-21 (was stale L1 text
> with a 400k cap meant to protect Anthropic quota).

## Daily limits

**"Today" = calendar date of the tick (local).** Compute today's spend by
summing `tokens_estimate` ONLY from `loop-run-log.md` entries whose `run_id`
date matches today. Yesterday's spend NEVER counts against today — this was
the bug that froze the loop on 2026-07-21 (it read a running total of 333k
from 07-20 entries and went report-only at 2 AM on a fresh day).

| Loop                          | Max runs/day | Max tokens/day (GLM/MiniMax) |
| ----------------------------- | ------------ | ---------------------------- |
| Triage + fix ticks (L2)       | no cap       | 2M (runaway backstop only)   |

The token cap is a runaway-loop backstop, not a cost control — worker-plan
tokens are flat-rate and cost no Anthropic quota. A queue-drain tick doing
several Dependabot upgrades may legitimately spend several hundred k.

## On budget exceed (>2M today)

1. Remaining ticks today become report-only (log + exit)
2. Append event to `loop-run-log.md`
3. Flag in STATE.md High Priority

## Kill switch

- `loop-pause-all` line in STATE.md — every tick checks it first
- Stop the `capsule-loop-tick` scheduled task to kill the heartbeat entirely
