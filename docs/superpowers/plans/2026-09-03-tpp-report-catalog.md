# TPP Report Catalog Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship all 89 unique TPP reports shown by Mangia's catalog as real Capsule reports, including the 96-card categorized/favorites presentation and report-specific parameters and outputs.

**Architecture:** An authored, typed registry owns TPP names, descriptions, parameters, loaders, renderers, outputs, and evidence. Only the selected report mounts a bounded generated hook or authored Convex query; shared result families render tables, ledgers, event documents, worksheets, labels, and financial summaries without persisting duplicate business truth.

**Tech Stack:** React 18, TypeScript, Convex, Manifest 3.6.41, jsPDF, browser print CSS, generated Convex React hooks, Capsule UI primitives.

**Spec:** `docs/superpowers/specs/2026-09-03-tpp-report-catalog-design.md`

## Global Constraints

- Implement every report in the spec; no card may be a placeholder or dead end.
- Preserve exact TPP names, category order, descriptions, parameter meaning, grouping, totals, and per-report output availability until catalog parity is complete.
- Keep the Capsule shell, palette, typography, radii, responsiveness, and accessibility aligned with `DESIGN.md`.
- Do not hand-edit generated files. Run `bun run manifest:regen` for Manifest changes and `bun run codegen` for new authored Convex modules.
- Do not add or expand tests; the repository owner explicitly prohibits agent-authored tests. Run existing tests and gates.
- Keep report queries tenant-scoped, capability-aware, indexed or bounded, and limited to fields printed by the report.
- Do not add approvals, specialty report roles, or new workflow restrictions.
- Preserve unrelated dirty and untracked user files.

---

### Task 1: Typed TPP catalog and parity inventory

**Files:**
- Create: `src/features/reports/tpp/types.ts`
- Create: `src/features/reports/tpp/catalog.shared.ts`
- Create: `src/features/reports/tpp/catalog.contacts.ts`
- Create: `src/features/reports/tpp/catalog.event.ts`
- Create: `src/features/reports/tpp/catalog.financial.ts`
- Create: `src/features/reports/tpp/catalog.general.ts`
- Create: `src/features/reports/tpp/catalog.ts`
- Create: `docs/product/tpp-report-parity.md`

**Interfaces:**
- Produces: `TppReportId`, `TppReportCategory`, `TppReportParameter`, `TppReportDefinition`, `TPP_REPORT_CATALOG`, `TPP_REPORT_BY_ID`, `TPP_DEFAULT_FAVORITES`.
- Consumes: exact screenshot text and accepted evidence paths/URLs from the spec.

- [x] **Step 1: Define discriminated parameter, output, evidence, request, and result contracts**

```ts
export type TppReportParameter =
  | { key: string; type: "date"; label: string; required: boolean; default: "today" | "month_start" | "month_end" }
  | { key: string; type: "date_range"; label: string; required: true; default: "today" | "this_week" | "this_month" }
  | { key: string; type: "entity"; entity: "event" | "client" | "person" | "vendor" | "venue"; label: string; required: boolean; multiple?: boolean }
  | { key: string; type: "enum"; label: string; required: boolean; multiple?: boolean; options: readonly { value: string; label: string }[] }
  | { key: string; type: "boolean"; label: string; default: boolean }
  | { key: string; type: "text"; label: string; required: boolean };

export interface TppReportDefinition {
  id: TppReportId;
  name: string;
  description: string;
  category: TppReportCategory;
  parameters: readonly TppReportParameter[];
  loader: TppReportLoaderId;
  renderer: TppReportRendererId;
  outputs: readonly TppReportOutput[];
  evidence: readonly TppReportEvidence[];
}
```

- [x] **Step 2: Enter all 11 Contacts definitions with exact names and screenshot descriptions**
- [x] **Step 3: Enter all 29 Event definitions with exact names and screenshot descriptions**
- [x] **Step 4: Enter all 36 Financial definitions with exact names and screenshot descriptions**
- [x] **Step 5: Enter all 13 TPP General definitions and the seven default favorite IDs**
- [x] **Step 6: Add import-time catalog invariants for 89 unique IDs, expected category counts, valid loader/renderer pairs, and seven favorite references**
- [x] **Step 7: Write the parity matrix with one row per canonical report, its family, source records, parameters, outputs, and evidence state**
- [x] **Step 8: Format and typecheck**

