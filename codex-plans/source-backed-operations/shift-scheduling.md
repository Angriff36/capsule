# Shared shift scheduling transaction

## Operational requirement and current dependency

The training guide's crew-on through crew-off window must reach staffing,
Shift and My Day (#358). Before automatically creating those shifts, their
creation contract must work consistently for generated commands and the UI.
Approved time off already blocks the UI's scheduling seam, but the generated
Shift.schedule path bypassed it (#75). This checkpoint removes that divergent
creation path; it does not yet connect event timing to assignments or shifts.

## Implementation

`workforceScheduling.scheduleShift` retains its one-per-event lookup and
delegates new records to `Shift_createViaSchedule`. Manifest owns the Person,
event, training, qualification, lifecycle, encryption and event writes. The
existing active-Person and event-presence requirements move from duplicated
TypeScript validation into `src/workforce/shift.manifest`.

`handleManifestEvent` validates ShiftScheduled inside its originating
transaction. The callback reads time-off requests by Person, scopes them to
the Shift's tenant, and applies the existing approved, undeleted, half-open
overlap rule. A failure rolls back the Shift and its event/idempotency
receipts, including enclosing command writes. This is an authored projection
bridge for #75's nested-collection limitation, not a compiler repair or a new
approval policy. It also preserves the finite-window check from the old seam.

Returning an existing Shift is a no-op: it does not revalidate or overwrite
attendance history. Manual scheduling still supports separate split shifts.
The compatibility lookup retains its existing manager role check and now
honors the organization workforce switch; new records also pass the generated
policies. Event-driven time updates, automatic/manual provenance, cancelled
record handling and role handoffs remain active work in #358.

## Evidence

The actual generated-runtime baseline at b33b79dd creates approved time off,
observes the UI seam reject it, and then observes the generated command create
the same overlapping shift. `shift-command-baseline.json` records that result.

`qualify-shift-scheduling-runtime.ts` under
`.artifacts/operations-source-study/` qualifies both entry paths, boundaries,
pending/denied/deleted requests, other people, retry rollback, finite ranges,
encryption, timestamps, receipt count, no-op retries, attendance history,
manual split shifts, active Person/event requirements, qualification/training
parity, enclosing-transaction rollback and role/tenant/capability behavior.
Sixteen result flags are recorded in `shift-scheduling-qualified.json`.
This is isolated generated-runtime evidence, not authenticated production or
HTTP transport qualification. Generated Shift creation currently leaves
deletedAt absent; the qualification checks the actual nullish convention,
not an invented guarantee that generated creation stamps null.

The capability-switch case uses a marked isolated row fixture because
OrganizationCapabilitySetting.createViaRegister rejects its required seeded
capability (#360). No production setting changed. The baseline also proves
that a real linked Clerk subject cannot start its Shift (#359); My Day's
own-record policies and identity guards still require repair.

Full check and independent review results are recorded in progress.md.
