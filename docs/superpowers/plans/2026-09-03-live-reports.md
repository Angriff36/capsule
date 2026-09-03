# Live Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the saved-definition placeholder with curated, reactive reports over current Capsule operational records.

**Architecture:** Keep `SavedReportDefinition` as the persisted configuration, mount exactly one subject-specific generated Convex list hook for the selected report, and normalize its authorized rows into a shared presentation model. Pure report-model helpers own date filtering, KPIs, chart points, detail rows, and CSV values; the page owns selection, lifecycle mutations, and the responsive workspace.

**Tech Stack:** React 18, TypeScript, generated Convex React hooks, Recharts wrappers, Capsule authored CSS and UI primitives.

**Spec:** `docs/superpowers/specs/2026-09-03-live-reports-design.md`

## Global Constraints

- Do not hand-edit generated Manifest or Convex files.
- Do not add or expand tests; the repository owner explicitly prohibits it unless requested.
- Use only generated list hooks so existing tenant and capability policies remain authoritative.
- New saved definitions use version 2 and default to `90_days`; version-1 definitions read as `all_time`.
- Sharing a definition never grants access to source rows.
- Use the existing DESIGN.md palette, typography, radii, ruled regions, chart components, and table patterns.
- Run existing focused tests, `bun run check`, browser verification, and independent cross-model UI review before release.

---

### Task 1: Shared live-report model and pure transforms

**Files:**
- Create: `src/features/reports/liveReportModel.ts`
- Create: `src/features/reports/liveReportBuilders.ts`

**Interfaces:**
- Produces: `ReportDateWindow`, `LiveReportDefinition`, `LiveReportModel`, `ReportKpi`, `ReportColumn`, `ReportRow`, `parseLiveReportDefinition`, `buildLiveReportModel`, and `downloadLiveReportCsv`.
- Consumes: plain generated query rows typed as `Record<string, unknown>` because the generated hooks expose inferred Convex return types rather than stable exported row interfaces.

- [x] **Step 1: Define the model contract and definition parser**

```ts
export type ReportDateWindow = "30_days" | "90_days" | "12_months" | "all_time";
export type LiveReportDefinition = {
  version: 2;
  dateWindow: ReportDateWindow;
  notes?: string;
};

export function parseLiveReportDefinition(value: unknown): LiveReportDefinition {
  const candidate = value as { version?: unknown; dateWindow?: unknown; notes?: unknown } | null;
  const dateWindow = REPORT_DATE_WINDOWS.includes(candidate?.dateWindow as ReportDateWindow)
    ? (candidate?.dateWindow as ReportDateWindow)
    : "all_time";
  return { version: 2, dateWindow, notes: typeof candidate?.notes === "string" ? candidate.notes : undefined };
}
```

- [x] **Step 2: Implement common date-window, month-bucket, numeric, label, and deleted-row helpers**

```ts
function visibleRows(rows: unknown[], dateWindow: ReportDateWindow, dateOf: (row: ReportSourceRow) => number | null) {
  const threshold = windowStart(dateWindow, Date.now());
  return rows.filter(isReportSourceRow).filter((row) => row.deletedAt == null)
    .filter((row) => threshold == null || (dateOf(row) ?? 0) >= threshold);
}
```

- [x] **Step 3: Implement all seven subject builders exactly as the spec catalog defines**

```ts
export function buildLiveReportModel(
  subject: ReportSubjectArea,
  rows: unknown[],
  dateWindow: ReportDateWindow,
): LiveReportModel {
  switch (subject) {
    case "events": return buildEventsReport(rows, dateWindow);
    case "sales": return buildSalesReport(rows, dateWindow);
    case "inventory": return buildInventoryReport(rows, dateWindow);
    case "production": return buildProductionReport(rows, dateWindow);
    case "workforce": return buildWorkforceReport(rows, dateWindow);
    case "logistics": return buildLogisticsReport(rows, dateWindow);
    case "finance": return buildFinanceReport(rows, dateWindow);
  }
}
```

- [x] **Step 4: Implement safe CSV serialization and browser download**

```ts
function csvCell(value: unknown): string {
  const raw = value == null ? "" : String(value);
  const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}
```

- [x] **Step 5: Run existing reports tests and typecheck**

Run: `bun run test -- tests/reports-routes.test.ts tests/proofs/saved-report-definition-lifecycle.runtime.test.ts && bun run typecheck`

### Task 2: Subject hook adapter and live workspace

**Files:**
- Create: `src/features/reports/LiveReportData.tsx`
- Create: `src/features/reports/LiveReportWorkspace.tsx`

**Interfaces:**
- Consumes: `buildLiveReportModel(subject, rows, dateWindow)` and the seven generated `useList*` hooks.
- Produces: `<LiveReportData subject dateWindow>{render}</LiveReportData>` and `<LiveReportWorkspace report model busy onApply />`.

- [x] **Step 1: Mount only the selected subject hook through keyed leaf components**

```tsx
export function LiveReportData(props: LiveReportDataProps) {
  switch (props.subject) {
    case "events": return <EventsData {...props} />;
    case "sales": return <SalesData {...props} />;
    case "inventory": return <InventoryData {...props} />;
    case "production": return <ProductionData {...props} />;
    case "workforce": return <WorkforceData {...props} />;
    case "logistics": return <LogisticsData {...props} />;
    case "finance": return <FinanceData {...props} />;
  }
}
```

