# Profit Margin Reports — Fixes

Append resolved implementation or verification issues here.

## Temporary Playwright harness rendering

- Issue: the first Playwright run rendered a blank page before the dashboard heading.
- Cause: the harness initially omitted the router context required by `FinanceWorkspaceNav`; an immediately following run also overlapped Vite page reloads from unrelated workspace activity.
- Fix: wrap the temporary harness in `MemoryRouter` and surface browser errors in the spec; no production change was needed. The next stable run passed.
- Verification command: `bunx playwright test profit-margin-verification.spec.ts --reporter=line --workers=1`
