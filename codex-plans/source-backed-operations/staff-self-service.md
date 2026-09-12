# Linked staff self-service

The original operations goal requires personal work in My Day to reflect
the shared event operation. Runtime evidence in #359 showed that a correctly
linked Clerk account could not start its Shift: source guards compared a
Person ID with the external auth subject. Kitchen/event/logistics roles also
failed workforce-only policies before reaching their own records.

## Source change

Shift, EventAssignment, TimeRecord, AvailabilityWindow, RecurringAvailability
and WeeklyScheduleNotice now permit staff to read and use their own records
through trusted `user.personId`. Existing workforce access is retained; this
does not expose other people's private records to additional roles. Scheduling,
assignment creation, time corrections and other manager commands retain their
existing manager guards.

The base staff role grants `workforceSelfAccess`, used only alongside the
own-Person condition. Its existing workforce capability mapping preserves the
organization's workforce-off switch for staff and administrators. A runtime
reproduction caught the earlier `staffAccess` branch bypassing that switch;
the correction uses the existing capability engine without new role checks.

Attendance and availability commands compare the stored or seeded Person
with the linked Person. The original direct-Person-ID subject convention is
retained only for an unlinked bootstrap identity that already passes the
existing workforce policy. A linked identity always takes precedence, even
when its subject happens to equal another Person's ID.

Schedule acknowledgement follows the current Person link instead of relying
on a possibly stale recipientAuthSubjectId snapshot. My Day already resolves
the signed-in account through the authenticated Person link and filters the
notice list to that Person; the redundant snapshot-based UI gate is removed.
This restores acknowledgement after relinking and when a notice was published
before account linkage. The existing button, loading/error feedback, keyboard
behavior and presentation stay in the established My Day composition.

## Qualification

`qualify-staff-self-service-runtime.ts` under
`.artifacts/operations-source-study/` uses actual generated commands, linked
Person records and real external-subject/Person-ID separation. It qualifies
staff, kitchen_staff, kitchen_lead, event_staff, logistics_staff, driver and
workforce_staff. Each exercises own reads, Shift start/complete, Assignment
confirm/check-in/check-out, TimeRecord clock-in/out, dated and recurring
availability, and schedule acknowledgement. Other-person writes and manager
actions are denied; manager time corrections still work. Additional cases
cover private reads, foreign/unlinked identities, relinking, stale/missing
notice subject snapshots and precedence over the legacy identity path.
All seven staff roles and the administrator are also checked with workforce
disabled: six entity lists/individual reads stay unavailable, own lifecycle
and creation commands are denied without writes, and re-enabling restores
access. The capability setting is an explicitly isolated raw fixture because
the existing generated first-registration failure is tracked in #360.

`qualify-staff-self-service-browser.mjs` renders the actual MyDayPage and
generated wrappers with transport-only substitution using those runtime
snapshots. At 390/900/1440 it checks the clock-in's Person/Shift/Event links,
shift actions, acknowledgement, conflict retry, keyboard activation and
overflow. A relinked Person can acknowledge a notice without a stored subject.
Desktop and mobile screenshots were visually inspected. This is isolated
browser qualification, not an authenticated live Clerk or production test.

Full check/review evidence is recorded in progress.md. #359 stays open for
release and authenticated verification. The whole My Day feature is not
claimed complete: staffing/crew-window propagation (#358), owner reactions
(#361), affected-data reconciliation, and the broader operational flows,
reports and production proof remain required by the original goal.
