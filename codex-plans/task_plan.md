# Travel fee implementation plan

## Goal
Implement configurable distance-based travel fees, per-event overrides, proposal/invoice snapshots, and matching UI without disturbing unrelated work.

## Phases
1. [in_progress] Map existing event, proposal, invoice, manifest, and UI seams.
2. [pending] Add calculator, domain source, and generated artifacts.
3. [pending] Integrate draft proposal/invoice persistence and authored UI.
4. [pending] Run focused and required validation, including temporary Playwright verification.
5. [pending] Review final diff and prepare for independent review.

## Constraints
- Preserve existing user changes and never edit generated sources by hand.
- Use `bun run manifest:regen` after manifest changes.
- No deployment, release, commit, or push.
- Follow DESIGN.md and reuse catalog components.
