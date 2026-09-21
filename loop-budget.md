# Loop Budget — capsule

**There is NO token budget and NO report-only mode (owner rule 2026-09-21).**

Why it was removed: an AI session invented the cap in July (400k, to protect
Anthropic quota when ticks ran on Claude). Ticks moved to GLM / MiniMax
flat-rate plans the same month, and the cap stayed as a "2M runaway backstop".
It measured nothing real: the number was the sum of the maker's own
`tokens_estimate` guesses. It wrongly froze the loop on 2026-07-21, and on
2026-09-21 - the first unattended day of the new design - it stopped a
working loop at 1 PM.

What limits the loop instead:

- 3 review FAILs on one item -> escalated, not retried
- 4 rounds per tick (`.claude/loop-tick.cmd`), one fix per round
- a new tick never starts while one is running (ticks fire every hour, 24/7)
- each provider's own plan limit (z.ai / MiniMax for the maker, OpenAI for the reviewer)

`tokens_estimate` in loop-run-log.md is still welcome as information. Nothing gates on it.

## Kill switch

- `loop-pause-all` line in STATE.md — every tick checks it first
- Disable the `capsule-loop-tick` scheduled task to stop the heartbeat entirely