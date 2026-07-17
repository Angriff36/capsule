# Workforce

> Owns the CapsuleX operator experience for EventAssignment, Shift, AvailabilityWindow, TimeRecord, and Qualification. Person lifecycle is owned by [organization-identity.md](organization-identity.md).

## Purpose

Make event coverage, staff availability, scheduled work, attendance, time, and qualifications legible as one workforce operation connected to the Event.

## Owned domain

| Source                            | Entities                  |
| --------------------------------- | ------------------------- |
| `workforce/assignment.manifest`   | EventAssignment           |
| `workforce/shift.manifest`        | Shift                     |
| `workforce/availability.manifest` | AvailabilityWindow        |
| `workforce/time.manifest`         | TimeRecord, Qualification |

## Primary workspace

Use a **roster and time sheet**, not a generic employee dashboard:

- event staffing view shows required/assigned people using governed assignment and shift facts that actually exist;
- availability is a date/time ledger with declared/withdrawn state;
- shift detail carries person, event, role, time window, status, and attendance actions;
- time records use a corrected-timesheet pattern with explicit provenance;
- qualifications appear in the Person dossier and in assignment context when relevant.

## Core workflows

- Assign, confirm, check in/out, mark no-show, or unassign event workers.
- Schedule, start, complete, cancel, or mark no-show Shifts.
- Declare or withdraw AvailabilityWindows.
- Clock in/out and correct TimeRecords.
- Grant, revoke, or expire Qualifications.

## Cross-system handoffs

Events own service context; Person owns operator identity; staffing records feed readiness explanations and PayrollInput. Incidents may link to a Shift. Logistics Delivery may reference a Person as driver, but Vehicle is not currently modeled.

## States and permissions

Workforce managers control assignments, schedules, corrections, and qualifications; staff actions must be scoped to the trusted user and legal state. Private/encrypted notes require the authored encryption boundary. Do not invent training modules, open shifts, recurring schedules, labor budgets, or performance scores.

Open decisions include recurring availability, assignment role vocabulary, offer/decline states, coverage math, Schedule/OpenShift, and training entities.

## Current status

Shipped (Slice 5) on `@angriff36/manifest` ≥ 3.6.20:

- **Routes:** `/staff` → `/staff/roster` (EventAssignment + Shift ledgers), `/staff/time` (TimeRecord + AvailabilityWindow), `/staff/qualifications` (Qualification ledger). All pages use generated queries, governed `createVia` creation hooks, and generated command hooks only.
- **Commands wired:** EventAssignment assign/confirm/checkIn/checkOut/markNoShow/unassign; Shift schedule/start/complete/cancel/markNoShow; AvailabilityWindow declare/withdraw; TimeRecord clockIn/clockOut/correct; Qualification grant/revoke/expire.
- **Roles:** `workforce_manager` (workforceManageAccess) controls assignment, scheduling, corrections, and qualifications; `workforce_staff` self-service commands (confirm, check in/out, clock in/out, declare/withdraw) are scoped to the trusted user; other roles are denied by generated policy.
- **Lifecycle:** action availability comes from generated lifecycle metadata (`WorkforceLifecyclePolicy` over `manifest-wiring-bindings`); no state literals in feature code, enforced by `bun run check:workforce-manifest`.
- **Failure behavior:** command failures render through the governed failure banner (policy denial, guard block, constraint block, version conflict, unexpected).
- **Proofs:** `tests/proofs/shift-lifecycle.runtime.test.ts` (createViaSchedule → start → complete, role denial, tenant isolation, seeded entirely through public generated mutations) and `tests/workforce-manifest-integration-guard.test.ts`.
- **Explicit limitations:** the IR declares no cross-entity reactions for workforce entities, so no automation runs off workforce events yet. Recurring availability, offer/decline states, assignment-role vocabulary, and coverage math remain open decisions. Payroll preparation is owned by [closeout-reporting.md](closeout-reporting.md).

## References

- Canonical: `C:/projects/Manifest-source/src/workforce`
- Read-only intent reference: Capsule-Pro Staff, Staffing, Scheduling, timecard, and payroll-entry flows
