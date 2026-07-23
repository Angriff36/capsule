# Fixes Log: Client portal

## 2026-07-22 - Planning isolation
- Issue: Shared root planning files belong to a prior payroll-export task.
- Fix: Created feature-specific planning files under `codex-plans/client-portal/`.
- Commands: Read existing `codex-plans/` inventory before editing; files created with `apply_patch`.

## 2026-07-22 - Windows file discovery
- Issue: `rg` received literal `vite.config.*` and `playwright.config.*` path arguments from PowerShell.
- Fix: Use `rg --files` or explicit Windows paths before searching file contents.
- Commands: Future searches use directory roots and concrete discovered files.

## 2026-07-22 - Shared Event detail integration
- Issue: Another session added `ClientCommunicationPanel` while the portal patch was being prepared, so the exact-context patch refused to apply.
- Fix: Preserved the new work, waited for the file to stabilize, re-read it, and added only the portal import/action.
- Commands: `Get-Item src/features/events/EventDetailPage.tsx`; 25-second stability check; `apply_patch` against current content.

## 2026-07-22 - Playwright verification isolation
- Issue: The shared Convex dev deployment did not yet have the new public query, and syncing the broad dirty checkout would publish unrelated sessions' work.
- Fix: Verified token signing/tamper rejection separately, exercised the real unavailable/populated portal components in a disposable Vite fixture, and removed the fixture/spec after the pass.
- Commands: `bunx playwright test client-portal-verification.spec.ts --reporter=line --workers=1`; targeted token smoke command.

## 2026-07-22 - Concurrent Client merge build blocker resolved
- Issue: The first build observed `ClientsPage.tsx` importing a generated hook that its concurrent feature session had not emitted yet.
- Fix: Preserved that session; after it generated `useCreateClientMerge`, reran the production build successfully.
- Commands: `bun run build` (605 modules transformed, pass).
