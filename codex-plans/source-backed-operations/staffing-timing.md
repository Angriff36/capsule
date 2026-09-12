# Connected event staffing and shifts

Status: implementation in progress after 73632202. The full operations goal
remains active; this file records decisions and evidence as work proceeds.

## Latest verification (2026-09-10)

Checkpoint 8313caa5 is pushed with full check (1,465 tests) and independent
gpt-5.6-sol APPROVE. The subsequent filled-request cancellation change has
focused runtime proof and bounded independent approval; final full gate12645
passes 1,466 tests and three-width component browser proof passes. Cancelling a filled requirement retains its former
owner and notes, removes only future coverage tied to it, and leaves recorded
work and other roles intact. A direct generated child repair also finishes the
remaining linked shifts using fresh versions. This is explicit request removal,
not an automatic rewrite of manual plans. Replacement/reopening remains required.

Registry Manifest3.6.53 fixes the computed-auth projection; both Capsule and
isolated Builder consume it. Full check89321 passed 1,463 tests before the newest
swap/history corrections. The manual source-group fix and connected approved
swap transfer now have independent gpt-5.6-sol APPROVEs. Shift-only TimeRecord
history now survives later timing and removal, with separate before/after proof.
See the newest progress.md entry for exact current review/gate status. Earlier
failure descriptions below are chronological evidence, not current blockers.

Swaps transfer only their linked work, reuse the recipient's acceptance, preserve
original Shift provenance, and retain earlier requests. Source commands validate
the durable approval and complete all sibling sources even when entered directly
to repair a legacy approved swap. Replays, second swaps, twelve-source groups,
unrelated work, and full recorded-work/time-off rollback pass scratch runtime.
Shared event readers combine TimeRecords reached through eventId or shiftId.
No production data has changed; UI, whole-diff review, live repair and deployed
workflow proof are still required.

## Operational requirements

Training page 4 derives staff-on from service, setup, checked travel and load;
staff-off includes cleanup, return travel and unloading. The source worksheet
pages 1 and 5 distinguish individual early/late team windows and actual crew
from sales ownership. Event guest hours are not the crew's working hours.

Actual EventAssignments and filled EventStaffNeeds must materialize linked
Shifts in the same command transaction. Open/claimed needs are not staffed.
New records without explicit personal times follow the crew timeline. Explicit
existing personal windows and manual/split shifts stay authoritative. Unknown
travel or other timing inputs must not leave an old calculated window looking
current. Repeated commands/sync must not duplicate shifts or attendance.

Later Event/timeline changes must reach automatic future staffing windows.
Performed shifts and TimeRecords retain their recorded work. Removing a
person from one role must not cancel work still supported by another assignment
or filled need. Approved swaps must not cause the original person to be
automatically staffed again on the next reconciliation.

## Baseline implementation evidence (73632202)

The previous source-backed owner correction is pushed as 73632202, full-check
green with independent review. The fresh admin production read in
live-staffing-20260910.json shows Ashley has one Captain assignment, two open
Event Staff needs and no Shift. Those records are existing planned staffing,
not evidence of worked attendance, and must be preserved during repair.

EventStaffingTab currently calls assignment creation and shift creation as
separate browser mutations; a failed second call leaves a saved assignment
without a Shift. It supplies the guest-event window to both assignment and
open-need creation. The separate fill command has no Shift side effect, and
the browser sync only creates missing shifts. Actual generated command paths
need to own the connection and timing updates.

## Implementation direction

Use authored Manifest fields/commands for whether staffing follows event
timing and for generated Shift provenance. An authored transactional callback
reads related staffing, timeline and existing Shift rows, then invokes generated
commands for every write. Existing Shift.schedule remains the validation and
creation path for known windows, including approved time off and qualifications.
Manual edits, swaps, performed work and unknown timing require explicit
qualification before calling the complete connection finished. No production
mutation or deployment has occurred.

## Expanded preservation and authorization checks (2026-09-10)

The expanded scratch runtime reproduced a manual-reschedule inconsistency:
the Shift stopped following the event, but its Assignment still followed the
event and retained different dates. The transactional ShiftRescheduled callback
now mirrors a personal edit to its originally automatic linked Assignment or
filled Need, clearing followsEventTiming. Reconciliation also preserves the
source window when its linked Shift is manual, swapped, performed, or has a
TimeRecord. Explicit personal source windows are not rewritten by this callback.

The focused preservation run verifies the manual Assignment and worked filled
Need remain byte-for-byte unchanged after another event timing change, alongside
the Shift and TimeRecord. This is limited admin-runtime evidence, not approval
of the full staffing implementation. The expanded role run now reaches the
predicted event_staff child read-policy failure. Independent Sol review still
rejects the current authorization implementation; its revised design guidance
is not an approval of the diff.

Next implementation requirements remain: shared event-roster reads; timing
propagation for the existing Event timeline actors; own-Person need claim and
release; transactional canonical-source validation on public automatic Shift
commands; proof that an automatic shift is obsolete before retirement; merged
and split source-group preservation including swaps; replacement of the browser's
separate assignment/Shift writes; and desktop/mobile plus full-check validation.
No production mutation or deployment has occurred.

