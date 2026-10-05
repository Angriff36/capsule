# Staff-to-guest staffing ratios plan

## Goal
Implement tenant-scoped staffing ratio rules and use them to synchronize safe, draft staffing suggestions for confirmed/accepted events, with settings and event UI.

## Phases
- [complete] Inspect current manifests, staffing shifts, event acceptance, and UI patterns.
- [in_progress] Design source-backed changes and update authored manifest/seams/UI.
- [pending] Regenerate contracts and fix integration/type issues.
- [pending] Run focused verification, required checks, and temporary Playwright verification.
- [pending] Review final diff and prepare handoff.

## Constraints
- Preserve unrelated work and generated-file ownership.
- Do not deploy, push, or commit.
- Add only feature-focused tests required by the request and acceptance contract.
- Use `bun run manifest:regen` for generated artifacts.

## Design decision
- Reuse `StaffingTemplate` and `EventStaffNeed`: they already model per-style per-guest rules and safe unfilled scheduling drafts. Extend their selection from one whole-template winner to per-role precedence, so service-style rules win for the same role while any-style rules still contribute other roles.