Run: `bunx prettier --write src/features/reports/tpp docs/product/tpp-report-parity.md && bun run typecheck`

- [x] **Step 9: Commit and push**

```bash
git add src/features/reports/tpp docs/product/tpp-report-parity.md
git commit -m "feat: define complete TPP report catalog"
git push
```

### Task 2: Personal favorite persistence

**Files:**
- Create: `src/insights/tpp-report-favorite.manifest`
- Modify: `src/app.manifest`
- Create: `convex/tppReportFavorites.ts`
- Generated by regen: `convex/{schema,queries,mutations,http,crons,sagas,computed}.ts`, `convex/_generated/**`, `src/generated/**`, `src/lib/manifest-convex-react.ts`, `schemas/**`, `wiring/**`

**Interfaces:**
- Consumes: canonical `reportId: string` from Task 1.
- Produces: `api.tppReportFavorites.listMine()` and `api.tppReportFavorites.setFavorite({ reportId, favorite })`.

- [x] **Step 1: Add the `TppReportFavorite` authored Manifest entity**

```manifest
entity TppReportFavorite mixin TenantScoped {
  key [tenantId, id]
  unique [tenantId, personId, reportId]
  timestamps
  versionProperty version: number
  property indexed personId: uuid?
  property indexed reportId: string?
  default policy tppReportFavoriteRead read: self.personId == null or self.personId == user.personId "Staff may read their own report favorites"
  default policy tppReportFavoriteWrite write: roleAllows(user.role, "reportFavoriteSeamOnly") "Report favorites are managed only through the app"
  default policy tppReportFavoriteExecute execute: roleAllows(user.role, "reportFavoriteSeamOnly") "Report favorites are managed only through the app"
  store TppReportFavorite in durable
}
```

- [x] **Step 2: Register the new root module in `src/app.manifest`**
- [x] **Step 3: Run ownership-aware regeneration**

Run: `bun run manifest:regen`

- [x] **Step 4: Implement the authored upsert/delete seam using trusted auth tenant/person and the `(tenantId, personId, reportId)` key**
- [x] **Step 5: Run Convex codegen and focused gates**

Run: `bun run codegen && bun run typecheck && bun run check:manifest-registry`

- [x] **Step 6: Commit and push**

```bash
git add src/app.manifest src/insights/tpp-report-favorite.manifest convex/tppReportFavorites.ts convex src/generated src/lib/manifest-convex-react.ts schemas wiring .builder/ownership.json
git commit -m "feat: persist personal TPP report favorites"
git push
```

### Task 3: Report request parsing, option loading, and shared transforms

**Files:**
- Create: `src/features/reports/tpp/request.ts`
- Create: `src/features/reports/tpp/result.ts`
- Create: `src/features/reports/tpp/formatters.ts`
- Create: `src/features/reports/tpp/aggregates.ts`
- Create: `src/features/reports/tpp/exports.ts`
- Create: `convex/tppReports/options.ts`
- Create: `convex/tppReports/shared.ts`

**Interfaces:**
- Produces: `parseTppReportRequest(definition, FormData, now, currentEventId)`, `TppReportResult`, `TppTabularResult`, `TppDocumentResult`, `TppLabelResult`, `TppFinancialResult`, `escapeCsvCell`, `downloadTppCsv`, `downloadTppExcel`, and bounded option queries.
- Consumes: `TppReportDefinition` from Task 1 and `api` from `src/lib/api.ts`.

- [x] **Step 1: Parse declared controls into a typed request and return field-addressable validation errors**
- [x] **Step 2: Implement shared dates, quantities, functional-currency money, aging buckets, group totals, percentages, and safe-label helpers**
- [x] **Step 3: Implement exact result-family contracts**