## Current draft: connected commands and UI; generator gate failing

The authorization and single-command UI changes described above are now
implemented and qualified in scratch runtime/browser flows. The crew can read
shared event staffing and volunteer or release their own hold. Staffing
composition remains event/workforce manager work. Event timeline actors can
update already calculated source timing; every automatic Shift schedule/plan
recomputes its full source group, person, interval and role. Retirement checks
that no active source would lose its required shift. Invalid references are
checked even before timing is known. Approved time off rolls back both the new
assignment and attempted Shift. Source fields linked to performed/manual work
are preserved alongside Shifts and TimeRecords.

UI assignment, fill and unassign issue one generated command apiece; successful
forms reset, failed input stays. Same-role filled needs retain their source IDs
when combined with an assignment, so all split windows remain visible. The
three-width component fixture (1440/900/390) reads actual generated-command
snapshots through the real generated hooks, and qualifies keyboard retry,
own volunteer/release, early/late windows, unknown timing and preserved manual
times. It does not prove the authenticated full application or production.

Review required replacing feature-local permission reconstruction with a
server-owned affordance. Event.staffingCanManage now uses the same Manifest
role/capability expression as staffing commands. Authenticated inline get/list
queries return the correct result, but the generated standalone helper lacks
checkRole/user bindings. Full check fails at convex/computed.ts:181 (six TS2304
errors); [issue362](https://github.com/Angriff36/capsule/issues/362) owns this
projection gap. Both Builder and Capsule use registry3.6.52. Do not hand-edit
generated output or treat limited backend approval as current full approval.

Evidence: staffing-timing-qualified.json, staffing-timing-public-qualified.log,
staffing-timing-browser-qualified.json/.log and staffing-{connected,crew,unknown-timing}-
{1440,900,390}.png under .artifacts/operations-source-study. Required follow-up
still includes the generator fix, full green gate and review, fuller swap/manual
group qualification, real-data repair and release/authenticated verification.

## Upstream generator correction in progress

Issue362 is reproduced and implemented in the isolated Manifest worktree. Local
source passes seven generated execution/TypeScript regressions and the full
4,513-test suite. Helpers require explicit runtime bindings, relation hydration
receives them, and inline reads load auth independent of their policy bindings.
The source awaits final review/commit/registry publication. Capsule has not yet
consumed it and its current full gate remains failed. See newest progress entry.

## 2026-09-10 upstream PR81 and concrete staffing preservation failures

Manifest source commit9521ae61895e9573a4437d515a24f5f7b95e2c08 and documentation
proof commits are pushed; final headc1a6d1f08f7f57973a8f300f7f786a2d9ce4ca99.
PR https://github.com/Angriff36/Manifest/pull/81 is OPEN. Independent
model gpt-5.6-sol APPROVES the exact db385089..c1a6d1f range. One intervening
REJECT concerned only a missing proof-line range; it was corrected and
re-reviewed. Full4513 tests, typecheck/lint/format/cycles/docs passed locally.
Latest CI run34516255066 is live on that exact head (Windows typecheck and
Linux cycles at last read). Do not merge until exact-head CI is green. Then
merge upstream with ancestry preserved, run cut-release patch, verify npm
version/gitHead and release inventory, and consume the registry version through
aligned isolated Builder/Capsule regeneration. Registry remains3.6.52 at last read.

The extra release-inventory defect is tracked separately in
https://github.com/Angriff36/capsule/issues/363. Its one-step workflow fix is in
PR81; close only after a new release proves matching inventory/package versions.

A focused independent review of the remaining Capsule draft found an actual
person-wide freeze. The new scratch generated-command reproduction
qualify-staffing-manual-groups-runtime.ts independently confirms all three cases:
manual morning Shift + new evening Assignment yields only1 live Shift (expected2,
zero linked to the new Assignment); moving another evening Assignment leaves its
old Shift timestamp; unassigning it leaves that Shift scheduled instead of retired.
Evidence: staffing-manual-groups-gap.json/.log. This is an intentional failing
qualification, not a gate pass. Preserve exact linked manual/performed source
work, then reconcile unrelated source/interval groups for the same person.
validateAutomaticEventShift currently repeats the person-wide restriction and
must be corrected consistently with reconcileEventStaffing.

Approved swaps are a second unqualified ownership path: Shift.personId changes
while Assignment.personId/Need.filledByPersonId still name the prior person and
there is no ShiftSwapped staffing callback. Choose a connected source-owned
transfer/coverage representation, preserving original provenance and worked
history, then prove the actual approved swap flow. No product/source fix for
these two staffing problems has landed yet; the reviewer has not approved the
Capsule draft. Latest connected390/1440 screenshots were visually inspected:
split windows are visible and tables fit, but roster counts still count role
rows and the Open/claimable section still lists filled requests. Full app/browser
and product/data qualification remain ahead.

No Capsule production writes/deployment. The full original goal remains active.
