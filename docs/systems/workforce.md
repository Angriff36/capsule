# Workforce

> Owns the CapsuleX operator experience for EventAssignment, Shift, ShiftSwapRequest, ShiftType, WeeklyScheduleNotice, TimeOffRequest, AvailabilityWindow, TimeRecord, Qualification, TrainingModule, and TrainingCompletion. Person lifecycle is owned by [organization-identity.md](organization-identity.md).

## Purpose

Make event coverage, staff availability, scheduled work, attendance, time, and qualifications legible as one workforce operation connected to the Event.

## Owned domain

| Source                            | Entities                  |
| --------------------------------- | ------------------------- |
| `workforce/assignment.manifest`   | EventAssignment           |
| `workforce/shift.manifest`        | Shift, WeeklyScheduleNotice |
| `workforce/shift-swap.manifest`   | ShiftSwapRequest           |
| `workforce/availability.manifest` | TimeOffRequest, AvailabilityWindow, RecurringAvailability |
| `workforce/time.manifest`         | TimeRecord, Qualification |
| `workforce/training.manifest`     | TrainingModule, TrainingCompletion, ShiftType |

## Primary workspace

Use a **roster and time sheet**, not a generic employee dashboard:

- event staffing view shows required/assigned people using governed assignment and shift facts that actually exist;
- availability is a date/time ledger with declared/withdrawn state;
- shift detail carries person, event, role, time window, optional certification prerequisite, status, and attendance actions;
- time records use a corrected-timesheet pattern with explicit provenance;
- qualifications record certification type, issuing body, issue/expiry dates, and appear in assignment context when relevant;
- active credentials nearing expiry surface in the shared notification tray for workforce/HR follow-up.

## Core workflows

- Assign, confirm, check in/out, mark no-show, or unassign event workers.
- Schedule, start, complete, cancel, or mark no-show Shifts.
- Publish a week of shifts to scheduled staff, re-publish changed summaries, and acknowledge receipt in staff self-service.
- Propose a future shift swap from staff self-service, require the recipient to accept, and require a workforce manager to approve before the Shift assignment changes.
- Submit dated TimeOffRequests from staff self-service, notify workforce managers, approve or deny each request, and block overlapping Shift creation after approval.
- Declare or withdraw AvailabilityWindows.
- Clock in/out and correct TimeRecords.
- Grant, revoke, or expire Qualifications.
- Select a Person credential as a Shift prerequisite; scheduling is denied when it belongs to another Person, is inactive, or expires before the shift ends.
- Define reusable TrainingModules and ShiftTypes, record dated passing scores per Person, and schedule gated ShiftTypes only when the Person has completed the required module.

## Cross-system handoffs

Events own service context; Person owns operator identity; staffing records feed readiness explanations and PayrollInput. Incidents may link to a Shift. Logistics Delivery may reference a Person as driver, but Vehicle is not currently modeled.

## States and permissions

Workforce managers control assignments, schedules, corrections, qualifications, and training records; staff actions must be scoped to the trusted user and legal state. Private/encrypted notes require the authored encryption boundary. Training modules, scored Person completions, and module-gated shift types are canonical in `src/workforce/training.manifest`. Do not invent open shifts, recurring schedules, labor budgets, or performance scores.

Open decisions include assignment role vocabulary, offer/decline states, coverage math, open-shift bidding, and training renewal/expiry policy.

## Current status

Shipped (Slice 5) on `@angriff36/manifest` ≥ 3.6.20:

