# TPP Report Catalog Compatibility Design

**Date:** 2026-09-03

**Owner direction:** Reproduce the Total Party Planner report catalog exactly before changing its terminology or report behavior. Public documentation and the Mangia TPP samples in `work/` are accepted as the starting evidence; details that cannot be proven from those sources may be inferred, but their provenance must remain explicit so later TPP comparisons can replace the inference.

## Goal

Make every report shown in Mangia's TPP report catalog available from Capsule with the same name, category, parameters, business result, grouping, totals, and document/export behavior. The screenshot contains 96 cards representing 89 unique reports; seven Favorites cards point to reports that also appear in another category.

This is a compatibility delivery. Capsule may improve terminology and presentation only after the complete TPP catalog is working and validated.

## Product boundary

The TPP report catalog is an authored compatibility registry over Capsule's governed operational records. It is not a second source of truth, a warehouse, or a generic field-and-formula designer.

- Report definitions live in authored TypeScript and are version controlled.
- Opening the catalog does not load report data.
- Running one report loads only the bounded data sources declared by that report.
- Every result is calculated from current Capsule records.
- Existing domain read rules remain authoritative.
- Cross-domain reports use authored Convex query seams that check the capabilities of every source they expose.
- No report creates new approvals, specialist roles, or workflow gates.
- Existing Capsule live dashboards and saved definitions remain available under a separate Saved reports view.

## Catalog contract

Each canonical report definition supplies:

```ts
interface TppReportDefinition {
  id: TppReportId;
  name: string;
  description: string;
  category: "contacts" | "event" | "financial" | "tpp_general";
  parameters: readonly TppReportParameter[];
  loader: TppReportLoaderId;
  renderer: TppReportRendererId;
  outputs: readonly ("print" | "pdf" | "csv" | "excel" | "labels")[];
  sourcePath?: string;
  evidence: readonly TppReportEvidence[];
}
```

The stable `id` is Capsule-owned and never shown as a replacement for the TPP name. Favorites reference the canonical ID, so a report shown twice never forks into two implementations.

Evidence records identify whether a behavior comes from:

- a Mangia TPP PDF, workbook, screenshot, or training recording under `work/`;
- published TPP or integration documentation;
- a direct comparison against the Mangia TPP tenant; or
- an inference from the catalog description and conventional report meaning.

Inference is a traceability state, not an unavailable product state. Accepted inferred definitions still run; later evidence updates the definition and its fixtures without renaming the report.

## Exact catalog inventory

### Favorites

Favorites are a per-person projection over canonical reports. The screenshot's current favorites are:

1. Event Booking
2. Event Changes
3. Event List
4. Event Menu
5. Event Timeline
6. Event Worksheet
7. Proposal of Service

Users can add or remove any canonical report with its star. Favorite state persists with the signed-in person and does not alter the underlying report.

### Contacts (11)

1. Address & Phone List
2. Birthday List
3. Contact Activity
4. Contact Event Envelope
5. Contact Letter Builder
6. Contract For Service
7. Event Menu
8. Invoice Event
9. Order Activity List
10. Packing Slip
11. Proposal of Service

### Event (29)

1. Beverage Order List by Vendor
2. Contact Worksheet (Blank)
3. Equipment Summary
4. Event BEO
5. Event Booking
6. Event Changes
7. Event Delivery Addresses
8. Event List
9. Event Menu Item Labels
10. Event Menu Item Production
11. Event Schedule
12. Event Tasks & Notes
13. Event Timeline
14. Event Worksheet
15. Heating & Serving - Labels
16. Heating and Serving Event Menu
17. Invoice Number History
18. Kitchen Labor
19. Master Food Production Worksheet
20. Menu Item Recipes
21. Menu Item Table Tents
22. Miscellaneous Order List By Vendor
23. Order List
24. Other Inventory Order List by Vendor
25. Pack List
26. Production Summary
27. Rental Order List by Vendor
28. Shopping List
29. Staff Schedules

### Financial (36)

1. A/R Aging Detail
2. Accounts Receivable
3. Accounts Receivable - New
4. Average Event Spending per Guest
5. Beverage Costs
6. Beverage Totals
7. Contact Payments
8. Contact Statement/Receivables
9. Credit Card Transactions
10. Event Discount Summary
11. Event Food Costing Summary
12. Event Other Fee(s)
13. Event Revenue by Client
14. Event Sales by Referral
15. Event Scheduled Payments
16. Inventory Cost Changes
17. Ledger / Food and Beverage Sales
18. Lost Revenue by Cancellation Reason
19. Menu Item Cost per Event
20. Menu Item Costing
21. Menu Item Itemized Sales
22. Menu Item Sales by Category
23. Miscellaneous Totals
24. Outstanding Deposits
25. Outstanding Proposals
26. Payment Totals
27. Platform Fee + Gratuity Summary
28. Profit Summary
29. Rental Charges
30. Sales Forecasting
31. Snapshot Revenue
32. Staff Earnings
33. Staffing Charges
34. Tax Exempt - New
35. Taxable Sales
36. Venue Sales

