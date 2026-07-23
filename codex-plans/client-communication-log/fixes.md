# Fixes Log: Client Communication Log

## 2026-07-22 — Server-owned communication author

- **Issue:** Trusted `from context.actorId` was omitted from the client contract but remained a required generated Convex mutation argument.
- **Fix:** Authored `mutate authorId = user.id` so the generated command stamps the authenticated subject without accepting it from the browser; filed Capsule issue #44 for the projection mismatch.
- **Commands:** `bun run manifest:regen`; `bun run typecheck`; `bun run check:commercial-manifest`.

## 2026-07-22 — Disposable communication browser flow

- **Issue:** The real app requires Clerk/Convex membership, and a fresh browser context has no safe test identity.
- **Fix:** Used a disposable Vite harness around the real presentational panel, verified Contact and Event entries in Chromium, then deleted the harness, spec, config, and result files.
- **Command:** `bunx playwright test --config=output/playwright/client-communication.playwright.config.ts` passed 1 test in 4.0s.
