# Credit Memo Issuance Fixes

Resolved implementation issues will be appended here with exact verification commands.

## 2026-07-22 — Deterministic credit memo browser proof
- Issue: the real local app requires Clerk/Convex session state and durable finance records, so a fresh browser could not safely exercise issuance.
- Fix: rendered the real `InvoiceDetailPage` in a temporary Vite harness with generated-hook aliases backed by disposable in-memory paid/open invoices.
- Verification: `bunx playwright test output/playwright/credit-memo-issuance-temp/credit-memo-verification.spec.ts --reporter=line --timeout=30000` — 1 passed (2.2s).

## 2026-07-22 — Temporary Playwright runner stability
- Issue: the first managed Vite process timed out after 10 seconds, direct execution of the Playwright Node CLI under Bun hung, and the first Vite config served the repository root.
- Fix: set the harness Vite root explicitly, run the local Playwright package through `bunx playwright`, and give the managed server a two-minute lifetime.
- Verification: the isolated spec listed as exactly one test and completed successfully.

## 2026-07-22 — Cumulative credit cap generation
- Issue: a constraint that referenced the earlier `priorCreditMemoAmount` compute compiled as `doc.priorCreditMemoAmount`, so valid issuance would compare against `NaN` and fail.
- Fix: inline the nullable source field fallback in the authored constraint and keep the compute for the later mutation value.
- Verification: `bun run manifest:regen`; generated-source inspection; `bun run typecheck`; `bun run check:commercial-manifest`; focused `git diff --check` — all passed.
