# Cascade preview before high-fan-out commands

## Goal
Add truthful, read-only side-effect previews before the existing approve-event, demand-supersede, and closeout-confirm UI commands, with a shared confirmation dialog.

## Phases
- [in_progress] Confirm real command/UI paths and downstream effects.
- [pending] Implement bounded tenant-scoped preview queries and shared UI wiring.
- [pending] Run focused checks and required temporary Playwright verification.
- [pending] Inspect final diff and leave it ready for independent review.

## Constraints
- Preserve unrelated work; do not commit, push, deploy, regenerate, or edit generated files unless required.
- Preview queries make no writes and show only effects that existing commands actually cause.
- Follow DESIGN.md and existing shared component patterns.