```ts
export type TppReportResult =
  | { kind: "table"; title: string; columns: readonly TppColumn[]; rows: readonly TppRow[]; groups: readonly TppGroup[]; totals: readonly TppTotal[] }
  | { kind: "document"; title: string; template: TppDocumentTemplate; sections: readonly TppDocumentSection[] }
  | { kind: "labels"; title: string; stock: TppLabelStock; labels: readonly TppLabel[] }
  | { kind: "financial"; title: string; columns: readonly TppColumn[]; rows: readonly TppRow[]; groups: readonly TppGroup[]; totals: readonly TppTotal[]; measures: readonly TppMeasure[] };
```

- [x] **Step 4: Add bounded event/client/person/vendor/venue/category/status option queries**
- [x] **Step 5: Implement CSV and spreadsheet-safe export values, including formula-prefix escaping and typed numeric/date cells**
- [x] **Step 6: Run codegen, typecheck, and existing reports tests**

Run: `bun run codegen && bun run typecheck && bun run test -- tests/reports-routes.test.ts`

- [x] **Step 7: Commit and push**

```bash
git add src/features/reports/tpp convex/tppReports
git commit -m "feat: add TPP report request and result engine"
git push
```

### Task 4: Contacts and TPP General loaders

**Files:**
- Create: `convex/tppReports/contacts.ts`
- Create: `convex/tppReports/general.ts`
- Create: `src/features/reports/tpp/loaders.contacts.ts`
- Create: `src/features/reports/tpp/loaders.general.ts`

**Interfaces:**
- Produces real results for all Contacts and TPP General report IDs.
- Consumes: bounded report request and shared result helpers from Task 3.

- [x] **Step 1: Implement contact directory, birthday, activity, task/note, opportunity, and order-activity projections**
- [x] **Step 2: Implement event-linked contact envelopes, letters, contracts, menus, invoices, packing slips, and proposals by composing current document records**
- [x] **Step 3: Implement inventory in-stock, menu listing/packages/popularity, pending-final events, and post-event notes**
- [x] **Step 4: Implement staff/vendor phone and venue detail/list projections while keeping private wage and unrelated encrypted fields out of the payload**
- [x] **Step 5: Wire every Contacts and General catalog loader ID to a concrete resolver; unknown IDs throw instead of returning an empty report**
- [x] **Step 6: Run codegen, typecheck, existing contact/client/event tests, and reports tests**

Run: `bun run codegen && bun run typecheck && bun run test -- tests/reports-routes.test.ts tests/sales-report-client-label.test.ts tests/vendor-order-title.test.ts tests/event-planning-foundation.test.ts`

- [x] **Step 7: Commit and push**

```bash
git add convex/tppReports src/features/reports/tpp
git commit -m "feat: implement TPP contact and general reports"
git push
```

### Task 5: Event, production, order, and label loaders

**Files:**
- Create: `convex/tppReports/events.ts`
- Create: `src/features/reports/tpp/loaders.event.ts`
- Create: `src/features/reports/tpp/documents.ts`
- Create: `src/features/reports/tpp/labels.ts`

**Interfaces:**
- Produces real results for all 29 Event report IDs plus the event documents referenced from Contacts.
- Consumes: current event/menu/dish/recipe/prep/equipment/purchasing/vendor/order/pack/delivery/workforce records and existing proposal, contract, invoice, and BEO builders.

- [ ] **Step 1: Implement event booking/change/delivery/list/schedule/task/timeline/worksheet/BEO projections**
- [ ] **Step 2: Implement Event Menu, Heating and Serving Event Menu, Event Menu Item Production, Production Summary, and Master Food Production Worksheet**
- [ ] **Step 3: Implement Equipment Summary, Pack List, Shopping List, and Staff Schedules**
- [ ] **Step 4: Implement beverage, miscellaneous, other-inventory, rental, and general vendor order lists with vendor grouping and report-specific quantities**
- [ ] **Step 5: Implement Kitchen Labor, Menu Item Recipes, Invoice Number History, and the blank Contact Worksheet**
- [ ] **Step 6: Implement Event Menu Item Labels, Heating & Serving labels, and Menu Item Table Tents with exact physical print dimensions**
- [ ] **Step 7: Wire every Event loader ID to a concrete resolver and reuse accepted local TPP fixtures for field order and headings**
- [ ] **Step 8: Run codegen, typecheck, existing event/procurement/production/logistics/workforce tests, and PDF tests**

