# Fixes Log: Tip Distribution Calculator

## 2026-07-22

- Issue: Generated encrypted payroll money is schema-incompatible at runtime.
  Fix: Opened Capsule issue #76 and used a versioned encrypted-note marker through the governed PayrollInput command. The payroll compiler recognizes the marker until generation is corrected.
  Commands: `gh issue create --repo Angriff36/capsule ...`; `bun run check:payroll-manifest`

- Issue: Tip-only payroll inputs would make the existing compiler replace real hours with zero.
  Fix: Track hour-bearing inputs separately from gratuity-only inputs; use the gratuity marker as a money source without changing recorded or reviewed hours.
  Commands: focused Bun export script; `bun run typecheck`; `bun run build`

- Issue: Adding Tips to the exact tested `FINANCE_SECTIONS` array broke the existing finance-route contract test.
  Fix: Kept the core section list stable and added Tips only to `FinanceWorkspaceNav` while retaining the route constant and app route.
  Commands: `bunx vitest run tests/finance-routes.test.ts`

- Issue: A fresh Playwright context could not pass the external identity-provider loading gate.
  Fix: Verified the live Vite-served calculator module in Chromium for every pooling rule, exact-cent rounding, money parsing, and payroll-note round trips; recorded the authenticated-route limitation separately.
  Commands: `bunx playwright test tip-distribution-verification.spec.ts --reporter=line`; temporary spec deleted after pass

- Issue: The full repository gate stopped on unrelated event-manifest guard violations in pre-existing event files.
  Fix: Preserved those unrelated files and ran the feature-relevant payroll guard, typecheck, formatting, secrets scan, focused tests, and production build independently.
  Commands: `bun run check`; `bun run check:payroll-manifest`; `bun run typecheck`; `bun run build`; `bun run secrets`

