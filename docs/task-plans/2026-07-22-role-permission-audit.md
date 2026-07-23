# Role permission audit implementation

## Goal

Give organization admins a point-in-time report of every current tenant member, their assigned role, the effective Manifest capability policies inherited by that role, and any elevated access that deserves periodic review.

## Implemented seam

- `src/features/admin/PermissionsPage.tsx` mounts the report in the existing administration Permissions workspace and only starts the tenant member query after the current user is confirmed as `admin`, `owner`, or `system`.
- `src/features/admin/RolePermissionAuditPanel.tsx` owns the explicit generate/refresh interaction, frozen snapshot presentation, elevated-access review flags, and CSV download.
- `src/features/admin/rolePermissionAudit.ts` mirrors the authoritative role inheritance from `src/foundation/base.manifest`, resolves inherited capability closures, builds stable sorted snapshot rows, identifies elevated grants, and emits spreadsheet-safe CSV.

The report is deliberately informational. Highlighting an elevated capability does not add an approval, denial, or workflow gate.

## Elevated classification

The report highlights generic manager access, kitchen lead access, domain-manager access (including `workforceManageAccess`), and organization-admin access. Ordinary staff/domain access remains standard.

## Verification

- `bun run typecheck` — passed.
- Targeted Prettier write/check for the three feature files — passed.
- Inline role closure comparison — all 22 roles matched `src/foundation/base.manifest`.
- Focused snapshot/CSV smoke assertions — passed.
- Temporary Playwright component harness — passed one browser test in 3.6 seconds. It generated three member rows, verified inherited `workforceManageAccess`, counted two elevated and one standard member, and inspected the downloaded CSV. The spec, config, harness, and results were deleted afterward.
- `bun run secrets` — passed.
- `bun run build` — passed.
- `bun run check` — ran and passed toolchain, ownership, proof emission/validation, and registry-pin stages, then stopped at unrelated Event integration-guard violations tracked in GitHub issue #58.
- `bun run test` — 529 tests passed and 14 unrelated baseline tests failed under existing issues #58, #61/#64, #62, #63, and #65.

## Preserved work

The checkout was already extensively dirty. No generated files were hand-edited, no unrelated work was reverted or stashed, and the pre-existing `AdminWorkspaceNav` change in `PermissionsPage.tsx` was preserved.
