# Sales ownership and field staffing

## Source and current meaning

The supplied `work/training docs/binder-docs/event-worksheet.pdf` identifies
Joshua Mitchell as Sales Rep on page 1. Page 5 independently names Bill and
Kayden as captains, describes early/late team responsibilities, and lists
FOH/BOH staffing needs. Both rendered pages were re-inspected for this change.
The training guide also distinguishes the sales handoff from the event lead's
field responsibilities (pages 1 and 10-11).

Capsule's EventCreatePage labels this field Salesperson under Sales attribution.
EventPlanEngagementFormMapper maps salespersonId to Event.assignedToId. The
old EventOwnerAssigned/EventApproved reactions nevertheless created an
EventAssignment for that person as event_lead, using the guest-event window.
That conflated sales attribution with operational staffing. It also denied a
linked salesperson's ownership change at the child workforce-manager guard,
and rejected a repeated change at the child's initialization guard.

## Correction

The two owner-to-crew reactions are removed from the authored assignment
Manifest. Ownership changes retain the existing Event command policy, state
rules, versioning and audit event. They do not create, revise or remove staff.
Approval still materializes its purchasing, production, packing and invoice
outputs; it no longer assigns the salesperson to the field crew.

Actual EventAssignments and filled EventStaffNeeds remain the staffing inputs.
A salesperson explicitly given an operational role keeps that assignment.
This correction does not erase legacy rows: matching an owner or the text
event_lead alone would not prove an assignment was accidentally generated.

## Verification and affected data

Scratch generated-runtime qualification reproduces the old guard failures and
false salesperson assignment, then checks five sales/event/admin roles through
set, repeat, change and clear. Real captain assignment notes, started Shift
and TimeRecord stay byte-equal. Approval preserves an already assigned
salesperson's explicit Client liaison role and still creates packing/invoice
records. Foreign-tenant and unrelated kitchen-role commands remain denied.

Evidence under `.artifacts/operations-source-study/`:

- `qualify-sales-owner-staffing-runtime.ts`
- `sales-owner-staffing-{baseline,qualified}.{json,log}`
- `read-live-staffing.ts` and `live-staffing-20260910.json`
- `sales-owner-staffing-live-candidates.json`

The fresh production read on 2026-09-10 verified authenticated admin authority
and the known Ashley event ID in this source workspace. It returned 10 Events,
11 People, 12 EventAssignments, 5 EventStaffNeeds, 5 Shifts and 6 TimeRecords.
There were zero undeleted event_lead rows to examine for this specific defect.
This does not certify that the roster or other imported staffing data is
correct. No production records were changed.
The same read found Ashley has one Captain assignment, two open Event Staff
needs and no linked Shifts. Those are existing staffing records to preserve
and reconcile under #358; they are not evidence of completed attendance.

Full gate/review/checkpoint state is in progress.md. #361 remains open through
release and authenticated production qualification. #358 still requires
actual staffing-to-shift creation, crew-window propagation, individual manual
exceptions and preservation of attendance. The full operations goal continues
to require purchasing, source-data repair, reports/print and deployed proof.
