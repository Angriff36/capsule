# Active Review Criteria

The subjective, perceptual acceptance criteria this project enforces via LLM-as-judge
backpressure (`llm-review.ts`). One row per criterion. This is the single place a project
lists which non-programmatic bars must pass before committing — Ralph reads it during
`src/lib` exploration and `loadActiveCriteria()` parses it.

Keep criteria **behavioral and observable** (what success looks like), not implementation.
The build loop runs each until it passes, accepting the natural variance of LLM judgment.

Columns:

- **Id** — stable identifier for the criterion.
- **Criteria** — the observable bar to evaluate.
- **Artifact** — path to the text/screenshot to judge (`.png/.jpg/.jpeg/.webp/.gif` →
  vision). Use `—` when the artifact is produced at test time and wired up by hand.
- **Intelligence** — `fast` (default, cheap) or `smart` (nuanced aesthetic/creative).

| Id      | Criteria                                                                                          | Artifact              | Intelligence |
| ------- | ------------------------------------------------------------------------------------------------- | --------------------- | ------------ |
| TONE-01 | Welcome copy is warm and conversational for design professionals while conveying the value prop   | —                     | fast         |
| UX-01   | Layout demonstrates clear visual hierarchy with one obvious primary action                        | ./tmp/dashboard.png   | fast         |
| BRAND-01| Visual design reads as professional brand identity for financial services without corporate sterility | ./tmp/homepage.png | smart        |
