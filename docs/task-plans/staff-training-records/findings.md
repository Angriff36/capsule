# Staff training records findings

## Checkout state
- The worktree already has a broad set of modified generated and authored files plus many untracked feature files.
- This task must use new, narrowly scoped files where possible and inspect overlaps before editing.
- No relevant prior-memory registry entry was found for staff training records.
- The likely overlap files (`Shift`, roster, App routes, root manifest, global CSS) already contain other feature changes. Any edits there must be small append/insert patches against current content; no whole-file rewrites or formatting churn.
- `time.manifest` has a separate in-progress certification enhancement (issuing body/type/expiry), so training should live in a new module rather than expanding that file.

## Existing workforce model
- `Qualification` already records professional certifications and is intentionally separate from training, but its comments still contain an agent-invented OD027 deferral that should be removed now that training is being built.
- `Shift.schedule` already supports an optional person-owned active `Qualification` prerequisite; the training gate should follow this direct-reference pattern rather than inventing broad policy roles.
- Workforce pages currently expose roster, time sheets, and qualifications under `/staff`.
- The required gate is proportionate when a shift type explicitly declares a module prerequisite; unrestricted shift types should remain easy to schedule.
- The immediately preceding certification feature established the robust generated pattern: a direct optional belongs-to proof id on `Shift`, because nested has-many aggregate hydration does not work reliably in `createViaSchedule`.
- A separate food-handler compliance feature was previously blocked because the Aboard loop had two concurrent tasks rewriting shared generated surfaces. Current execution state must be checked before any source edit/regeneration.
- `Shift.role` is deliberately free-form; training should use configurable `ShiftType` records rather than hard-coded role names.

## Initial design direction
- Add a dedicated authored workforce Manifest module for `TrainingModule`, `TrainingCompletion`, and configurable `ShiftType`.
- Record completion with `personId`, `trainingModuleId`, `completedAt`, and `assessmentScore`; validate score range and the module's passing score.
- Extend `Shift` with explicit shift-type and completion references so generated command validation can prove the selected Person completed the exact module required by that shift type.
- Add a focused workforce training ledger UI rather than mixing course definitions into the professional qualification screen.
- Reuse the established shift form structure and generated create hooks; expose the selected shift type and let the UI choose a matching passed completion as the auditable proof sent to `Shift.schedule`.

## Concurrent task scope
- `staff-utilization-reports` is active and explicitly plans workforce route/navigation integration plus `bun run check`.
- It appears likely to be UI-derived rather than Manifest-backed, but it still overlaps `App.tsx`, `workforceRoutes.ts`, and verification timing.
- Safe work before handoff is limited to this feature's new isolated files and further read-only design; shared edits/regeneration should not race it.

## Product authority and documentation
- The live feature record is the approved product decision for Staff Training Completion Tracking and depends on the completed staff-certifications feature.
- `docs/systems/workforce.md`, `docs/systems/index.md`, and workforce source comments contained stale training-deferral language. The implementation updates those surfaces so the new Manifest and `/staff/training` route are canonical.
- The user description contains no hidden acceptance metadata beyond module definitions, dated/scored Person completions, and shift-type gating.

## Implemented model
- `TrainingModule` owns category, passing score, description, and active/retired lifecycle.
- `TrainingCompletion.record` only persists scores from 0–100 that meet the selected active module's passing score, for an active Person.
- `ShiftType` optionally references one required module; types without a module preserve frictionless scheduling.
- `Shift.schedule` stores both the selected type and the exact Person completion used as proof, with server constraints for active type, Person ownership, and module match.
- The roster auto-selects the newest matching completion and gives a direct Staff → Training next step when proof is missing.

## Resume state
- The partial `training.manifest`, `TrainingPage.tsx`, `TrainingPage.css`, and shared route/root-manifest changes were created by the earlier stalled run of this exact Aboard feature, not by the inventory-scoped concurrent task.
- Continue by reviewing and verifying that partial implementation; do not replace whole shared files or attribute unrelated generated/authored changes to this feature.
- The prior attempt also completed a Builder regeneration: generated schemas, hooks, queries, and mutations already contain TrainingModule, TrainingCompletion, ShiftType, and Shift scheduling proof fields. Verification must still confirm the ownership ledger and generated runtime behavior through `bun run check`.
- The authored model keeps ordinary shift types ungated and requires an explicit Person-owned completion only when the selected active ShiftType declares a required module, matching the repository's harm-based gating rule.
- The roster integration auto-selects the newest matching completion for the chosen Person and ShiftType, gives a plain-language failure before mutation when none exists, and still relies on generated server constraints as the authoritative gate.
- The training page is a focused manager workspace with starter presets for the three requested categories, module/shift-type definition forms, a scored completion form, and visible ledgers. It follows the existing generated-hook and workforce failure-banner patterns.
- The Vite app is already serving `http://localhost:7811/staff/training` with HTTP 200 from the existing dev process, so required Playwright verification can use the known project URL without starting or restarting the server.
- The real app has no development auth bypass and no test credentials are available. The required core-flow browser proof will therefore render the real `TrainingPage` and `RosterPage` in a disposable Vite harness while aliasing only the generated hook module to an in-memory store.
- The browser flow can prove the user-visible gate end to end: define a module and gated shift type, observe the Roster form block the selected Person, record a passing completion, then schedule the same shift type successfully with the completion shown as proof.
- The older stalled Codex process remained resident, but feature files stayed stable across repeated timestamp checks before disposable verification work resumed.
