# Staff Certifications Findings

## Initial State
- Branch `main` is ahead of `origin/main` by three commits.
- The worktree has broad pre-existing authored and generated changes.
- `src/features/staff/` is already untracked and `src/features/workforce/QualificationsPage.tsx` is modified; both remain user-owned until their provenance and content are inspected.
- `npx` is available at `C:\Program Files\nodejs\npx.ps1`, satisfying the Playwright skill prerequisite.

## Evidence to Collect
- Existing Person and workforce domain entities/commands.
- Current shift assignment flow and guard conventions.
- Current alert/notification model and HR-facing surfaces.
- Existing qualification/certification UI work and route wiring.
- Builder ownership impact and the safe regeneration boundary.

## Domain and UI Findings
- `Qualification` already models a Person-held credential with `name`, optional `certificationType`, `issuedAt`, optional `expiresAt`, document reference, notes, and active/expired/revoked lifecycle. The missing requested datum is issuing body.
- Qualification creation is already manager-gated and Person-backed through `Qualification.grant`; the page already exists at `/staff/qualifications` and uses generated list/create/lifecycle hooks.
- `EventAssignment.assign` and `Shift.schedule` currently require an active Person but do not check qualifications.
- Staffing `role` is intentionally an open string; the source says a closed staffing-role catalog is not evidenced. Any prerequisite design must avoid inventing a rigid role catalog.
- Existing notifications are client-derived from live Convex lists in `deriveNotifications.ts`; the tray currently covers event stages, approvals, invoices, stock, shift conflicts, and allergen incidents. Qualification expiry can follow this established pattern.
- Binding domain guidance says every guard needs a proportionate real-world reason and must avoid needless user tedium. Missing a legally/safety-required certification is proportionate for a hard assignment block, while nearing expiry should alert rather than block.
- Existing source contains stale invented-deferral comments (`OD024`, `OD027`) that conflict with current binding guidance, but this task will not broaden into unrelated cleanup unless those comments directly obstruct the feature.
- The checked-in Manifest implementation documents and proves Convex mutation guards using `count_of(self.hasMany, predicate)`. This provides a source-first server enforcement path if staffing records declare a qualification relation keyed by tenant and Person.
- A prerequisite should remain explicit and optional on a staffing record because `role` is open-ended. When a manager specifies a required certification type, the server must require a matching active, non-deleted credential whose expiry is absent or extends through the assignment/shift end. Assignments with no declared certification prerequisite should remain frictionless.
- Near-expiry notifications can be derived from qualification state with a fixed forward window and link directly to the existing qualification ledger; expired credentials should be clearly surfaced separately from near-expiry alerts.
- The read-only Capsule-Pro reference already implemented automatic role prerequisites for `chef`, `line_cook`, `prep_cook`, `sous_chef`, `kitchen_lead`, `manager`, `bartender`, and `server`, blocking missing or expired types. That is evidence for role-driven enforcement rather than inventing a new manager-entered prerequisite on each shift.
- Legacy types include `food_safety`, `alcohol_service`, `culinary_certification`, and `management_certification`. The current feature description adds driver's license class, so a driver requirement still needs an explicit current-source design choice.
- Manifest's Convex `count_of` preloader only recognizes `self.<hasMany>` at the guard root. Enforcement therefore needs a direct `hasMany` relationship on `Shift` keyed through the assigned Person, not a nested `self.person.qualifications` aggregate.
- Capsule-Pro's credential record did not include issuing body; adding it is genuinely new product data rather than a missed copy field.
- Target manifests are content-clean at the pinned index; the Roster page has one pre-existing user change adding `AvailabilityGridSection`, and notification files are pre-existing untracked work from 2026-07-21. Those changes are older than this task and can be preserved with narrow edits.
- The AboardAI board has a `food-handler-cert-tracking` predecessor/dependency and a separate `staff-training-records` feature that depends on this feature. Certification work should not absorb training entities.
- Board dependency direction is explicit: `food-handler-cert-tracking` depends on `staff-certifications`. This feature should provide generic per-shift prerequisite data and enforcement; automatic food-handling-role classification and an inspector compliance roster belong to that separately authorized feature.
- A generic optional `Shift.requiredCertificationType` avoids a hard-coded role catalog. When present, `Shift.schedule` can enforce an active Person qualification with a case-insensitive matching type that remains valid through the shift end. When absent, ordinary shifts remain unaffected.
- First regeneration disproved the nested-aggregate createVia design: normal `Shift_schedule` hydrated `person.qualifications`, but `Shift_createViaSchedule` evaluated the same constraint against an unhydrated nested array. The robust generated path is a direct optional `requiredQualificationId` belongsTo relation.
- A direct credential reference also gives an auditable answer to which credential satisfied the prerequisite. Server constraints will require that it belongs to the assigned Person, is active/non-deleted, and stays valid through shift end; no-reference shifts remain unchanged.
- To preserve existing Convex documents during schema sync, `certificationType` and `issuingBody` should remain storage-optional while `Qualification.grant` requires both for all new records. The UI can display fallbacks for legacy rows.
- Generated proof after the revised model: `Shift_createViaSchedule` resolves `requiredQualificationId` tenant-safely before insert and emits the three plain-language constraint errors; ordinary shifts with no credential reference still follow the prior path.
- The required local Vite server is already running at the documented `http://localhost:7811` and returns HTTP 200. Playwright Chromium/browser caches are installed locally; no dev-server restart is needed for browser verification.
- Prior Playwright snapshots show the local test browser reached an authenticated finance page in the same app on 2026-07-21, although fresh contexts otherwise land on Clerk sign-in. Browser verification may need the existing Playwright persistent profile rather than a brand-new isolated context.
- Installed Playwright persistent-profile cookie files are older than the authenticated 2026-07-21 snapshot, so profile selection cannot be inferred safely from cookie mtime alone. The temporary test should report the observed auth boundary instead of assuming a profile is signed in.
- A live headless Chrome/CDP session is available at `127.0.0.1:63941` with a reusable blank page. The temporary Playwright spec can connect to that existing browser without starting or stopping the user's app/server processes.
- Final browser verification used an auth-free disposable Vite fixture (the established repo pattern) importing the real pages and notification derivation. It proved form payload wiring and expiry-alert output without creating durable Convex records.

## Acceptance Criteria
- Managers can record a Person certification with name, standardized/free-form type, issue date, optional expiry, issuing body, document reference, and notes.
- The qualification ledger displays issuing body and clearly marks expired or expiring-within-30-days credentials.
- The existing notification tray emits a Certification alert for active credentials expiring within 30 days or already expired, linked to `/staff/qualifications`.
- A shift can declare an optional required certification record. The generated server command rejects scheduling unless it belongs to the selected Person and is active, non-deleted, and valid through the shift end, with plain-language constraint messages.
- Shift creation without a declared certification prerequisite remains unchanged.
- The roster UI exposes the prerequisite and shows it in the shift ledger.
- Generated artifacts are updated only through `bun run manifest:regen`.
