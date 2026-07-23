# Staff Certifications Implementation Plan

## Goal
Implement professional certifications per Person, expiry visibility/HR alerting, and certification prerequisites for shift assignments without adding needless user friction.

## Constraints
- Preserve all pre-existing dirty and untracked work.
- Do not hand-edit Builder/Manifest-generated files; use `bun run manifest:regen` if domain source changes require regeneration.
- Do not add permanent tests unless the owner asks. A temporary Playwright verification spec is required and must be deleted afterward.
- Read `docs/architecture/domain-gating-restraint.md` before adding or tightening Manifest guards.
- Run focused verification and `bun run check` before claiming completion.

## Phases
- [complete] 1. Pin repository state and trace existing Person, certification/qualification, shift assignment, alert, route, and UI patterns.
- [complete] 2. Decide the smallest source-first implementation and record acceptance criteria.
- [complete] 3. Implement authored Manifest/UI/seam changes and regenerate through Builder if required.
- [complete] 4. Run focused static/runtime verification and repair only feature-caused failures.
- [complete] 5. Create, run, and delete a temporary Playwright verification spec.
- [complete] 6. Run `bun run check`, review the final diff, and record the unrelated full-gate blocker.

## Errors Encountered
- 2026-07-22: A parallel inspection command returned exit 1 because the assumed Manifest path `src/manifest/projection/convex` does not exist. Resolution: locate `count-of-preload.ts` with `rg --files` before reading it; do not repeat the guessed path.
- 2026-07-22: The first generated `Shift_createViaSchedule` preflight resolved `Person` but did not hydrate nested `Person.qualifications`; a type-based aggregate would reject even valid credentials. Resolution: model the credential used to satisfy the prerequisite as a direct optional `Shift.requiredQualification` relation, which generated createVia can resolve and validate server-side.
- 2026-07-22: The first multi-file patch for the direct relation did not apply because Prettier had reformatted the Roster datalist block. Resolution: inspect the exact current slice and reapply smaller patches against stable context.
- 2026-07-22: A PowerShell `rg` inspection had a malformed quoted regex, and the first generic select patch attached shift-person state to the event-assignment form. Resolution: use literal pattern inspection, restore the assignment select, and bind state only to the shift form.
- 2026-07-22: The first temporary Playwright run reached Clerk sign-in in the fresh CDP context, so the qualification heading was unavailable. Resolution: use an auth-free disposable Vite fixture that imports the real authored components and mocks only generated hooks; do not guess credentials or repeat the same unauthenticated run.
- 2026-07-22: The second Playwright run used the disposable Vite harness but rendered no root content. Inspection of the transformed TSX proved Vite's React plugin rejected the custom HTML because it lacked the refresh preamble. Resolution: add the standard Vite React preamble before the third, materially different run.
- 2026-07-22: The preamble-only run still rendered no root. Source inspection then proved the real remaining module-link failure: `AvailabilityGridSection`, already present in user-owned Roster work, imports two additional generated list hooks absent from the harness mock. Resolution: add those exact read-only mock exports; no production code change.
- 2026-07-22: A secondary PowerShell `rg` command used malformed quoting while checking workforce imports. Resolution: read the directly imported component instead; it exposed the two missing exports without repeating the bad regex.
- 2026-07-22: Once the harness rendered, Playwright's partial label match treated the prerequisite option text "Select a person first" as a second `Person` label target. Resolution: use the exact accessible label for the real Person select.
- 2026-07-22: The exact-label rerun encountered a same-URL Vite navigation while moving from the submitted qualification form to the roster interaction and timed out waiting on that label. Resolution: reload the disposable fixture between the two independent flows and select the roster's explicit `name="personId"` control.
- 2026-07-22: A scoped Prettier check incorrectly included `.manifest` files, for which Prettier has no parser. Resolution: rerun Prettier only on supported authored TSX/TS/Markdown files; Manifest correctness is covered by regeneration and the workforce integration guard.
- 2026-07-22: `bun run check` stopped in `proof:emit` on unrelated untracked `src/sales/tax-rate.manifest`, whose `taxRateComplete` constraint references computed `appliesToAny`. Resolution: preserve the parallel sales work, file GitHub issue #42, and complete the feature-scoped workforce guard, TypeScript, formatting, runtime, production-build, and Playwright checks.
