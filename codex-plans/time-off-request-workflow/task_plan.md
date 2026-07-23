# Time-off request workflow implementation plan

## Goal

Allow staff to submit a dated time-off request with a reason, let workforce managers approve or deny it from an in-app notification path, and ensure approved time off blocks overlapping shift assignment.

## Constraints

- Preserve all pre-existing dirty and untracked work.
- Do not hand-edit generated or Builder-owned paths.
- Use `bun run manifest:regen` as the only regeneration entry.
- Read the domain-gating guidance before changing Manifest policy.
- Add no permanent tests; the owner requested one temporary Playwright verification test that must be removed.
- Run the repository-required `bun run check` before claiming completion.

## Phases

1. **Discovery** — complete
   - Trace current availability, shift assignment, staff self-service, manager notifications, routes, and generated hook patterns.
   - Identify overlap with existing dirty work and keep the change scoped.
2. **Design** — complete
   - Choose the canonical Manifest entity/commands and authored UI seam.
   - Define manager notification and shift-block behavior with minimal policy friction.
3. **Implementation** — complete
   - Edit authored Manifest and UI only.
   - Regenerate through Builder if the Manifest source changes.
4. **Verification** — complete
   - Run focused existing checks, `bun run check`, and the requested temporary Playwright test.
   - Remove the temporary test after a successful run.
5. **Closeout** — complete
   - Review the final diff, archive the completed plan, and provide the parser-required summary.

## Errors encountered

| Error | Attempt | Resolution |
| --- | --- | --- |
| Manifest compile rejected reserved command identifier `deny` | 1 | Renamed the domain command to `decline`; persisted status and UI language remain `denied` / “Deny.” |
| Tried to read `src/ui/action-prompt.tsx`, which is not a file | 1 | Used the existing imported `useActionPrompt` contract from `RosterPage`; no action-prompt change was needed. |
| Feature files changed during read-only audit, proving a concurrent writer | 1 | Paused all product edits and regeneration; resumed only after a timed timestamp check showed the feature files stable. |
| Typecheck could not resolve `@clerk/clerk-react` in `NotificationTray` | 1 | Reused the repository-standard `useUser` import from `@clerk/react`. |
| Targeted Prettier run could not infer a parser for `availability.manifest` | 1 | TypeScript targets were formatted before the stop; reran formatting for Markdown only and left Manifest formatting to Builder. |
| Workforce guard rejected a direct Convex hook under `src/features/workforce` | 1 | Moved the tiny custom client adapter to the shared authored `src/lib` boundary; the workforce feature now consumes that adapter and does not construct a Convex hook. |
| Playwright discovery `rg` included a nonexistent top-level `playwright` path | 1 | The required `npx` prerequisite was confirmed; continued with existing `output/playwright` and installed package checks only. |
| Full `bun run check` stopped at unrelated event integration violations in existing dirty files | 1 | Preserved those user-owned files; retained the passing workforce guard, typecheck, build, targeted diff check, and Playwright proof, and recorded the baseline blocker for closeout. |
| Full format/coverage checks exposed unrelated dirty-tree failures; Playwright also left `test-results/.last-run.json` | 1 | Removed the Playwright-owned artifact and empty root directory; preserved unrelated files and recorded their failures without modifying them. |

## Design decision

- Add a canonical `TimeOffRequest` entity to `availability.manifest` with `submit`, `approve`, and `deny` commands. Self-service authorization follows `Person.authSubjectId`; review is restricted to the existing workforce manager capability.
- Keep request state separate from direct availability declarations so a submitted request does not block staffing before approval.
- Add a manager route at `/staff/time-off` and derive a live pending-review notification from request rows, matching the existing in-app notification architecture.
- Route in-app shift creation through an authored atomic Convex seam that reproduces generated `Shift.schedule` validation and adds an approved-request overlap query. This follows the existing equipment-reservation seam necessitated by the same generated `hasMany` hydration limitation.
- Keep the UI restrained and operational: a phone-first request card in `/my`, a compact review queue for managers, and a clear non-overridable shift-block message.

## Verification outcome

- Passed: `bun run check:workforce-manifest`, `bun run typecheck`, `bun run build`, feature-targeted Prettier and diff checks, `bun run secrets`, `bun run baseline:decay`, and the required temporary Playwright workflow (1 test, then deleted).
- Full `bun run check` was executed but stopped at unrelated existing Event integration-guard violations before reaching later stages.
- Standalone coverage completed with 551 passing and 14 unrelated failing tests; no time-off or workforce integration test failed.
- Generated command parity for external HTTP/MCP scheduling remains tracked in GitHub issue #75; in-app roster scheduling is atomically enforced by the authored seam.