Run: `bun run codegen && bun run typecheck && bun run test -- tests/reports-routes.test.ts tests/features/events/eventRoutes.test.ts tests/event-manifest-integration-guard.test.ts tests/production-manifest-integration-guard.test.ts tests/logistics-routes.test.ts tests/workforce-manifest-integration-guard.test.ts`

- [ ] **Step 9: Commit and push**

```bash
git add convex/tppReports src/features/reports/tpp
git commit -m "feat: implement TPP event and production reports"
git push
```

### Task 6: Financial loaders and calculations

**Files:**
- Create: `convex/tppReports/financial.ts`
- Create: `src/features/reports/tpp/loaders.financial.ts`
- Create: `src/features/reports/tpp/financial.ts`

**Interfaces:**
- Produces real results for all 36 Financial report IDs.
- Consumes: Invoice, Payment, Proposal, Event, EventCloseout, RevenueAttribution, ingredient pricing, event menu/dish quantities, rentals/equipment, shifts/time/pay-rate seams, referral sources, venues, and functional-currency fields.

- [ ] **Step 1: Implement A/R Aging Detail, Accounts Receivable, Accounts Receivable - New, Contact Statement/Receivables, and Outstanding Deposits**
- [ ] **Step 2: Implement Contact Payments, Credit Card Transactions, Event Scheduled Payments, and Payment Totals from settled/reversed payment truth**
- [ ] **Step 3: Implement Average Event Spending per Guest, Event Revenue by Client, Event Sales by Referral, Sales Forecasting, Snapshot Revenue, and Venue Sales**
- [ ] **Step 4: Implement Beverage Costs/Totals, Event Food Costing Summary, Inventory Cost Changes, Menu Item Cost per Event/Costing/Itemized Sales/Sales by Category**
- [ ] **Step 5: Implement Event Discount Summary, Event Other Fee(s), Miscellaneous Totals, Rental Charges, Staffing Charges, Staff Earnings, and Platform Fee + Gratuity Summary**
- [ ] **Step 6: Implement Ledger / Food and Beverage Sales, Lost Revenue by Cancellation Reason, Outstanding Proposals, Profit Summary, Tax Exempt - New, and Taxable Sales**
- [ ] **Step 7: Keep drafts out of billed revenue, voided/reversed rows out of collected totals, currency conversion at issued snapshots, and missing-cost/rate coverage visible**
- [ ] **Step 8: Wire every Financial loader ID to a concrete resolver; do not share raw pay rates outside management-authorized staff-earnings calculations**
- [ ] **Step 9: Run codegen, typecheck, finance money truth, payment, margin, food-cost, revenue, and reports tests**

Run: `bun run codegen && bun run typecheck && bun run test -- tests/reports-routes.test.ts tests/finance-money-truth.test.ts tests/food-cost-ratio-copy.test.ts tests/proofs/event-estimated-food-cost.runtime.test.ts tests/proofs/invoice-payment-lifecycle.runtime.test.ts tests/proofs/event-closeout-lifecycle.runtime.test.ts`

- [ ] **Step 10: Commit and push**

```bash
git add convex/tppReports src/features/reports/tpp
git commit -m "feat: implement TPP financial reports"
git push
```

### Task 7: Catalog, parameter, preview, and output UI

**Files:**
- Create: `src/features/reports/tpp/TppReportCatalog.tsx`
- Create: `src/features/reports/tpp/TppReportParameters.tsx`
- Create: `src/features/reports/tpp/TppReportRunner.tsx`
- Create: `src/features/reports/tpp/TppReportResult.tsx`
- Create: `src/features/reports/tpp/TppReportTable.tsx`
- Create: `src/features/reports/tpp/TppReportDocument.tsx`
- Create: `src/features/reports/tpp/TppReportLabels.tsx`
- Modify: `src/features/reports/ReportsPage.tsx`
- Modify: `src/styles/app.css`

