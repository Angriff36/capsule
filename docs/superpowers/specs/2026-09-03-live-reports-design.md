# Live Reports Design

**Date:** 2026-09-03  
**Status:** Approved for implementation planning  
**Owner direction:** Replace the saved-report placeholder with curated reports that automatically query live operational data.

## Problem

`/reports` currently saves only a name, subject area, chart type, sharing scope, and notes. It does not query operational records or render a report. The page therefore presents report controls without delivering a reporting outcome.

Capsule already has tenant-scoped, role-gated, reactive Convex queries and shared chart components. The missing piece is a report workspace that translates a small saved definition into a curated view of those live records.

## Outcome

An operator can create or open a saved report and immediately see current Capsule data for its subject area. The report remains subscribed to Convex, so changes in the underlying records update the visible result without a refresh or manual rebuild.

Every opened report provides:

- A concise KPI strip.
- The selected visualization: table, bar, line, or pie.
- A detailed table of the source records behind the summary.
- A date-window control stored with the definition.
- CSV export of the currently filtered detail rows.
- Clear loading, empty, unavailable, and access-denied states.
- A plain-language statement of which Capsule records supply the numbers.

## Selected Architecture

### Reactive subject adapters

Each subject area owns a focused React adapter. The adapter mounts only when its report is open and calls the existing generated Convex hooks required for that subject. Generated queries remain responsible for tenant filtering, field projection, capability checks, and reactive updates.

The adapters normalize their returned records into one presentation contract:

```ts
type LiveReportModel = {
  subject: ReportSubjectArea;
  sourceLabel: string;
  sourceDescription: string;
  effectiveWindow: ReportDateWindow;
  kpis: ReportKpi[];
  trend: ReportChartPoint[];
  breakdown: ReportChartPoint[];
  columns: ReportColumn[];
  rows: ReportRow[];
  csvFilename: string;
};
```

Presentation components consume this contract and do not know which Convex entities supplied it. Subject adapters contain pure transformation functions so record filtering, aggregation, and formatting remain independently understandable.

### Why this approach

- It uses the same live source of truth as the owning operational pages.
- It does not create a reporting database or cached duplicate of operational facts.
- It preserves generated authorization instead of recreating role maps in an authored backend query.
- It mounts only the selected subject's queries, avoiding a page that subscribes to every major table at once.
- It can later move expensive subject adapters behind purpose-built aggregate queries without changing the saved-definition or presentation contracts.

### Rejected alternatives

1. **One authored Convex reporting query.** This centralizes aggregation but would duplicate domain access rules and could accidentally reveal fields that generated projections intentionally withhold.
2. **Materialized reporting tables or a warehouse.** This scales to large analytical workloads but requires every generated write path to maintain aggregates transactionally. It is disproportionate for the current product and risks summary drift.

## Saved Definition Contract

The existing `SavedReportDefinition.definition` JSON field remains the storage boundary. No new Manifest entity or reporting aggregate is introduced.

New definitions use:

```ts
type LiveReportDefinition = {
  version: 2;
  dateWindow: "30_days" | "90_days" | "12_months" | "all_time";
  notes?: string;
};
```

`subjectArea`, `chartType`, `name`, and `sharingScope` remain first-class `SavedReportDefinition` properties. Existing version-1 definitions are accepted and interpreted as `all_time`; opening one produces live output without a migration.

New reports default to `90_days`. Changing the date window or chart type uses the existing governed `SavedReportDefinition.updateDefinition` command and its version check. No autosave loop is used: one explicit Apply action saves both choices, keeping concurrency behavior legible.

Supported chart types remain `table`, `bar`, `line`, and `pie`. Unknown legacy chart types fall back to `table` and expose an explanatory notice rather than failing the report.

## Subject Catalog

All calculations exclude soft-deleted records. A subject's primary timestamp determines date-window membership; `createdAt` is the fallback only when the domain record has no more meaningful operational date.

### Events

