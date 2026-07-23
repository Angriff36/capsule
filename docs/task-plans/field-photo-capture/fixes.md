# Fixes Log

## 2026-07-22

No resolved feature issues yet.

- Issue: The shared automation browser had no active Clerk session, so the real `/my` route could not reach authenticated feature UI.
  Fix: Split verification at the production seam: `bun run manifest:regen` plus `bun run typecheck` verified Convex contracts, while a temporary Vite harness rendered the real `RecordPhotoCaptureView` for Playwright browser interaction.
  Commands: `bun run manifest:regen`; `bun run typecheck`; `$env:PW_CDP_URL='http://127.0.0.1:63941'; bunx playwright test output/playwright/field-photo-capture.verification.spec.ts --reporter=line --workers=1`

- Issue: The required full repository gate was red on unrelated shared-checkout work.
  Fix: Preserved unrelated files, ran all downstream gates independently, and escalated/updated the owning GitHub issues (#32, #40, #41/#46, #47, #56, #57).
  Commands: `bun run check`; `bun run test:coverage`; `bun run build`; `bun run baseline:decay`
