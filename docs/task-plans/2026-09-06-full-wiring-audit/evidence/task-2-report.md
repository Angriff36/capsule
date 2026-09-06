# Task 2 report: correct measured values and factual labels

## Scope completed

- Kitchen display batch completion now requires an operator-entered, finite, nonnegative actual yield. Zero is valid, the batch yield unit is displayed with the input, and failed mutations retain the typed value.
- Route planner labels its Haversine values as straight-line distance, labels time as a 40 km/h estimate, identifies coordinate-missing legs, and states that suggested/manual reorder state is browser-local and unsaved.
- Vendor performance names the timing metric precisely: receipt by the inclusive purchasing-week end.
- Revenue attribution apply-mode prefills from the quote estimate first and budget estimate second, explicitly names that basis, and changes the basis to operator-entered after editing.
- Comp Master uses `allocatedAmount` directly for only applied `sales_commission` attribution records. It no longer multiplies by 3%, falls back to quoted event revenue, or translates approval status into invented paid/pending facts. All-time and calendar-month values are separately labeled; both use the same applied/type/cancelled-event rules.
- The yield report retains "recorded actual yield" wording while warning that older records may contain the historical planned-yield copy. Existing records were not changed.

## RED evidence

Baseline before edits:

- `bun run test`: PASS, 142 files / 1,308 tests.

New tests were written before the behavior changes. The initial focused runs showed:

- Revenue estimate test: expected `{ amount: 1200, basis: "Quote estimate" }`, received the compile scaffold `{ amount: 0, basis: "" }`.
- Comp Master calculation test: expected an applied commission total of `125`, received `0` from the compile scaffold.
- KDS component tests: both failed because the actual-yield input did not exist (`querySelector` returned null). This directly demonstrated the missing operator-input behavior.

The route distance/missing-leg and purchasing-week boundary calculations already passed and therefore characterize existing correct calculations; the production changes for those areas are factual labels, not altered math.

## GREEN evidence

- `bunx vitest run tests/features/factual-values.test.ts tests/features/production/kitchen-display-yield.test.ts`: PASS, 2 files / 6 tests.
  - KDS submits actual yield `0` with the correct batch identity and retains `7.5` after a rejected mutation.
  - Route calculation independently checks approximately 111.19 km for one longitude degree at the equator, approximately 166.79 minutes at 40 km/h, and null missing-coordinate legs; displayed labels name those facts.
  - Vendor timing checks a receipt exactly at the inclusive week end as on-time and one millisecond later as late.
  - Quote and budget estimate selection uses literal expected values and provenance labels.
  - Commission calculation includes only an in-period, applied `sales_commission` allocation, excluding wrong type, wrong status, out-of-period, and cancelled-event records.
- `bun run typecheck`: PASS.
- Post-change `bun run test`: PASS, 144 files / 1,314 tests.
- `git diff --check`: PASS.

## Concerns and boundaries

- Historical ProductionBatch rows are unchanged. The report now discloses that older `actualYield` fields may have been populated from planned yield by the former KDS behavior.
- Route time remains a simple 40 km/h straight-line estimate and is not a road-routing result. This is now explicit wherever the value appears.
- Manual route reorder remains component state only. No persistence capability was invented.
- Comp Master has no payment entity linkage proving commission payout, so paid/pending presentation was removed rather than relabeled.
- Test output retains pre-existing React Router future-flag and server-render `useLayoutEffect` warnings; no test failed.
- No generated files, manifests, domain policy, deployment configuration, production data, or root-owned audit files were edited.

## Review round 1 correction

- RED: cross-month fixtures failed because the bounded commission calculation used `createdAt`. A record created before the period and applied inside it was omitted, while a record created inside and applied after it was included. The focused test received `300` instead of `125`, then the dedicated cross-month case received `70` instead of `20`.
- GREEN: bounded periods now use Manifest's `appliedAt`. Applied records without `appliedAt` remain in explicitly all-time totals for legacy completeness, but are excluded from bounded periods because no application date can be established.
- RED/GREEN follow-up: an applied allocation whose referenced Person was missing initially left the headline total `10` below the visible record table. The regression failed at `20` versus expected `30`; the helper now retains authoritative allocations under the truthful `Unknown salesperson` label. Two distinct missing Person ids remain distinct internal groups, so the Salespeople count does not collapse them into one fabricated identity.
- Cleanup: removed the unused per-person `eventCount` output.
- Verification command: `bunx vitest run tests/features/factual-values.test.ts tests/features/production/kitchen-display-yield.test.ts --reporter verbose && bun run typecheck`.
- Result: PASS, 2 test files / 7 tests; TypeScript `tsc --noEmit` exited 0.
- Captured output: `.artifacts/task-2-fix-tests.log` (ignored local evidence; intentionally not committed).
