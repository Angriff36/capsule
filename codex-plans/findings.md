# Findings

- Existing feature attempt has uncommitted authored and generated changes. Preserve them while correcting confirmed defects from the supplied review.
- The current attempt persists a `calculationSnapshot` per contribution and renders an expandable ledger panel, but its query still uses a hard-coded role set, reads tables directly, limits contributions, and derives parts of history from mutable replacement data. The repair must focus on durable snapshots/history, accurate aggregation, and authorized source projection rather than more presentation-only work.