**Interfaces:**
- Consumes: catalog, favorites APIs, request parser, loaders, result families, and export helpers.
- Produces: exact 96-card catalog, personal stars, report parameter forms, previews, print/PDF/CSV/Excel/label actions, and secondary Saved reports view.

- [ ] **Step 1: Add Catalog and Saved reports route-local views without removing existing saved-definition lifecycle behavior**
- [ ] **Step 2: Render Favorites, Contacts, Event, Financial, and TPP General in exact order with names, descriptions, and accessible star toggles**
- [ ] **Step 3: Render declared parameter controls, current-event defaults, validation summary, and retained values after failure**
- [ ] **Step 4: Mount only the selected report loader and render distinct loading, unavailable, empty, truncated, and complete states**
- [ ] **Step 5: Render shared table, ledger, document, worksheet, label, and financial result families with semantic headers and group totals**
- [ ] **Step 6: Add report-specific Print, PDF, CSV, Excel, and labels actions from the catalog outputs**
- [ ] **Step 7: Add `DESIGN.md`-compliant ruled catalog/workspace styling, responsive stacking, horizontal evidence scrolling, and physical print rules**
- [ ] **Step 8: Run formatting, design-vocabulary, typecheck, existing reports tests, and build**

Run: `bunx prettier --write src/features/reports src/styles/app.css && bun run check:design-vocab && bun run typecheck && bun run test -- tests/reports-routes.test.ts && bun run build`

- [ ] **Step 9: Commit and push**

```bash
git add src/features/reports src/styles/app.css
git commit -m "feat: add complete TPP reports workspace"
git push
```

### Task 8: Documentation, exhaustive verification, review, and release

**Files:**
- Modify: `docs/product/tpp-report-parity.md`
- Modify: `docs/systems/closeout-reporting.md`
- Modify: `docs/superpowers/plans/2026-09-03-tpp-report-catalog.md`
- Create: `.artifacts/tpp-report-catalog/` browser and print evidence only

**Interfaces:**
- Produces: checked parity matrix, current system documentation, complete gate evidence, browser/print evidence, independent approval, and production release proof.

- [ ] **Step 1: Confirm all 89 catalog definitions have concrete loader and renderer coverage and all seven Favorites references resolve**
- [ ] **Step 2: Update the closeout/reporting system document with TPP compatibility behavior, data boundaries, and output families**
- [ ] **Step 3: Run the full repository gate**

Run: `bun run check`

- [ ] **Step 4: Start local Convex and Vite, then browser-check all 96 cards, category ordering, personal favorites, keyboard behavior, and Saved reports preservation**
- [ ] **Step 5: Run one populated and one empty report from each of the six report families and inspect every distinct parameter control**
- [ ] **Step 6: Print-inspect every distinct event-document, worksheet, ledger, label, envelope, table-tent, and multipage financial layout at letter size**
- [ ] **Step 7: Cross-check published/local-evidence reports numerically and update the parity matrix with the exact evidence and comparison status**
- [ ] **Step 8: Commit documentation/evidence metadata and push the clean branch**

```bash
git add docs/product/tpp-report-parity.md docs/systems/closeout-reporting.md docs/superpowers/plans/2026-09-03-tpp-report-catalog.md
git commit -m "docs: record TPP report parity evidence"
git push
```

- [ ] **Step 9: Obtain an independent non-authoring model review with `DESIGN.md` and the repository-required usability/design prompt**
- [ ] **Step 10: Fix every rejection, rerun `bun run check`, push, and repeat review until APPROVE**
- [ ] **Step 11: Release once the tree is clean, the branch is pushed, the full gate is green, and the independent reviewer approves**

Run after `cursor-grok-4.5-high-fast` approves: `bash scripts/release.sh --reviewer cursor-grok-4.5-high-fast`

- [ ] **Step 12: Verify remote main SHA, Vercel READY state, production `/reports`, favorite persistence, one event document, one operational worksheet, and one financial total against the released revision**