- [x] **Step 2: Render report identity, Live status, date-window and chart controls**

- [x] **Step 3: Render KPI strip and table/bar/line/pie selection with existing chart components**

```tsx
if (chartType === "bar") return <BarChart data={model.breakdown} xAxisKey="label" series={[COUNT_SERIES]} />;
if (chartType === "line") return <LineChart data={model.trend} xAxisKey="label" series={model.trendSeries} />;
if (chartType === "pie") return <PieChart data={model.breakdown.map(({ label, value }) => ({ name: label, value }))} />;
return null;
```

- [x] **Step 4: Always render the evidence table, source explanation, route link, and CSV action**

- [x] **Step 5: Render distinct loading, empty, unsupported-subject, and unavailable-source states**

- [x] **Step 6: Run typecheck**

Run: `bun run typecheck`

### Task 3: Reports page integration and persisted controls

**Files:**
- Modify: `src/features/reports/ReportCreateForm.tsx`
- Modify: `src/features/reports/ReportsPage.tsx`

**Interfaces:**
- Consumes: `LiveReportData`, `LiveReportWorkspace`, `parseLiveReportDefinition`, and `useSavedReportDefinitionUpdateDefinition`.
- Produces: report creation that selects the returned definition and report Apply that persists chart type plus version-2 definition.

- [x] **Step 1: Make creation truthful and persist a version-2 90-day definition**

```ts
definition: { version: 2, dateWindow: "90_days", notes: notes || undefined }
```

- [x] **Step 2: Add selected-report state, auto-open the first active report, and Open actions**

- [x] **Step 3: Select the newly created report using the mutation return identifier**

- [x] **Step 4: Persist Apply changes through `updateDefinition` with the current optimistic version**

```ts
await updateDefinition({
  docId: report._id,
  version: report.version,
  chartType,
  definition: { version: 2, dateWindow, notes: definition.notes },
});
```

- [x] **Step 5: Replace the definition-only copy and table-only layout with the saved index plus dominant workspace**

- [x] **Step 6: Preserve Rename, Share, Archive, Restore, categorized errors, and notices**

- [x] **Step 7: Run existing reports tests and typecheck**

Run: `bun run test -- tests/reports-routes.test.ts tests/proofs/saved-report-definition-lifecycle.runtime.test.ts && bun run typecheck`

### Task 4: DESIGN.md-compliant responsive presentation

**Files:**
- Modify: `src/styles/app.css`
- Modify: `src/ui/charts/LineChart.tsx`

**Interfaces:**
- Consumes: semantic class names emitted by `LiveReportWorkspace` and `ReportsPage`.
- Produces: ruled two-column workspace, responsive KPI grid, fixed chart height, and horizontally scrolling detail evidence.

- [x] **Step 1: Add reports-specific layout styles using existing tokens only**

```css
.reports-workspace-grid { display: grid; grid-template-columns: minmax(15rem, 0.32fr) minmax(0, 1fr); gap: 1.5rem; }
.report-kpi-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border-block: 1px solid var(--color-line); }
.report-detail-scroll { max-width: 100%; overflow-x: auto; }
```

- [x] **Step 2: Add tablet and phone breakpoints that stack the live result before the index, jump to the opened result, and collapse KPIs to two then one column**

- [x] **Step 3: Give mixed-unit line reports a right-side axis so counts, hours, and money remain legible**

- [x] **Step 4: Run design vocabulary and format checks**

Run: `bun run check:design-vocab && bun run format:check`

### Task 5: Documentation, verification, review, and release

**Files:**
- Modify: `docs/systems/closeout-reporting.md`
- Modify: `docs/superpowers/plans/2026-09-03-live-reports.md`

**Interfaces:**
- Produces: current product documentation, checked plan boxes, browser evidence, independent review verdict, and released production behavior.

- [x] **Step 1: Update the system document from definition-only language to the shipped live subject catalog, evidence table, persistence, and CSV behavior**

- [x] **Step 2: Format only changed authored files and inspect the complete diff**

Run: `bunx prettier --write src/features/reports/liveReportModel.ts src/features/reports/liveReportBuilders.ts src/features/reports/LiveReportData.tsx src/features/reports/LiveReportWorkspace.tsx src/features/reports/ReportCreateForm.tsx src/features/reports/ReportsPage.tsx src/styles/app.css docs/systems/closeout-reporting.md docs/superpowers/plans/2026-09-03-live-reports.md`

- [x] **Step 3: Run the complete repository gate**

Run: `bun run check`

- [x] **Step 4: Verify the local authenticated reports flow at desktop and mobile sizes against seeded local Convex data**

- [ ] **Step 5: Push the branch and obtain an independent non-authoring model review with `DESIGN.md` and the required usability/design prompt**

- [ ] **Step 6: Fix any rejection, rerun `bun run check`, and repeat review until APPROVE**

- [ ] **Step 7: Release with the approved reviewer**

Run after `cursor-grok-4.5-high-fast` APPROVES: `bash scripts/release.sh --reviewer cursor-grok-4.5-high-fast`

- [ ] **Step 8: Verify Vercel READY, production SHA, `/reports` HTTP response, and the authenticated production report flow**
