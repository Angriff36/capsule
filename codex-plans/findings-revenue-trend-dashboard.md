# Findings: Revenue trend dashboard

## Requirements

- Invoice revenue displayed by week, month, or quarter.
- Line or bar chart presentation.
- Breakdown by event type, client, or service line.
- Current period compared with the same period in the prior year.
- Temporary Playwright test required and removed after it passes.
- Full repository gate required before completion claim.

## Research Findings

- The checkout is on `main` and already contains extensive authored, generated, and untracked changes; all are user-owned until proven otherwise.
- Existing feature planning files document a prior payroll feature, so this task uses isolated feature-specific planning files.
- `npx` is installed, satisfying the Playwright skill prerequisite; repository-local execution will continue to use Bun commands.
- Invoice list hooks and authored finance pages already exist.
- Finance uses `FINANCE_SECTIONS`, `FINANCE_ROUTES`, lazy routes in `App.tsx`, and `FinanceWorkspaceNav`; a revenue page fits as another authored finance section.
- Invoice records provide `total`, `clientId`, optional `eventId`, `issuedAt`, `createdAt`, `status`, and soft-delete markers.
- Invoice `issue` is the creation command and sets `issuedAt`; `draft` is therefore still an issued billing record, while `voided`, `written_off`, and soft-deleted rows should not count as revenue.
- Event records provide `eventType`; client records provide `displayName` plus company/person name fields.
- Invoice line items and business service categories are explicitly not modeled. The existing invoice PDF renders one summary service line named “Catering services.”
- Event-dish `serviceStyle` is plate-level operational data and cannot truthfully allocate an invoice total across business service lines; it also has a broader staff-read policy than finance invoice/client/event data.
- The existing design language is an editorial operations ledger using Archivo, compact uppercase eyebrows, warm paper surfaces, and finance workspace tabs.

## Technical Decisions

- Aggregate issued invoice totals by `issuedAt` with `createdAt` as the legacy fallback.
- Exclude `voided`, `written_off`, and soft-deleted invoices; include all other issued invoice states.
- Provide week/month/quarter controls with rolling windows and same-period-prior-year comparisons.
- Break down current revenue by linked event type or client; use the truthful single “Catering services” category for service line and explain the current data limitation in the UI.
- Implement charting as authored, dependency-free SVG/CSS so no package or lockfile changes are needed.
- Add an accessible period comparison table under the visual chart so exact values remain available without relying on color or SVG interpretation.

## Verification Findings

- The revenue engine, TypeScript, existing finance route suite, commercial Manifest guard, secret scan, production build, and temporary Playwright flow pass.
- `bun run check` is blocked before feature-local gates by issue #40.
- The full test suite has 478 passing and 13 failing tests, all matching existing issue #32 plus stale navigation/generated mapping expectations.
- The repository format check is blocked by 180 unrelated files covered by issue #41; all feature files pass direct Prettier verification.
