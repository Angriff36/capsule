# Client tasting appointments plan

## Goal
Deliver tenant-safe client tastings: scheduling, catalog-backed sample dishes, derived prep, feedback, and idempotent application of approved dishes to a mutable proposal draft.

## Phases
- [complete] Map existing sales, culinary, Manifest, and UI seams.
- [in_progress] Add authored Manifest model and regenerate owned contracts.
- [pending] Build backend seams and focused proof coverage.
- [pending] Add sales UI and feature navigation.
- [pending] Run focused gates and temporary Playwright verification.
- [pending] Inspect final diff for independent review readiness.

## Constraints
- Preserve existing work; do not commit, push, deploy, or modify generated files directly.
- Use `bun run manifest:regen` for all generated output.
- Never mutate accepted/final proposal revisions; use existing proposal pricing and draft paths.
- Keep every read/write tenant-scoped and prevent tasting demand from affecting events.

## Decisions
- A tasting is a sales entity, not an Event extension.
- Prep is derived on demand from selected catalog dishes and tasting portions.
- Applying approved selections is idempotent and uses the existing proposal revision path.
