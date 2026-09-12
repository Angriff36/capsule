# Staffing replacement and reopening

The operational basis remains the training guide's crew-on/off window and the
worksheet's individual early/late assignments, recorded in staffing-timing.md.
This implements later staffing changes while preserving the owner's explicit
requirement to retain legitimate plans, assignments and performed work.

## Behavior

`EventStaffNeed.changeCoverage` accepts a filled or previously cancelled request.
An optional person fills the replacement immediately; leaving that field blank
posts an open request for volunteers. Optional new dates override the connected
window. Otherwise manual windows and genuine gaps are retained, and automatic
future coverage follows event crew timing. When work has been recorded, the
original Shift/attendance/TimeRecords stay unchanged; default new coverage starts
at the change timestamp. Fully ended recorded work requires explicit new times.

The old request retains former ownership, fill/claim timestamps, service notes
and existing cancellation reason. New requests point to the original request and
their frozen window slot. Source commands validate this plan and complete every
sibling through generated commands. A nested failure rolls the transaction back;
replays and forged/duplicate slots, including archived children, do not duplicate
work. Other roles keep their coverage.

## Requirements and eligibility

Continuation windows retain linked ShiftType, certification meaning and training
module requirements. Filling a continuation finds the selected person's own
active certification valid through coverage end and their recorded completion of
the required training. Generated scheduling receives those exact evidence IDs.
Public automatic Shift commands also verify the retained requirements, so callers
cannot bypass them by omitting optional scheduling arguments. Archived parent
history still owns the continuation's requirement snapshot.

Disjoint windows retain separate requirements. Combining incompatible ShiftTypes
or certifications cannot be flattened into the current single-requirement Shift
schema: the operation gives an actionable conflict and rolls back. Existing
assigned shifts retain their credential evidence through routine timing changes.
The change does not invent a closed role catalog or mandatory certifications for
roles that had none. Legacy training evidence without its required ShiftType, or
with a mismatched module, cannot silently become unrestricted replacement work.
The public scheduler already rejects that unsupported shape.

## Verification and limits

Scratch qualification uses actual generated commands and isolated convex-test
transactions. Legacy raw patches are labeled fixtures, not production repairs.
The initial credential reproduction failed because the replacement Shift had no
ShiftType; the corrected flow passes with recipient-specific proof IDs. Coverage
includes missing/expired credential rollback, reopening/archived history, public
omission, duplicate slots, existing timing usability, merged other roles,
manual/split windows, recorded work, managers and ordinary crew.

Artifacts under `.artifacts/operations-source-study/`:

- `qualify-staffing-replacement-runtime.ts` and `staffing-replacement-qualified.json`
- `qualify-staffing-replacement-credentials.ts` and its gap/qualified logs
- `staffing-replacement-browser-data.json`, captured from generated runtime
- `qualify-staffing-replacement-browser.mjs` and its qualified JSON/log
- `staffing-replacement-{prompt,open}-{1440,900,390}.png`
- Existing staffing regression logs ending `-after-replacement.log`
- `check-staffing-replacement-final.log`

The three-width browser uses real components and generated hooks with isolated
transport snapshots; it does not prove authenticated full-app or live behavior.
Independent gpt-5.6-sol APPROVES this bounded diff, including DESIGN.md review.
See the newest progress.md entry for the full gate and commit/push outcome.
Issue358 remains open for the broader staffing/data/app work. No production
write, release or full-goal completion is claimed.
