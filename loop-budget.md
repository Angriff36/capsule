# Loop Budget — capsule

> Primary loop: Daily Triage (2h work-hours variant), L1 report-only.

## Daily limits

| Loop                         | Max runs/day | Max tokens/day     | Max sub-agent spawns/run |
| ---------------------------- | ------------ | ------------------ | ------------------------ |
| Triage ticks (L1)            | 6            | 400k               | 0                        |
| Dispatch + verify (L2 — OFF) | 0            | 0 until graduation | 2                        |

Expected L1 spend: ~5k/tick no-op, ~50k/tick full triage → 30–300k/day.

## On budget exceed

1. Remaining ticks today become no-ops (log + exit)
2. Append event to `loop-run-log.md`
3. Flag in STATE.md High Priority

## Kill switch

- `loop-pause-all` line in STATE.md — every tick checks it first
- Stop the `/loop` schedule to kill the heartbeat entirely
