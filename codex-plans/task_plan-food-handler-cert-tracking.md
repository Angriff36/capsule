# Food Handler Certificate Tracking Plan

## Goal
Enforce a valid food-handler certificate whenever a Person is assigned to a food-handling shift, and provide an inspector-facing compliance roster.

## Constraints
- Preserve every pre-existing dirty or untracked change.
- Do not hand-edit Builder/Manifest-generated files; regenerate only through `bun run manifest:regen` if authored Manifest source changes.
- Reuse the existing `Qualification` and `Shift.requiredQualification` substrate from the completed staff-certifications slice.
- Add no permanent tests. The explicitly requested Playwright verification spec must be temporary and deleted after it passes.
- Keep the guard proportionate: food-handling assignments must be blocked, while unrelated shifts remain frictionless.
- Run focused verification and `bun run check`; report any proven unrelated shared-worktree blocker honestly.

## Phases
- [complete] 1. Trace the exact feature record, current source/diff, generated command contract, routes, and UI patterns.
- [complete] 2. Choose the smallest source-first design and record acceptance criteria.
- [pending] 3. Implement authored changes and regenerate through Builder if the Manifest domain changes.
- [pending] 4. Run focused static/runtime verification and fix feature-caused failures only.
- [pending] 5. Create, run, and delete the temporary Playwright verification spec.
- [pending] 6. Run `bun run check`, inspect the exact diff, and deliver the required tagged summary.

## Errors Encountered
- 2026-07-22: A combined exploration command assumed nonexistent `C:\Projects\capsule-pro\src`, `C:\Projects\capsule-pro\tests`, and `src/workforce/qualification.manifest` paths, so the shell returned exit 1 after yielding partial results. Resolution: use `rg --files` to locate the sibling validation and the current Qualification declaration before reading; do not repeat guessed paths.
- 2026-07-22: A follow-up syntax search still included nonexistent `C:\Projects\Manifest\examples` and a PowerShell-invalid `test*` path. Resolution: restrict all later Manifest searches to concrete existing roots and `--glob` filters.
- 2026-07-22: Implementation is blocked by the active AboardAI auto-loop continuously running a second feature in the same dirty checkout. `tenant-branding-config` edited `src/app/App.tsx`, authored Manifest, and regenerated the shared Convex tree during this task; as soon as it finished, `audit-log-global` started. Repository rules explicitly require stopping instead of racing concurrent rewrites. Resolution required: pause the auto-loop or reduce concurrency to one, then resume from Phase 3 after re-pinning the live diff.
