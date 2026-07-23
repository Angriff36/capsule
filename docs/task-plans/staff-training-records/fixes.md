# Staff training records fixes

Append resolved implementation or verification issues here with the exact command used.

## Disposable Playwright harness stability and locators
- Issue: the initial browser runs raced the training-card entrance animation and then exposed locator/API mismatches in the disposable harness.
- Fix: enabled reduced-motion, used accessibility role/name locators, selected exact option labels, and scoped the final assertion to the Weekly shifts ledger.
- Verification: `bunx playwright test output/playwright/staff-training-records.verification.spec.ts --browser=chromium --reporter=line --workers=1` — 1 passed in 5.3s.

## Shared regeneration timing
- Issue: A separate inventory feature was using the same Builder-owned outputs.
- Fix: Waited for its transaction, then verified it had compiled the already-present training source and updated `.builder/ownership.json`; avoided a redundant competing regeneration.
- Verification: `rg -n "TrainingModule_createViaDefine|TrainingCompletion_createViaRecord|ShiftType_createViaDefine" src/lib/manifest-convex-react.ts convex/mutations.ts`

## Recorded completion enforcement
- Issue: the Shift gate validated the referenced completion's Person and module but did not explicitly require its `recordedAt` marker.
- Fix: added `requiredTrainingCompletion.recordedAt != null` to the authored `Shift.schedule` constraint so an unrecorded seed cannot satisfy a gated shift.
- Verification: `bun run manifest:regen`, `bun run check:workforce-manifest`, and the focused Shift runtime proof.
