# Fixes: Ingredient substitution suggestions

Resolved implementation or verification issues will be recorded here with exact commands.

## 2026-07-22
- Issue: The authenticated app was blocked at Clerk session checking during prior browser runs.
  Fix: Rendered the real shortage banner through a temporary Vite entry with production-shaped mapped ingredient, stock, and reservation data; verified it with a temporary Playwright spec and then deleted both temporary files.
  Commands: `bunx playwright test ingredient-substitution-verification.spec.ts --browser=chromium --reporter=line --workers=1`

- Issue: Full completion gate stops on seven Event integration violations outside this feature.
  Fix: Verified the exact blocker is already durably tracked in `Angriff36/capsule#58`; preserved concurrent Event work and continued with independent downstream gates.
  Commands: `bun run check`; `gh issue view 58 --repo Angriff36/capsule`
