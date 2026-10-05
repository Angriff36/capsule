# Guided event creation wizard

## Goal

Add an optional, browser-draft-backed event creation wizard alongside the existing long form, without schema or Manifest changes.

## Phases

1. `complete` Inspect current event creation UI, seams, commands, and applicable design/system rules.
2. `complete` Design the wizard draft, validation, unlock model, and ordered client commit seam from proven command contracts.
3. `complete` Implement the optional guided UI and facilities-owned commit hook; preserve the long form.
4. `complete` Add focused unit tests and attempt the temporary Playwright verification; browser verification is blocked by the absent required 7812 server.
5. `complete` Ran focused checks, production build, diff check, and inspected the working tree. The full repository gate remains blocked by the pre-existing supply guard violation tracked in Capsule issue #435.

## Constraints

- No Manifest/schema/generated-file edits and no deployment.
- Keep all writes outside guarded feature UI; preserve existing user changes.
- Follow DESIGN.md and existing class vocabulary.
- Temporary Playwright test must be deleted after execution.
# Round 2 recovery plan — 2026-10-05

## Goal

Repair the guided event creation wizard according to the owner-provided round-2 review brief, preserving the existing in-progress work and proving it with focused unit, backend, full-gate, and local-browser evidence.

## Phases

- [complete] Ground generated hook/error behavior, command inputs, idempotency, hook order, and current dirty diff.
- [complete] Repair wizard validation, persisted attempted-write state, and UI locks/statuses.
- [complete] Add the requested focused unit/backend proofs and repair #435.
- [partial] Full gate was run and recorded exit code 1; generated proof artifacts were restored. Browser test cleanup is complete, but Clerk lacks the specified test user so authenticated UI proof could not run.
- [in_progress] Repair the round-3 reviewer findings: synchronous draft ownership, submission locking, preflighted writes, focused proofs, and traceable unlock evidence.
- [pending] Run the required focused, runtime, full-gate, and browser verification; capture durable evidence.
- [pending] Prepare the two scoped commits and leave the branch ready for independent review.

## Constraints

- No deployment, merge, or push outside the branch.
- Preserve current user/in-progress changes; edit only the wizard task and required #435 repair.
- Generated paths stay generated; use Builder regeneration if a manifest is changed.
