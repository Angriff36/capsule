# Fixes Log: Menu Profitability Analysis

Resolved implementation or verification issues will be appended here with the exact command used to confirm each fix.

## 2026-07-22
- Issue: A combined PowerShell discovery search failed because the repository has no `playwright.config.*` file.
  Fix: Treat Playwright config as optional and use explicit/guarded paths for subsequent searches.
  Commands: `rg -n 'playwright|dev|test' package.json`
- Issue: Recursive shell glob syntax was invalid for `rg` on Windows.
  Fix: Search the directory and pass file selection through `rg --glob`.
  Commands: `rg -n 'pattern' src --glob '*.manifest'`
- Issue: An overlapping session changed the profitability files during the first patch attempt.
  Fix: Stopped edits, re-read the overlapping result, and resumed only after the five relevant files stayed byte-identical across a five-second check.
  Commands: `Get-FileHash` before and after `Start-Sleep -Seconds 5`
- Issue: The latest npx Playwright runner conflicted with the local Playwright Test package.
  Fix: Used the repository-local runner so the test API and runner versions matched.
  Commands: `bunx playwright test output/playwright/menu-profitability-verification.spec.ts --reporter=line --workers=1`
- Issue: The temporary component harness rendered without the router context required by dish links.
  Fix: Wrapped the real profitability panel in `MemoryRouter`, rebuilt the harness, and reran the same focused Playwright spec successfully.
  Commands: `bun build output/playwright/menu-profitability-harness.tsx --outdir output/playwright/menu-profitability-bundle --target browser --format iife`; `bunx playwright test output/playwright/menu-profitability-verification.spec.ts --reporter=line --workers=1`
- Issue: The new profitability stylesheet failed the repository formatting check.
  Fix: Formatted only the feature stylesheet to avoid rewriting unrelated concurrent work, then verified all four authored feature files together.
  Commands: `bunx prettier --write src/features/kitchen/MenuProfitabilityPanel.css`; `bunx prettier --check src/features/kitchen/MenuDetailPage.tsx src/features/kitchen/MenuProfitabilityAnalysis.ts src/features/kitchen/MenuProfitabilityPanel.tsx src/features/kitchen/MenuProfitabilityPanel.css`