**Sources:** `Event`  
**Date:** `startsAt`, then `createdAt`  
**KPIs:** events, expected guests, quoted revenue, average quoted value  
**Breakdown:** event stage  
**Trend:** events and quoted revenue by calendar month  
**Detail:** title, start, venue, stage, expected guests, budget, quoted price

### Sales

**Sources:** `Proposal`  
**Date:** `eventDate`, `sentAt`, then `createdAt`  
**KPIs:** proposals, proposed value, accepted value, acceptance rate  
**Breakdown:** proposal status  
**Trend:** proposal count and value by calendar month  
**Detail:** proposal number, title, event date, status, guests, total

### Inventory

**Sources:** `IngredientDemand`  
**Date:** `purchasingWeekStart`, `confirmedAt`, `calculatedAt`, then `createdAt`  
**KPIs:** demand lines, confirmed lines, fulfilled lines, unresolved lines  
**Breakdown:** demand status  
**Trend:** demand-line count by calendar month  
**Detail:** ingredient reference, event reference, required quantity, unit, status, purchasing week

Quantities with different units are never added together. Until a cross-domain, permission-safe name projection exists, the evidence table shows compact ingredient and event identifiers and the source explanation links to `/inventory/demand`; individual identifiers are not links because Capsule has no stable demand-detail route. The report must not bypass Ingredient or Event read policy merely to display names.

### Production

**Sources:** `PrepTask`  
**Date:** `dueAt`, `completedAt`, then `createdAt`  
**KPIs:** tasks, completed tasks, blocked tasks, completion rate  
**Breakdown:** task status  
**Trend:** task count and completed count by calendar month  
**Detail:** task name, due date, station, category, quantity and unit, status

### Workforce

**Sources:** `Shift`  
**Date:** `startsAt`, then `createdAt`  
**KPIs:** shifts, scheduled hours, completed shifts, no-shows  
**Breakdown:** shift status  
**Trend:** shift count and scheduled hours by calendar month  
**Detail:** start, end, role, status, scheduled hours, person reference

The report never exposes pay rates or labor cost. Those remain behind the existing labor-summary seam and finance/workforce manager boundaries.

### Logistics

**Sources:** `Delivery`  
**Date:** `windowStartsAt`, `scheduledAt`, then `createdAt`  
**KPIs:** deliveries, delivered, in transit, failed  
**Breakdown:** delivery status  
**Trend:** delivery count and delivered count by calendar month  
**Detail:** delivery window, destination, status, driver reference, event reference

Encrypted notes and failure details are not added to the report projection.

### Finance

**Sources:** `Invoice`  
**Date:** `issuedAt`, `dueDate`, then `createdAt`  
**KPIs:** invoiced total, amount collected, amount outstanding, overdue invoices  
**Breakdown:** invoice status  
**Trend:** invoiced and collected value by calendar month  
**Detail:** invoice number, issue date, due date, status, total, paid, due

Money is aggregated only in the invoice's functional-currency values already projected by Manifest. If a legacy row lacks those computed fields, the report uses its stored total, amount paid, and amount due.

## Visualization Rules

- **Table:** the detail table is the primary visualization.
- **Bar:** status breakdown by record count for every subject.
- **Pie:** status breakdown using record counts; zero-value segments are omitted.
- **Line:** monthly trend in chronological order, including zero-value months inside the selected window when a bounded window is chosen.

Charts use the existing `BarChart`, `LineChart`, and `PieChart` components and design tokens. Tables remain available below every chart so a visual summary never hides its evidence.

## Page Experience

### Page structure

1. Editorial masthead with a truthful description: live reports from Capsule operational records.
2. Compact create/edit controls.
3. Saved-report index with Open, Rename, Share, Archive, and Restore actions.
4. One dominant live-report workspace for the selected report.

The first active report opens automatically when the page loads. Creating a report selects it immediately. If no definitions exist, the empty state explains that creating one will open a live report, not merely save a setup.

### Live-report workspace

The workspace shows:

- Report name, subject, effective date window, sharing scope, and a `Live` status chip.
- Apply controls for date window and visualization.
- KPI strip.
- Selected chart.
- Detail count and detail table.
- CSV export.
- Source explanation and a link to the owning workspace when a stable route exists.

