# Resolved Issues: Staff Schedule Publish

## Manifest reserved publish identifier
- Issue: `bun run manifest:regen` rejected `command publish` because `publish` is reserved.
- Fix: renamed the domain commands to `publishSchedule` and `republishSchedule`, then updated the generated-hook call site and docs.
- Verification command: `bun run manifest:regen`

## Nullable weekly summary timestamps
- Issue: `bun run typecheck` rejected `number | null | undefined` values passed to `Intl.DateTimeFormat.format`.
- Fix: narrowed the already-filtered start/end values to concrete local numbers in `buildStaffShiftSummary`.
- Verification command: `bun run typecheck`

## Playwright harness relative imports
- Issue: the first temporary Playwright run failed before render because Vite did not apply regex aliases to source-relative imports.
- Fix: added a harness-only pre-resolution plugin that redirects generated hooks and nonessential child components to deterministic mocks.
- Verification command: `bunx playwright test staff-schedule-publish.verification.spec.ts --workers=1 --reporter=line`

## Playwright received-status locator
- Issue: the acknowledgement worked, but a broad `Received` text locator also matched instructional copy.
- Fix: changed the temporary test to match the exact status badge text.
- Verification command: `bunx playwright test staff-schedule-publish.verification.spec.ts --workers=1 --reporter=line`

## Temporary Playwright artifact cleanup
- Issue: shell policy blocked deleting verified empty directories.
- Fix: removed every temporary spec/harness file and Playwright's `.last-run.json` through `apply_patch`; no test source remains.
- Verification: `Test-Path staff-schedule-publish.verification.spec.ts` returned false.
