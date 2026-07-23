# Fixes: Dashboard Home Widgets

Resolved issues for this feature will be recorded here with exact commands.

## 2026-07-22
- Issue: A new Manifest preference entity made the dashboard depend on a function push blocked by unrelated local schema drift.
  Fix: Classified pin layout as identity-owned UI state, persisted the normalized list in Clerk user metadata, and kept widget facts on existing Convex subscriptions.
  Commands: `bun run manifest:regen`, `bun run codegen`, `bun run typecheck`

- Issue: Playwright workers did not automatically inherit the ignored Clerk environment used by the running app.
  Fix: Loaded only the required Clerk values into the temporary verification process; the signed-in six-widget save/reload/restore flow passed, then the spec was deleted.
  Command: `bunx playwright test dashboard-home-widgets.verification.spec.ts --workers=1`

- Issue: The shared repository gate stops on unrelated Event direct-hook violations; an intermediate typecheck also observed generated output while it was changing.
  Fix: Preserved both concurrent areas, reran typecheck successfully after the checkout settled, and recorded the remaining Event gate blocker instead of editing unrelated files.
  Commands: `bun run check`, `bun run typecheck`, `bun run build`
