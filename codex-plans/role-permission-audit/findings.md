# Findings: Role permission audit

## Requirements
- Generate a snapshot report of every organization member.
- Show each member's assigned role.
- Show the Manifest policies each member satisfies.
- Flag elevated access, including `workforceManageAccess`.
- Make the report useful for periodic least-privilege review by admins without adding user tedium.
- Follow existing repository patterns and generated-file ownership boundaries.
- Verify the core feature with a temporary Playwright test, then delete the test.
- Run the required repository gate before completion.

## Research Findings
- The checkout is extensively dirty and contains both modified and untracked user work.
- `src/features/admin/PermissionsPage.tsx` is already modified, making overlap analysis mandatory before editing.
- The initial targeted memory search found no relevant role-permission-audit entry; live code is the source of truth.
- The existing `PermissionsPage.tsx` diff only adds `AdminWorkspaceNav`; it was last written several hours before this task and can be preserved as a small pre-existing edit.
- `src/identity/person.manifest` defines tenant-scoped `Person` membership records with names, email, status, and a closed `CapsuleRole`; the generated `useListPerson()` query is already used by authored workforce UI.
- `src/foundation/base.manifest` is the authoritative role hierarchy. It grants named capabilities such as `staffAccess`, `manageAccess`, and `workforceManageAccess`, with inherited grants through role extension.
- The feature wording uses `workforceManageAccess` as its example of a satisfied Manifest policy, so the report should expose effective role capabilities (including inherited capabilities), not attempt to enumerate every entity policy expression in the domain.
- Generated `listPerson` is tenant-filtered, decrypts member email/phone for authorized readers, excludes soft-deleted people, and denies when `staffAccess` is absent.
- Existing admin export UI uses Blob URLs and explicit download buttons; the audit can follow the same authored pattern for a spreadsheet-safe CSV.
- The repository does not have Playwright installed or checked in, but both `npx` and the project-preferred `bunx` launcher are available. Temporary verification can use `bunx` without changing `package.json` or `bun.lock`.
- The temporary Playwright harness passed after selectors were scoped to member rows. It verified three frozen rows, inherited `workforceManageAccess`, two elevated flags, one standard flag, and CSV contents/download naming; every temporary verification file was then deleted.
- The required `bun run check` is blocked before feature compilation by existing Event integration-guard violations already tracked in GitHub issue #58.
- The standalone suite ran 543 tests: 529 passed and 14 failed across unrelated baseline areas already tracked by issues #58, #62, #63, #64/#61, and #65.
- The production build passes and emits the Permissions page bundle containing this feature.

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Use `useListPerson()` for organization members | It is the existing tenant-scoped generated query and avoids a new backend seam. |
| Derive effective capability grants from the Manifest role hierarchy in an authored helper | The report needs inherited capabilities and cannot import `.manifest` source at runtime; a small explicit mapping can be reviewed against the authoritative source. |
| Preserve the pre-existing `AdminWorkspaceNav` addition | It is unrelated existing work in the target page and must remain intact. |
| Freeze the member rows and timestamp only when an admin generates or refreshes the snapshot | A reactive list alone is not a snapshot; explicit generation makes periodic review and CSV evidence reliable. |
| Flag lead, generic manager, domain manager, and admin capabilities as elevated | These grants expand beyond ordinary staff access; this includes the requested `workforceManageAccess` example. |
| Keep the report inside the existing Permissions page | It is already the admin access workspace, so no new route or navigation burden is needed. |
| Use a temporary component harness for Playwright if the authenticated app cannot be exercised in an isolated browser | This verifies the actual authored view, snapshot action, elevated flags, and CSV download without production data or a new permanent test. |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| Broad dirty worktree | Limit inspection and edits to the feature seam; preserve all unrelated changes. |
| Required repository gate is red outside this feature | Verified the exact failures are existing Event UI violations in issue #58; ran typecheck, focused logic checks, Playwright, and production build independently. |

## Resources
- `AGENTS.md`
- `.aboardai/context/codex-implementation.md`
- `.aboardai/context/computer-use.md`
- `.aboardai/context/review-changes.md`
- `src/foundation/base.manifest`
- `src/identity/person.manifest`
- `src/features/admin/PermissionsPage.tsx`
- `src/features/workforce/RosterPage.tsx`
- GitHub issue #58: Event integration guard blocks repository completion gate
- GitHub issues #61/#64: Inventory audit Supply guard violations
- GitHub issue #62: stale governed creation expectations
- GitHub issue #63: stale admin navigation expectation
- GitHub issue #65: Event approval invoice authorization failure

## Visual/Browser Findings
- The browser-rendered report begins with an explicit “Generate snapshot” action and disabled CSV action.
- After generation it shows a snapshot timestamp, member count, elevated member count, one row per supplied member, assigned-role labels, exact Manifest capability chips, and elevated/standard review flags.
- CSV download contains the same frozen role/capability evidence shown in the table.
