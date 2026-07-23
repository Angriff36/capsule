# Tenant branding findings

## Baseline
- Branch: `main`.
- The checkout was already heavily dirty before this feature began; all pre-existing changes are user-owned.

## Discoveries
- No active `codex`, `claude`, `bun`, or `node` process was reported by the baseline process check.
- `src/app/App.tsx`, `src/app/nav.ts`, `src/styles/app.css`, and `src/ui/primitives.tsx` already contain unrelated user changes, so any edits there must be minimal and additive.
- Existing untracked document work includes `src/features/clients/proposalPdf.ts`, `src/features/finance/invoicePdf.ts`, and `src/features/clients/ContractDocumentPage.tsx`; these are user-owned and must be inspected before integration.
- Generated Convex CRUD is tenant-scoped through the authenticated `tenantId`; generated files remain off-limits.
- The app already reads the active Clerk organization for proposal and invoice display names.
- Existing PDF implementations are mixed: proposals and invoices use `jsPDF`; contracts use a print-ready React document and browser print-to-PDF.
- No existing BEO or menu PDF/export path was found by the initial search, so those surfaces must be located or explicitly added.
- `package.json` already includes `jspdf`; no new PDF dependency is needed.
- Installed Clerk SDK details: `OrganizationResource.setLogo({ file })` supports a tenant logo upload (image, up to 10 MB), and `imageUrl` exposes it for rendering.
- Clerk organization `publicMetadata` is read-only from the frontend, and `organization.update()` accepts only `name` and optional `slug`; it cannot persist address/colors client-side.
- The existing Manifest domain already exposes `Organization` records, so text/color configuration should extend that canonical entity while Clerk remains the logo asset store.
- Existing menu detail has no export. Existing event detail has no BEO export. These need authored PDF builders/actions using the current menu and event data rather than a new domain model.
- `Organization` is the canonical tenant account in `src/foundation/base.manifest`, with staff-wide reads and manager writes/commands.
- Generated hooks include both `useCreateOrganization()` and lifecycle command hooks, so the settings page can configure a previously unseeded tenant without a handwritten backend seam.
- Optional branding fields avoid invalidating existing Convex documents during deployment.
- `bun run manifest:regen` applied the Organization branding source with no conflicts and generated `useOrganizationConfigureBranding()` plus optional branding fields in Convex/Zod/client contracts.
- MenuDish rows provide menu/dish ids, sort order, course, service style, and instructions; EventDish rows provide dish, servings, course, service style, and instructions for branded menu/BEO exports.
- The first full TypeScript check passed after adding the settings page, shared resolver, five PDF integrations, and new BEO/menu builders.
- A runtime smoke check built proposal, invoice, BEO, and menu jsPDF documents from representative data; every output had at least one page and nontrivial PDF bytes.
- Contract export remains browser print-to-PDF and renders the same resolved logo/name/address/colors directly in its print document.
- The required full gate is blocked before branding checks by existing issue #40; ownership, proof-kit, proof registry, Manifest pin, and the feature's standalone typecheck passed before that guard.
- Playwright verified the resolved tenant name/address/colors/logo in a real browser and built nontrivial proposal, invoice, BEO, and menu PDF bytes. The contract-style preview rendered the primary and accent colors correctly.
- Temporary Playwright HTML/spec files and zero-byte server logs were deleted after the passing run. Screenshot evidence remains in `output/playwright/tenant-branding-verification.png`.
- Final verification passed: `bun run typecheck`, `bun run build`, targeted Prettier check, generated contract suite (300 tests), secret scan, and commercial Manifest integration guard.
- During final review, unrelated client-communication files and regenerated outputs appeared from another session. No further product edits were made after detecting that concurrent work.