There is no Run button: opening the report is running it, and Convex keeps it current.

### Responsive behavior

- Desktop uses a narrow saved-report index beside the dominant result workspace when width permits.
- Smaller screens stack the index above the result.
- KPI rows collapse from four columns to two and then one.
- Charts retain a minimum readable height and horizontal label density.
- Detail tables scroll horizontally inside their own ruled region without widening the page.

## Authorization and Sharing

Sharing controls who can discover the saved definition; it never grants permission to its underlying records. Each subject adapter receives only what its generated Convex hooks authorize for the current user.

If a user can open a shared definition but lacks the subject capability, the workspace shows that the saved report is available but its source data is not available to their role. It does not render zero as though the business had no data.

No new approval, specialist role, or validation policy is introduced. Report creation continues to require a linked Person because ownership is a `Person` reference.

## Loading, Empty, and Failure States

- **Definition loading:** retain the current skeleton behavior.
- **Source loading:** show a report-shaped skeleton in the result workspace.
- **No matching rows:** show zero-valued KPIs and state that no records fall in the selected window.
- **No source access:** distinguish authorization/unavailable failures from an empty dataset.
- **Partial multi-source availability:** a subject adapter either produces a complete model from its declared sources or states which source is unavailable; it never silently calculates a partial KPI.
- **Mutation failure:** retain categorized command errors and keep the current report visible.
- **CSV export:** disabled while loading and when there are no visible rows.

## CSV Export

CSV is generated in the browser from the same normalized rows shown in the detail table. It exports only visible report columns and the selected date window. Values use raw ISO dates and numeric amounts suitable for spreadsheets; visual formatting such as currency symbols is not embedded in numeric cells.

The filename is a filesystem-safe version of the report name plus the export date. Spreadsheet-formula prefixes (`=`, `+`, `-`, `@`) in text values are escaped so exported operational text cannot execute as a formula when opened.

## Boundaries

This delivery does not include:

- Arbitrary field selection, formulas, joins, or drag-and-drop report design.
- Scheduled email delivery.
- PDF export.
- Cross-tenant or public report links.
- Persisted report snapshots.
- New domain permissions or a reporting-only copy of operational data.
- A reporting warehouse or materialized aggregates.

These are absent product capabilities, not owner-deferred commitments.

## Documentation Changes

`docs/systems/closeout-reporting.md` will describe chart/result rendering as shipped rather than deferred and will name the live subject catalog, evidence table, and CSV behavior. User-facing copy on `/reports` will stop describing the feature as a definition-only library.

## Verification

The repository owner prohibits creating or expanding tests unless explicitly requested. Implementation therefore does not add tests.

Verification consists of:

1. Existing focused reports route and lifecycle tests.
2. Existing `bun run check` gate, including typecheck, formatting, secret scan, complete test coverage ratchet, build, generated ownership, and baseline checks.
3. Browser verification against the local Convex backend with seeded data:
   - create one report for at least two subject areas;
   - confirm KPIs, chart, and detail rows come from visible live records;
   - change a source record and confirm the open report updates reactively;
   - change date window and chart type and confirm the saved definition persists;
   - export CSV and inspect its headers and row count;
   - verify empty and unauthorized-source states;
   - verify desktop and mobile layouts.
4. Independent cross-model review, including `DESIGN.md`, before release because authored UI is changed.

## Success Criteria

- Saving a report opens real operational results immediately.
- Opening an existing saved definition queries current Convex data automatically.
- A source-record change appears without rebuilding or resaving the report.
- Every subject area produces curated KPIs, a chart model, and evidence rows from its declared source.
- Date window and chart choice persist through the governed update command.
- CSV contains exactly the visible filtered evidence rows and safe cells.
- Sharing never bypasses subject-level data access.
- Existing version-1 definitions remain usable.
- The page follows `DESIGN.md`, passes `bun run check`, passes independent UI review, and is verified in a real browser before release.
