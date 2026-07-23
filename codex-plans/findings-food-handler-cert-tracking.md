# Food Handler Certificate Tracking Findings

## Initial State
- Branch is `main` at `b080022`, with extensive pre-existing authored, generated, planning, and AboardAI changes.
- The completed staff-certifications slice already added issuing-body/expiry data, certification alerts, and an optional auditable `Shift.requiredQualification` relation enforced by generated server constraints.
- That prior slice explicitly identified `food-handler-cert-tracking` as the dependent feature responsible for automatic food-handling-role classification and an inspector compliance roster.
- Generated and other user-owned changes must remain untouched except through the authorized regeneration transaction.
- The live AboardAI record has no hidden acceptance fields beyond the task text: it requires valid food-handler certification for every food-handling shift, creation-time blocking, and an inspector roster.
- `Shift.role` is an authored free-form string. `Shift.schedule` currently accepts an optional explicit `requiredQualificationId` and generated constraints verify Person ownership, active/non-deleted state, and validity through `endsAt`.
- `Qualification.certificationType` already uses `food_handler` in the authored UI vocabulary; the record includes issue date, optional expiry, issuing body, document reference, lifecycle state, and Person ownership.
- The roster shift form currently asks managers to select a prerequisite credential manually. This dependent feature must remove that burden for food-handling roles while retaining optional qualification selection for other specialized shifts.
- The inspector roster can be a read-only authored UI derived from existing Person, Qualification, and Shift list hooks; it does not require a duplicate persisted compliance entity.
- The read-only Capsule-Pro reference normalizes shift roles and treats chef, line cook, prep cook, sous chef, kitchen lead, manager, and server as food-safety roles; bartender is alcohol-service-only there. This is the repo-family evidence for Capsule's food-handling role vocabulary.
- Current Manifest supports the `toLowerCase` builtin, so server classification can accept ordinary case variation instead of relying only on UI-normalized strings.

## Evidence to Collect
- Exact AboardAI feature acceptance criteria and dependency record.
- Current `Shift`, `Qualification`, roster UI, routes/navigation, and generated mutation shape.
- Existing read-only report/roster page patterns and inspector-friendly presentation conventions.
- Whether enforcement can be expressed entirely in authored Manifest source without duplicating guard logic in React.
- A browser-verifiable flow that does not mutate production or require guessed authentication state.

## Decisions
- Normalize role case, spaces, and hyphens; recognize the repo-family food-safety roles `chef`, `line_cook`, `prep_cook`, `sous_chef`, `kitchen_lead`, `manager`, and `server`.
- Accept current `food_handler` and legacy repo-family `food_safety` certification types as food-handler proof.
- Tighten `Shift.schedule` in authored Manifest source so a food-handling role requires a linked certificate belonging to the Person, active/non-deleted, already issued by shift start, and unexpired through shift end.
- Keep non-food-handling shifts unchanged and retain manual optional qualification selection for other specialized prerequisites.
- Auto-select the best valid food-handler credential in the roster form; show a direct actionable failure when none is valid rather than making managers search manually.
- Add a read-only `/staff/compliance` inspection sheet derived from Person, Qualification, Shift, and Event lists. Show current/upcoming food-handling shifts, certificate issuer/expiry, plain compliant/noncompliant state, totals, and a print action.
- Use a dedicated page stylesheet with an industrial inspection-sheet direction that reuses Capsule variables and remains print-friendly.

## Acceptance Criteria
- Server-generated `Shift_createViaSchedule` rejects a recognized food-handling role without a valid linked food-handler certificate, including missing, wrong-type, not-yet-issued, revoked/deleted, or expired proof.
- Scheduling a recognized role through the roster UI automatically sends a matching valid certificate id; no manual credential selection is needed.
- Scheduling a food-handling role with no valid certificate is blocked with a clear next action, while unrelated shift roles retain their existing flow.
- `/staff/compliance` lists active current/upcoming food-handling shifts and exposes Person, role, event, shift window, certificate/issuer/expiry, and current compliance.
- Inspectors can print the roster cleanly, and later revocation/expiry is visible as noncompliance even though creation originally passed.
- The temporary Playwright spec exercises blocked/auto-linked scheduling and the inspector roster, then is deleted.

## Proven Blocker
- `.aboardai/execution-state.json` reported this feature running alongside `tenant-branding-config`; that session changed authored UI/Manifest files and regenerated shared generated paths at 04:32.
- When branding finished, the auto-loop immediately registered `audit-log-global` as the second running feature. That task is explicitly cross-domain and is now reading/planning against the same generated mutation surface.
- No safe source/regeneration window exists while the loop keeps concurrency at two. Editing now would violate the repository's shared-worktree rule and could invalidate either feature's ownership transaction.