### TPP General (13)

1. Contact Task & Notes
2. Contact/Lead Opportunities
3. Events Pending Final Confirmation
4. Inventory In-Stock
5. Mailing Labels
6. Menu Item Listing Report
7. Menu Item Packages
8. Menu Item Popularity
9. Post Event Notes
10. Staff Address & Phone List
11. Vendor Phone List
12. Venue Detail
13. Venue Listing

## Report families

The 89 reports use explicit definitions while sharing six execution and presentation families.

### 1. Event documents

Event Menu, Contract For Service, Invoice Event, Packing Slip, Proposal of Service, Event BEO, Event Booking, Event Timeline, Event Worksheet, and Heating and Serving Event Menu are event-scoped documents. They default to the current or most recently viewed event and expose the TPP event selector when no current event is available.

Existing Capsule proposal, contract, invoice, and BEO PDF builders remain the source of document truth where they already represent the same document. TPP compatibility wrappers control field order, optional company blocks, contract selection, notes, page headers, and output labels.

### 2. Operational worksheets and labels

Production, order, equipment, schedule, task, pack, shopping, recipe, table-tent, and label reports use event/date/status/category/station/vendor filters as declared per report. Label and envelope renderers use fixed physical dimensions and page grids; print CSS must not scale them unpredictably.

### 3. Directory and activity reports

Contact, staff, vendor, venue, task, note, opportunity, and inventory listings are bounded, sortable directory reports. Search and date filters execute on indexed server-side fields where the result set may grow beyond a safe client query.

### 4. Receivables and payment reports

Invoice, deposit, scheduled-payment, transaction, payment-total, statement, and aging reports share a financial ledger model. Aging uses the selected as-of date and mutually exclusive current, 1-30, 31-60, 61-90, and over-90-day buckets. Currency totals use Capsule's functional-currency projections and never add raw amounts from different currencies.

### 5. Cost, sales, and profitability reports

Food, beverage, rental, staffing, miscellaneous, platform-fee, gratuity, tax, revenue, forecasting, and profit reports share typed money and quantity measures but retain report-specific inclusion rules. Draft proposals do not become billed revenue. Voided invoices and reversed payments follow the owning finance domain's truth rather than being filtered ad hoc in the UI.

### 6. Blank authored forms

Contact Worksheet (Blank) and Contact Letter Builder are printable authored forms rather than data summaries. They retain TPP's field labels and writing space; the letter builder accepts user-authored body content without storing it as a new contact fact unless the user explicitly saves through an existing contact-note command.

## Parameters

Parameters are declared data, not bespoke form code. Supported controls include:

- single event, contact, staff member, vendor, venue, category, station, status, salesperson, referral source, payment method, and tax state;
- multi-select equivalents where TPP allows them;
- start/end date and as-of date;
- include/exclude cancelled, archived, zero-balance, or zero-quantity rows where the source report exposes those choices;
- grouping, sort order, page break, quantity basis, grid-line, company-block, contract-template, and notes options;
- label stock and envelope options for physical print reports.

Defaults match published TPP documentation or Mangia samples. Event-scoped reports prefer current Capsule event context. Parameter validation prevents structurally invalid dates or missing required subjects, but does not add approval or policy tedium.

## Data execution

The browser submits a typed `TppReportRequest` containing the report ID and validated parameters. A registry resolver selects the exact loader. Loaders return a discriminated `TppReportResult` family rather than arbitrary JSON.

Simple, already-bounded single-domain reports may consume existing generated list hooks. Cross-entity, aggregate, or historically large reports use authored Convex queries under `convex/tppReports/`. Those queries:

- resolve the trusted tenant and person from auth;
- check each source domain's existing capability;
- use indexes, pagination, and explicit upper bounds;
- accept the current timestamp/as-of value from the client rather than reading wall time in a cached query;
- return only the fields the selected report prints;
- distinguish authorization failure, unavailable source, truncation, and a genuine empty result.

No 89-report fan-out occurs on the catalog page. Only the selected report's loader mounts.

