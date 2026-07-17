# Prep-list purchase draft design

## Goal

Let a purchasing user deliberately generate a vendor purchase-order draft from
prep-list ingredient demand in a selected date range. The draft combines the
same ingredient and unit across events while preserving every contributing
prep-list demand as provenance.

## Scope

- Add a Manifest-governed command that accepts a vendor and a date range.
- Offer last-seven-days, upcoming-seven-days, and custom date-range entry
  points in the authored purchasing UI.
- Collect eligible prep-list demand in the requested range.
- Create or update one editable VendorOrder draft for the selected vendor and
  range.
- Combine lines by ingredient and unit and retain the contributing demand IDs.
- Leave submitted, confirmed, received, and cancelled orders unchanged.

## Data flow

1. A purchaser selects a vendor and one of the supported time ranges.
2. The command validates the range and finds eligible prep-list demand with
   dated event provenance.
3. It groups quantities by ingredient and unit across every matching event.
4. It creates or refreshes the matching editable VendorOrder draft and its
   lines, recording source demand IDs for each combined line.
5. The normal order lifecycle remains responsible for submission, confirmation,
   receipt, and any subsequent stock effects.

## Decisions

- Demand is not automatically turned into a purchase order when a prep list is
  created or confirmed.
- The weekly shortcuts are convenience inputs for the same inclusive custom
  date-range behavior.
- A range is associated with the vendor and the draft it generated. Re-running
  the same vendor/range refreshes only that editable draft, preventing duplicate
  demand lines.
- Ingredient quantities with different units remain separate draft lines. Unit
  conversion is out of scope.
- A source demand can appear in one generated draft for a given vendor/range;
  provenance makes the contribution inspectable.

## Failure behavior

- Reject an empty, inverted, or malformed date range.
- Reject an unknown or inactive vendor.
- Report when no eligible demand exists for the range.
- Reject changes to any order that is no longer a draft.
- Surface command failures in the existing purchasing failure UI.

## Verification

- A focused runtime proof proves two event demands combine into one draft line.
- Tests cover date filtering, unit separation, provenance, repeat execution,
  empty ranges, and non-draft immutability.
- Manifest regeneration and the repository check run before completion, subject
  to unrelated baseline failures already present in the shared worktree.
