# Findings

## Initial
- The feature must reuse real event and shift semantics discovered in this checkout; the supplied implementation brief is only a hypothesis.
- This change includes authored UI, so DESIGN.md and the component catalog must guide implementation.

## Repository rules confirmed
- The root is a worktree, so changes stay local: no commit, push, release, or deployment.
- `bun run manifest:regen` is the only permitted Manifest regeneration path; generated outputs must be reviewed as part of the feature.
- New Convex seam files require codegen before typecheck, and non-node mutations must not be placed in a `"use node"` file.
- UI must use the established neutral/ink/orange design vocabulary and reuse catalogued components where applicable.

## Staffing implementation discovered
- `StaffingTemplate` lines already hold role, `guestsPerWorker`, floor, and optional demand facts. `EventStaffNeed` is the correct existing unfilled draft-assignment model; `Shift` cannot be unfilled because it requires a person.
- `ensureTemplateStaffNeeds` runs on `EventApproved`, headcount changes, and service-style changes. It is idempotent and cancels only open generated needs.
- Current matching picks one whole template. This wrongly omits any-style roles whenever a matching style template exists; selection will be made per role instead.
- The event staffing rail currently gives aggregate counts, but not required-versus-filled-by-role or an explicit shortfall callout.