- **Routes:** `/staff` → `/staff/roster` (EventAssignment + weekly Shift schedule), `/staff/swaps` (accepted swap review and assignment approval), `/staff/time` (TimeRecord + AvailabilityWindow), `/staff/time-off` (manager request review), `/staff/utilization` (confirmed hours, billable utilization, under-scheduling, and shift-demand reporting), `/staff/qualifications` (Qualification ledger), `/staff/training` (training library, completion ledger, and shift-type gates), and `/my` (phone-first schedule acknowledgement, shift swaps, time-off requests, and field work).
- **Commands wired:** EventAssignment assign/confirm/checkIn/checkOut/markNoShow/unassign; Shift schedule/start/complete/cancel/markNoShow/stageApprovedSwap/applyApprovedSwap; ShiftSwapRequest propose/accept/decline/withdraw/approve/reject; WeeklyScheduleNotice publishSchedule/republishSchedule/acknowledge; TimeOffRequest submit/approve/decline; AvailabilityWindow declare/withdraw; TimeRecord clockIn/clockOut/correct; Qualification grant/revoke/expire; TrainingModule define/retire/reactivate; TrainingCompletion record; ShiftType define/retire/reactivate. Shift scheduling and swaps carry optional qualification and shift-type proof references; generated constraints validate both prerequisites.
- **Shift swap integrity:** proposal submission is the requester's confirmation. The selected recipient must be an active, linked Person with no overlapping Shift or approved time off in the current UI view and must have replacement qualification/training proof when the Shift requires it. Recipient acceptance moves the request to manager review. Manager approval revalidates the durable Shift owner, recipient, and credential proofs; generated staged reactions then change `Shift.personId` and replacement proof ids in the approval transaction, so any stale or invalid reassignment rolls the whole approval back.
- **Time-off enforcement:** request lifecycle and access policy are generated from Manifest. Because the current Convex projection cannot hydrate a Person's `hasMany` rows during governed creation, the roster uses the authored atomic `workforceScheduling.scheduleShift` seam to repeat `Shift.schedule` prerequisite checks and reject an approved time-off overlap in the same transaction. Later Shift lifecycle changes stay generated. Generated HTTP/MCP callers still need canonical overlap enforcement tracked in [#75](https://github.com/Angriff36/capsule/issues/75); the authored seam is the in-app bridge until that lands.
- **Schedule publication:** the roster filters shifts by work week and publishes one durable staff summary per scheduled Person. Changed summaries are re-published and clear the prior receipt. Upcoming published weeks show managers a non-blocking warning naming staff who have not acknowledged; linked staff acknowledge from `/my`.
- **Utilization reporting:** the read-only report aggregates closed/corrected TimeRecords and committed Shifts for a selected period. Event-linked confirmed time is billable, utilization is billable divided by total confirmed time, and the editable under-scheduling target stays an advisory browser preference rather than a domain guard.
- **Certification alerts:** the live notification tray derives expired and 30-day expiry alerts from Qualification state and links HR/workforce managers to `/staff/qualifications`.
- **Time-off alerts:** pending requests appear in the same live notification tray and link workforce managers directly to `/staff/time-off`; resolving the request removes the alert.
- **Roles:** `workforce_manager` (workforceManageAccess) controls assignment, scheduling, corrections, and qualifications; `workforce_staff` self-service commands (confirm, check in/out, clock in/out, declare/withdraw) are scoped to the trusted user; other roles are denied by generated policy.
- **Lifecycle:** action availability comes from generated lifecycle metadata (`WorkforceLifecyclePolicy` over `manifest-wiring-bindings`); no state literals in feature code, enforced by `bun run check:workforce-manifest`.
- **Failure behavior:** command failures render through the governed failure banner (policy denial, guard block, constraint block, version conflict, unexpected).
- **Proofs:** `tests/proofs/shift-lifecycle.runtime.test.ts` (createViaSchedule → start → complete, role denial, tenant isolation, seeded entirely through public generated mutations) and `tests/workforce-manifest-integration-guard.test.ts`. Proof-kit marks `Shift.schedule` / `Shift.start` / `Shift.complete` as `runtime_proven` via `bun run proof:emit` (`generated/proof/proof-registry.json`).
- **Explicit limitations:** the IR declares no cross-entity reactions for workforce entities, so no automation runs off workforce events yet. Recurring availability, offer/decline states, assignment-role vocabulary, and coverage math remain open decisions. Payroll preparation is owned by [closeout-reporting.md](closeout-reporting.md). **Self-service identity gap (canonical source decision needed):** the `.manifest` self-service guards compare `self.personId == user.id`, but the authored auth seam sets `user.id` to the external auth subject (Clerk) while `Person.authSubjectId` — the declared link — is not consulted by any guard. Until the canonical source routes self-service through `authSubjectId`, staff self-service actions succeed only for managers (`workforceManageAccess`); the runtime proof exercises the guard by equating subject and person id.

## References

- Canonical: `C:/projects/Manifest-source/src/workforce`
- Read-only intent reference: Capsule-Pro Staff, Staffing, Scheduling, timecard, and payroll-entry flows
