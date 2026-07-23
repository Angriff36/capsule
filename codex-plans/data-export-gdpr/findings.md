# Findings: Personal Data Export (GDPR / CCPA)

## Requirements
- Search for a named client contact or staff person.
- Restrict the workflow to organization administrators.
- Export all data associated with the selected individual.
- Offer structured JSON and CSV packages.
- Avoid requiring direct database access.
- Verify the core flow with a temporary Playwright test and delete it afterward.
- Run the repository-required `bun run check` before claiming completion.

## Initial State
- Branch: `main`
- Starting HEAD: `b080022`
- The checkout contains extensive pre-existing authored, generated, and untracked work from other features.
- This task will use additive, feature-scoped files wherever possible and will not reformat unrelated files.

## Research Findings
- `Person` is the staff identity model and is referenced by workforce assignments, availability, shifts, time entries, and qualifications through `personId`.
- `ClientContact` is the client-side individual model. The recently added `ClientCommunication` model associates records through `clientContactId`, so the export must include these too.
- Existing browser download behavior in `PayrollPage.tsx` uses a `Blob`, `URL.createObjectURL`, a temporary anchor, and `download`, which is the local pattern to reuse.
- The repository has no existing personal-data export implementation.
- The full required gate is `bun run check`; it includes generated ownership, proof/integration guards, typecheck, formatting, secret scan, coverage, build, and baseline decay.
- `npx` is installed at `C:\Program Files\nodejs\npx.ps1`, satisfying the Playwright skill prerequisite.
- Staff exports must at minimum cover the `Person` row plus direct `personId` records: `EventAssignment`, `AvailabilityWindow`, `RecurringAvailability`, `TimeRecord`, `Qualification`, and `Shift`.
- Client-contact exports must at minimum cover the `ClientContact` row and records keyed by `clientContactId`, including the new `ClientCommunication` history.
- `Person` stores encrypted email/phone and `ClientContact` stores encrypted email/phone/mobile, so export construction must use the authenticated app data seam rather than bypassing normal tenant and role authorization.
- `Person.assignRole` and terminal `Person.terminate` already establish `adminAccess` as the existing sensitive admin capability; the export should reuse it rather than inventing a new role.
- The existing `authStatus` seam normalizes Clerk roles and exposes `role`; server code obtains the same normalized `{ id, role, tenantId }` through `getAuthContext`, with `requireTenant` failing closed.
- Generated tables provide indexes for the direct staff references (`personId`, `assignedToId`, `driverId`, `checkedById`, and `ownerId`) and for contact communication by `clientContactId`.
- Some authored audit fields (`ClientCommunication.authorId`, incident reporter ids, and corrective-action actor ids) are strings populated from the authenticated subject rather than Person document ids. A staff export must match both the Person `_id` and optional `authSubjectId` aliases.
- The safest app seam is an authored Convex query module that enforces `admin`/`owner`/`system` server-side, returns tenant-scoped subject choices, and builds only the selected subject package. This avoids downloading whole sensitive tables into the browser for client-side filtering.
- Adding an authored Convex query module requires `bun run codegen` to expose its typed API; generated `_generated` output must not be hand-edited.
- The generated schema has exactly eleven document-id references to `people`: availability windows, assigned clients, delivery drivers, assigned events, allergen-check operators, event assignments, payroll inputs, prep-task assignees, qualifications, quality-check operators, saved-report owners, shifts, and time records (the latter list contains thirteen tables because some categories share the same ref kind).
- A resumed live-schema audit corrected that earlier count: there are fifteen direct `people` table references, including `dashboardPreferences.ownerId`; the initial implementation covered fourteen and must add dashboard preferences.
- Additional string actor associations exist on client communications (`authorId`), incidents (`reportedById`), and corrective actions (`openedById`/`closedById`).
- Every relevant tenant-scoped table has a `by_tenantId` index. Building each selected export from tenant-indexed reads and server-side field matching is simpler and safer than depending on a different per-reference index for every table.
- Existing authored query modules live at Convex's top level (for example `clientPortal.ts`) while helpers live under `convex/lib`; a new top-level authored `personalDataExport.ts` query is consistent with that seam and remains outside the generated module list.
- Shared UI targets are already dirty (`App.tsx`, `app.css`, generated API types) or untracked (`AdminWorkspaceNav.tsx`). Their hashes were captured before planning; edits must be additive and rechecked for concurrent changes before patching.
- The live tree already contains the planned authored query module, serializer, admin page, route, and codegen registration. These files were last written together and now need focused review/typechecking rather than reimplementation from scratch.
- `PersonalDataExportPage` follows the established `PermissionsPage` admin shell (`operations-stage`, `PageHeader`, `AdminWorkspaceNav`, `Section`) and the download implementation mirrors the existing payroll Blob/anchor pattern.
- `AdminWorkspaceNav` includes the new Data exports tab alongside Permissions and Branding, so no additional app-wide navigation is needed.
- The live generated schema contains one additional direct `people` reference not yet included by the draft query: `dashboardPreferences.ownerId`. The export must add that section to satisfy the stated all-associated-data scope.
- The page currently revokes the Blob URL synchronously after `link.click()`; the established payroll path defers revocation to the next task, which is safer for browser download completion and should be reused.

## Technical Decisions
- Use a dedicated `/admin/data-export` page with the existing Administration workspace navigation.
- Enforce `admin`, `owner`, or `system` in both the page state and the authored Convex queries; the server check is authoritative.
- Return only subject choices (name, email, status) until an admin selects a person, then build that one tenant-scoped package.
- Match staff records by both Person document id and external auth subject id.
- Offer separate one-click JSON and normalized CSV downloads using the existing Blob/object-URL pattern.

## Resumed Implementation Review
- The stalled run created `convex/personalDataExport.ts`, `src/features/admin/personalDataExport.ts`, and `src/features/admin/PersonalDataExportPage.tsx` and added the planned route, nav item, and generated API registration.
- The server module keeps list and package queries admin-only and tenant-scoped, decrypts only the selected subject's normal encrypted contact fields, and collects direct staff references plus known string actor references.
- The UI exposes one searchable subject list, a selected-package preview, and JSON/CSV downloads using the repository's Blob/object-URL pattern.
- The route and nav integration are present amid unrelated shared-file work; only the `PersonalDataExportPage` import/route and `Data exports` nav entry are attributable to this feature.
- The final live schema/source audit found `dashboardPreferences.ownerId` is now an auth-subject string populated from `user.id`, not a `people` document ID. Staff package matching must therefore use both the Person ID and `authSubjectId` aliases for dashboard preferences; the same alias-safe filter is appropriate for saved report ownership.
- Keep deleted/removed/terminated subject rows and associated records in the export: a subject-access package should not silently omit historical personal data.
- Prefix formula-leading CSV strings with an apostrophe so exported notes or names cannot execute as spreadsheet formulas when opened in Excel-like tools.
- A comprehensive post-implementation scan found one additional auth-subject association: `DashboardPreference.ownerId = user.id`. It must be included alongside communications, incidents, and corrective actions before final verification.
- The same scan reconfirmed that all generated `v.id("people")` relationships are represented in the staff package.

## Issues Encountered
- The first parallel discovery command returned exit 1 after PowerShell treated `playwright.config.*` and `vite.config.*` as invalid literal paths for `rg`. The useful model/export output was retained; config discovery will use `rg --files`.
- A generated-hook `rg` returned no matches and exit code 1, which obscured the parallel admin output. Future no-match searches will normalize that result instead of being treated as failures.
