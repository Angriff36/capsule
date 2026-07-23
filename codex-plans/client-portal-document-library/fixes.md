# Fixes: Client Portal Document Library

Append resolved implementation or verification issues here.

## 2026-07-22 — Public document DTO serialization

- Issue: Reusing full generated document types would expose unrelated record fields, and a missing staff lookup could emit an unsupported `undefined` value in the public Convex response.
- Fix: Narrowed PDF inputs to the fields each renderer consumes, projected only those fields, and normalized missing staff to `null`.
- Verification: `bun run typecheck` and the temporary four-download Playwright flow.

## 2026-07-22 — Ambiguous Playwright count selector

- Issue: `getByText("04")` also matched `CTR-1042` and `P-204`.
- Fix: Changed the temporary assertion to `getByText("04", { exact: true })`.
- Verification: `bunx playwright test client-portal-document-library.verification.spec.ts --reporter=line --workers=1 --output=output/playwright/client-portal-document-library` passed, then the temporary test was deleted.
