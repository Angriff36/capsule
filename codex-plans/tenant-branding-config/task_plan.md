# Tenant branding configuration plan

## Goal
Allow each tenant organization to manage a display name, address, logo, primary color, and accent color, and apply that branding to generated invoices, proposals, contracts, BEOs, and menus without code changes.

## Constraints
- Preserve all pre-existing dirty and untracked work.
- Do not hand-edit generated/Builder-owned files.
- Do not add or expand permanent tests.
- Use existing app, Convex seam, upload, navigation, and PDF patterns.
- Verify with a temporary Playwright test, delete it afterward, then run `bun run check`.

## Phases
- [x] 1. Baseline and ownership audit
- [x] 2. Explore tenant, upload, settings, and document-generation patterns
- [x] 3. Define the narrow implementation and affected authored files
- [x] 4. Implement persisted tenant branding and settings UI
- [x] 5. Apply branding to every existing generated-document path
- [x] 6. Run focused static verification and required repository gate
- [x] 7. Run temporary Playwright verification and remove the test
- [x] 8. Review final feature surface and preserve the plan with the shared-checkout blocker

## Decisions
- Existing modifications remain untouched and are treated as user-owned.
- Use a feature-local plan folder because the shared root plan files belong to other work.
- Use the canonical Manifest `Organization` entity for display name, address, and brand colors; use Clerk's organization logo upload/storage for the logo asset.
- Add BEO and menu exports because those document types have no current export path.
- Keep new Organization branding fields optional for backward compatibility with existing tenant rows; normalize invalid or absent colors at the document boundary.
- Extend `Organization.register` with optional branding arguments so a tenant missing its canonical Organization row can be configured in one save.
- Use the existing default `manageAccess` execute policy for branding changes; do not add a new role gate or lifecycle restriction.
- Build one shared branding resolver/hook and one logo-to-data-URL loader, then feed a consistent branding object into all five document types.

## Errors encountered
- Clerk type search assumed Bun's `.bun` package layout, but this checkout uses a conventional nested `node_modules` layout. Resolution: inspect `node_modules/@clerk/react/node_modules` and package exports directly.
- A PowerShell schema excerpt helper assumed each table search returned one line; `dishes` matched multiple identifiers and produced an array arithmetic error. Resolution: use anchored `rg -A` excerpts for remaining table shapes.
- Targeted Prettier was accidentally given `src/foundation/base.manifest`, for which Prettier has no parser. The authored TS/TSX files formatted successfully and `bun run typecheck` still passed; future formatting excludes `.manifest` source.
- `bun run check` stopped at the existing event integration guard because `EventAllergenBriefingPage.tsx` and `EventIncidentPanel.tsx` construct Convex hooks directly. Existing issue: https://github.com/Angriff36/capsule/issues/40. Branding files were not implicated.
- A Windows `rg` call passed a wildcard path literally and failed with invalid filename syntax. Resolution: search the directory with `-g '*.yml'` instead.
- A combined planning-file patch failed context verification even though the target line was present. Resolution: re-read the files and apply smaller, single-file patches.
- The first Playwright server wrapper used the PowerShell `bun` shim with `Start-Process`, which is not a Win32 executable. Resolution: identify the executable path rather than the shim.
- The subsequent readiness check targeted IPv4 while the existing Vite server listens on `::1`, and synchronous socket attempts obscured progress. Resolution: use the known `http://localhost:7811` URL and the existing server.
- `bunx @playwright/test` loaded a second runner instance, and Bun runtime invocation of the local CLI did not progress. Resolution: invoke the same installed Playwright 1.61.1 CLI with Node; the temporary test then passed in 2.1 seconds.
- The first final verification shell call used an accidentally short command timeout and was terminated before output. Resolution: rerun the same verification set with a 120-second allowance; all commands passed.

## Final status
- Feature implementation is complete and verified with focused type, build, generated-contract, secret-scan, commercial-guard, PDF smoke, and Playwright checks.
- The repository-wide `bun run check` cannot pass until the pre-existing event-hook guard blocker in issue #40 is fixed.
- This plan remains in `codex-plans` instead of being archived because the shared checkout began changing again during final review.
