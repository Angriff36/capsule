# Findings: Recurring event scheduling

## Requirements
- Mark an Event as recurring with weekly, monthly, or annual frequency.
- Configure an end condition.
- Generate future Event instances automatically on a cron schedule.
- Every generated instance starts in Draft for operator review before activation.
- Follow existing code/domain/generation patterns.
- Verify the core flow with a temporary Playwright test, run it, then delete it.

## Research Findings
- Initial checkout is on `main` at `35b8bc2` with a very large pre-existing dirty/untracked delta spanning Event source, UI, generated files, docs, and unrelated features.
- Generated paths and `.aboardai/**` must not be manually changed, moved, or stashed.
- Existing Event implementation is generated-first: authored route/UI uses generated hooks, `src/lib/api.ts` is the only API import point, and creation calls governed `Event_createViaPlanEngagement` directly.
- Event policy/UI decisions must begin at `src/operations/event.manifest` and generated lifecycle metadata; authored UI must not reproduce guards, policy, tenant handling, encryption, reactions, or lifecycle tables.
- Domain changes must avoid unnecessary role gates or schedule locks; recurrence configuration should be a normal event-management action with only harm-based validation.
- Runtime browser proof may require the active Clerk organization and Convex encryption configuration; these are memory-derived and must be re-verified locally before relying on them.
- No Event recurrence implementation was found in the first source search. Existing recurrence is limited to workforce availability and unrelated scheduler-based integrations.
- The current Event aggregate starts in Manifest `planning`; product copy calls this Draft in the UI. The recurrence design must preserve that generated lifecycle default for every created instance.
- Event creation currently uses `planEngagement`, which sets all operational snapshots and leaves `stage` at its default `planning`; future recurrence instances can safely be created through the same command contract.
- The current generated `convex/crons.ts` contains zero jobs and is Builder-owned. No Manifest cron declarations exist in Capsule source, so the exact upstream DSL/projection support must be established before implementation.
- Event schedule changes are allowed in planning, pending approval, and approved. Recurrence configuration should not need to alter that lifecycle.
- `src/operations/event.manifest` already contains substantial unrelated user edits (client merge, venue-capacity snapshot, timeline activities). Recurrence edits must be additive and avoid touching those areas.
- `EventCreatePage.tsx` also has unrelated in-progress template, form-draft, validation, and venue-capacity work. Recurrence UI should integrate with that current form without rewriting it.
- Package pins `@angriff36/manifest` 3.6.41 and Convex 1.27.0. Playwright is not declared in `package.json`; repository/browser tooling must be inspected before the required temporary spec is created.
- Manifest 3.6.41 declares schedules as first-class IR and the Convex projection advertises schedule support; the concrete generated call semantics still need inspection.
- Current repository docs supersede older memory on Event creation: the UI now calls generated governed `useCreateEvent`/`Event_createViaPlanEngagement` directly, with no authored allocation seam.
- Manifest schedule syntax is `schedule <name> cron "..." run Entity.command(params...)`. The Convex projection hardcodes scheduled targets to generated `api.mutations.<Entity>_<command>` with static bound parameters.
- That schedule shape does not itself provide a tenant-wide query/sweep or dynamic per-Event iteration. A recurrence implementation cannot assume a declarative cron alone will enumerate due templates.
- Generated Event commands call `getAuthContext(ctx)` and fail closed to an anonymous empty tenant when invoked by an unauthenticated cron. The current Manifest Convex schedule projection does not inject a trusted system identity.
- Capsule's Event integration guard forbids authored direct Event writes because generated commands are authoritative. If the projection cannot express a scheduled tenant sweep, any narrow automation seam is a documented upstream blocker and must be escalated, not silently treated as equivalent generated behavior.
- This repository already accepts a narrowly scoped authored Convex seam when the generated projection cannot express a required atomic workflow, provided the seam authenticates/tenant-scopes deliberately, leaves remaining lifecycle commands generated, and files a GitHub blocker issue. Equipment checkout is the current precedent.
- Invoice reminders use Convex's durable scheduler from an authored automation seam rather than Manifest schedules, showing an accepted app-owned orchestration pattern; recurring Events still specifically need a global periodic sweep because no user action exists for each future occurrence.
- Convex `crons.ts` has no configured author-seam override and remains explicitly Builder-owned, so replacing or hand-merging it is not permitted.
- Manifest global commands are not emitted as Convex mutations (`generateMutation` skips commands without an entity), so a schedule cannot target an authored/global sweep through that route.
- The Event dossier already composes focused operational panels beneath the revision section. A dedicated `RecurringEventPanel` is the least disruptive UI seam.
- Existing custom Convex UI hooks are kept outside `src/features/events/**` when needed, while Event components consume them as feature adapters; this preserves the Event integration guard's generated-hook boundary.
- A malformed PowerShell-quoted `rg` expression produced a regex parse error during import-pattern exploration; the useful hook evidence came from the other search and no code was affected.
- Builder regeneration completed conflict-free with a clean 22/22 assembly verification and emitted the recurrence schema/index, configure/stop mutations, hooks, contracts, and diagrams.
- `recurrenceActive` is optional/defaulted so existing Event documents do not require a destructive backfill before the new schema can deploy.
- The generated Event creation command has no `EventPlanned` reaction tail, so the internal materializer's matching Event row plus `EventPlanned` audit insert does not skip downstream generated automation.
- Projection gap filed as https://github.com/Angriff36/capsule/issues/74.
- The required full gate remains blocked before recurrence-specific failures by seven Event UI violations already tracked in #40 and #56.
- Independent downstream verification found only existing shared-checkout failures: #32/#65 invoice authorization, #61 supply hooks, #62 stale governed-creation mappings, plus known navigation/format/root-entry drift.
- Focused recurrence-adjacent verification is green: 356 Event/generated contract tests, typecheck, production build, secret scan, Builder assembly, Convex codegen, and Playwright.

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Event fields model the recurrence source and generated instance lineage | Operators can see recurrence on the Event; future instances cannot accidentally become independent generators. |
| Frequency values are weekly, monthly, annually | Matches the requested vocabulary exactly. |
| End conditions are on-date or after-occurrences | Gives a bounded series in both calendar and count terms. |
| Draft horizon is 90 days, with a bounded batch | Provides review time and protects Convex transactions from unbounded generation. |
| The first scheduler run happens immediately after configuration | Operators see upcoming Drafts without waiting for a clock tick. |
| Subsequent runs schedule when the next occurrence enters the horizon | Avoids wasteful polling while retaining automatic cron-like cadence. |
| A schedule revision UUID invalidates stale jobs | Reconfiguring or stopping a series does not require fragile scheduler cancellation bookkeeping. |
| Export a presentational panel view | Production uses real generated/custom hooks; temporary Playwright can exercise the actual UI without a real tenant mutation. |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| A PowerShell `rg` call used the invalid Windows path glob `src\**\*.manifest` | Use `rg ... src -g '*.manifest'` for subsequent searches. |
| A PowerShell `rg` call used the invalid path glob `playwright.config.*` | Use `rg --files -g 'playwright.config.*'` and pass resolved files explicitly. |
| A search used the invalid Windows path glob `node_modules\@angriff36\manifest\examples*`, causing the parallel inspection call to exit 1 | Search the package directory with `-g` include patterns and no wildcard path component. |
| An effect-lowering search returned no matches and caused the inspection command to exit 1 | Inspect the action renderer by function names/nearby source instead of relying on a no-match `rg` pipeline. |
| A quoted import-pattern regex was malformed in PowerShell | Use literal file reads or simpler `rg` patterns; no retry with the same expression. |
| `manifest validate` is an IR validator in this CLI shape and rejected the `.manifest` source as JSON | Switch to a source parser command, then rely on the only approved regeneration entry for full assembly validation. |
| `manifest scan src` cannot resolve the assembled multi-module source and emits 181 opaque `[object Object]` errors across the dirty baseline | Do not chase unrelated modules; use `bun run manifest:regen`, which is the repository's authoritative assembled source path. |
| Generated Event `Doc` does not expose separate encryption key-id columns | Inspect `__encryptDoc`/schema and copy the stored encrypted value exactly as represented by the generated table. |
| Generated encryption stores `{v,kid,ct}` as JSON in the field itself | Copying the raw stored contact field preserves the envelope; no companion columns are needed. |
| Focused Event guard fails on pre-existing files, not the recurrence panel | Existing issue #40 is known to cover allergen/incident violations; CommandFailure and timeline coverage must be checked before deciding whether a new issue is required. |

## Resources
- `AGENTS.md`
- `.aboardai/context/*.md`
- `src/operations/event.manifest`
- `src/features/events/`
- `convex/lib/`

## Visual/Browser Findings
- The production `RecurringEventPanelView` renders the stopped cadence summary, generated Draft lineage, and source-Event link without clipping or overlap at the verification viewport.
- The annual/on-date configuration payload, stopped state, and "remains in Draft" operator copy were all visible in the captured Playwright evidence.