## Favorites persistence

A small authored Manifest entity stores `(tenantId, personId, reportId)` with a uniqueness constraint and commands to favorite/unfavorite. Read and execute use ordinary `staffAccess`; a person can mutate only their own favorite row. Managers do not need a special override because favorites have no business consequence.

This is the only new persisted report state required by the compatibility catalog. Report results and parameter submissions are not snapshotted.

## Presentation

`/reports` opens on the TPP catalog with the exact section order Favorites, Contacts, Event, Financial, and TPP General. Names, descriptions, ordering, and star placement match the source catalog.

The catalog is rendered inside Capsule's `DESIGN.md` language: working paper, existing ink and line tokens, rule-led sections, accessible typography, and responsive stacking. The legacy TPP blue/gray skin is reference evidence, not authorization to replace Capsule's palette, type system, radii, shell, or navigation.

Selecting a card opens the report parameter workspace. Preview retains the chosen parameters and renders a report-specific document. Users can return to the catalog without losing the current preview during the route session.

Output actions are report-specific:

- Print uses a dedicated `.print-sheet` region and portrait/landscape `@page` rules.
- PDF uses existing jsPDF document builders when available or the verified print-to-PDF document layout for dense ledgers.
- CSV contains the visible tabular evidence with formula-prefix escaping.
- Excel is emitted only for reports where TPP offers spreadsheet output; numeric/date cells remain typed.
- Labels and envelopes use exact stock dimensions and print calibration.

## Loading, empty, and failure behavior

- The catalog itself renders synchronously from the registry.
- Parameter option lists show bounded loading states.
- Preview uses the target report's skeleton rather than a generic spinner.
- No matching rows is different from unavailable source access.
- Multi-source reports never calculate silently from a partial join.
- Bounded-query truncation is explicit and tells the operator how to narrow the parameters.
- Export actions are disabled until a complete result is present.
- A failed report leaves the parameters intact for correction or retry.

## Accessibility and responsive behavior

- Every report card and star is keyboard operable; the star has an explicit accessible name and pressed state.
- Parameter errors are associated with their fields and summarized at the form boundary.
- Tables use semantic headers and captions; horizontally wide tables scroll inside their ruled region.
- Print output preserves reading order and does not encode state by color alone.
- On smaller screens the catalog becomes one column and the result stacks after parameters; print layout remains physical-page sized rather than inheriting the phone viewport.

## Existing saved reports

The released seven-subject Capsule live-report system is retained. `/reports` provides a secondary Saved reports view containing create, open, rename, share, archive, and restore behavior. TPP catalog entries are not automatically converted into `SavedReportDefinition` rows.

## Documentation and evidence

The implementation maintains a report parity matrix with one row per canonical report:

- stable report ID and exact TPP name;
- implementation family and loader;
- parameters, columns, grouping, totals, and outputs;
- source entities and required capabilities;
- evidence paths/URLs;
- parity status and the last comparison date.

This matrix is implementation evidence, not a product allowlist. Every report in this spec must ship.

## Verification

The repository owner prohibits agents from creating or expanding tests unless explicitly requested, so this work adds no tests. Verification uses:

1. Existing report, route, generated-contract, finance, event, culinary, inventory, procurement, workforce, logistics, and PDF tests.
2. `bun run manifest:regen` and codegen when the favorite entity is added.
3. `bun run check` before any completion claim.
4. Browser verification of all 89 canonical report cards, every parameter form, a populated and empty result for each report family, favorite persistence, keyboard behavior, and responsive layouts.
5. Print/PDF inspection for every distinct document family, including physical label/envelope dimensions and multipage ledgers.
6. Numeric cross-checks against Mangia TPP samples or published definitions where available; inferred reports remain identified in the parity matrix until stronger evidence is compared.
7. Independent non-authoring model review with `DESIGN.md` and the repository's required usability/design prompt before merge.

## Success criteria

- All 96 screenshot cards render in the correct sections and resolve to 89 canonical report definitions.
- Favorites are personal, persistent, and never duplicate report behavior.
- Every canonical report accepts its TPP-compatible parameters and returns a real result from current Capsule data.
- Every report's columns, groupings, totals, and available outputs match its accepted evidence.
- No card is a placeholder or dead end.
- Report data stays inside existing tenant and domain authorization boundaries.
- Existing Capsule saved reports remain functional.
- Dense reports print cleanly, labels retain physical dimensions, and tabular exports preserve typed values.
- The complete repository gate and independent cross-model review approve the delivery.
