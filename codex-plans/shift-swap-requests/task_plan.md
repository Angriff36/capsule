# Task Plan: Shift swap requests

## Goal
Enable a staff member to propose swapping an assigned shift with another eligible person, require both staff confirmations, and require manager approval before assignment records change.

## Current Phase
Phase 5

## Phases

### Phase 1: Requirements and discovery
- [x] Capture repository and user constraints
- [x] Trace live shift, assignment, person, and workforce UI behavior
- [x] Identify overlapping pre-existing or concurrent changes
- **Status:** complete

### Phase 2: Plan the implementation
- [x] Define source-domain lifecycle and assignment-integrity transaction
- [x] Define authored UI route and generated-hook/seam usage
- [x] Confirm generated paths remain untouched except via `bun run manifest:regen`
- **Status:** complete

### Phase 3: Implement
- [x] Add the smallest Manifest source and authored UI/seam changes
- [x] Regenerate only through `bun run manifest:regen` if source changes require it
- [x] Preserve unrelated user changes
- **Status:** complete

### Phase 4: Verify
- [x] Run focused existing checks
- [x] Create, run, and delete a temporary Playwright verification spec
- [ ] Run `bun run check`
- **Status:** pending — blocked by unrelated event integration-guard violations tracked in #78

### Phase 5: Delivery
- [x] Review exact diff and repository status
- [x] Keep the plan unarchived because the required full gate is blocked
- [x] Provide the required tagged summary
- **Status:** complete

## Decisions Made

| Decision | Rationale |
|---|---|
| Treat every pre-existing dirty path as user-owned | The checkout was heavily dirty before this feature started |
| Use a feature-specific plan directory | Root planning files belong to another active feature |
| Do not hand-edit generated/Builder-owned files | Repository ownership rules require Manifest source plus `bun run manifest:regen` |
| Require both staff confirmations and manager approval, without extra invented gates | This is the explicit product workflow and matches domain-gating restraint |
| Treat proposal submission as the requester's confirmation | The requester explicitly chooses the shift and recipient; the recipient still accepts separately before manager review |
| Add decline, withdraw, and manager reject terminal paths | Pending requests need low-tedium exits and must not remain stuck indefinitely |
| Use Manifest staged reactions for assignment mutation | Approval, authorization staging, credential revalidation, and `Shift.personId` reassignment remain one rollback-safe transaction |
| Screen candidate eligibility in the UI and revalidate durable identity/credential facts in the domain | Avoids obvious conflicts and stale credentials without inventing a new availability gate the current domain cannot hydrate |
| Put staff actions on `/my` and manager review on `/staff/swaps` | Matches existing self-service and workforce-manager navigation ownership |
| Build new components and make only minimal insertions into overlapping `MyDayPage`/`App`/route files | Reduces collision risk in the shared dirty checkout |

## Errors Encountered

| Error | Attempt | Resolution |
|---|---|---|
| PowerShell `rg` rejected the `src\\**\\*.manifest` path glob | 1 | Search the `src` directory directly with a file glob filter |
| A second PowerShell `rg` command rejected `src\\sales\\*.manifest` | 1 | Use `-g '*.manifest' src\\sales` or explicit files; never pass Windows wildcard paths to `rg` |
| Targeted credential read returned a transient tool-layer path-resolution error | 1 | Use a narrower `rg` search from the verified repository root before editing |
| Prettier could not infer a parser for `.manifest` files after formatting TS/CSS | 1 | Format only supported authored files; validate Manifest syntax through `bun run manifest:regen` |
| Planning phase update missed after Prettier normalized markdown spacing | 1 | Re-read the current plan and patch against its exact text |
| Playwright prerequisite probe included another invalid Windows wildcard path | 1 | Run module/server probes separately and inspect the explicit shift proof file |
| First Playwright run loaded `@playwright/test` against a different local runner instance and found no tests | 1 | Import from `playwright/test`, matching the package behind `npx playwright` |
| Second Playwright run still used cached CLI 1.60.0 against repository packages 1.61.1 | 2 | Pin the npx Playwright runner to 1.61.1 for a version-matched run |
| Version-matched Playwright runtime reached approval but `self.id` compiled to nonexistent `doc.id`, rolling back with “Swap approval does not match this shift” | 1 | Remove the redundant apply-stage id comparison; approval already resolves and validates the exact request Shift, then fan-out targets that id. File the generator defect as required. |
| `bun run check` stopped in `check:event-manifest` on pre-existing event UI hook/lifecycle violations | 1 | Preserve unrelated event work, file #78, and complete feature-scoped build/format/workforce verification |
