# Tenant branding fixes

Resolved issues are appended here with the exact verification command when applicable.

## 2026-07-22 — Missing tenant-wide document identity
- Fix: extended the canonical Organization model with optional display name, address, and color fields; added a settings UI, Clerk logo management, shared resolver, and integrations for five document types.
- Verification: `bun run manifest:regen`, `bun run typecheck`, and the inline Bun PDF smoke script recorded in `progress.md`.

## 2026-07-22 — Missing BEO and menu document exports
- Fix: added tenant-branded jsPDF builders and detail-page download actions using existing EventDish/MenuDish composition.
- Verification: browser Playwright test plus `bun run typecheck`, `bun run build`, and four-document PDF byte smoke check.
