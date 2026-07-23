# Fixes Log: Personal Data Export (GDPR / CCPA)

## 2026-07-22 — Staff identity alias coverage
- **Issue:** Dashboard preferences use the Clerk auth subject while the initial export matched only the Person document ID.
- **Fix:** Read tenant-scoped dashboard preferences and saved reports, then filter ownership against both Person ID and `authSubjectId` aliases.
- **Commands:** `bun run typecheck`; `bun run build`.

## 2026-07-22 — Temporary browser verification cleanup
- **Issue:** The required Playwright verification needed disposable app/test files and produced temporary result data.
- **Fix:** Verified staff JSON and client-contact CSV downloads, then removed the spec, harness, config, results, and empty directories.
- **Command:** Temporary Chromium test passed 1 test in 22.4 seconds.

## 2026-07-22 — Shared gate isolation
- **Issue:** `bun run check` stops on unrelated Event direct-hook violations in the dirty shared checkout.
- **Fix:** Preserved unrelated work, referenced existing issue #40, and independently verified TypeScript, feature formatting, secrets, browser behavior, and production build.
- **Commands:** `bun run check`; `bun run typecheck`; `bun run secrets`; `bun run build`.
