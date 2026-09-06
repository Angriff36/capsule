# PR11 — Trust the report used to run the business

_Serves JTBD(s):_ Tim — understand performance; Josh — produce accurate operational reports without rebuilding spreadsheets.

## Job Statement

Get distinct, reproducible reports whose figures can be traced to the underlying business records.

## Baseline and ownership

Draft requirements; shared contract: [production readiness](../../docs/product/production-readiness.md). Reporting already includes `ReportsPage`, sales/KPI dashboards, saved definitions, and `src/lib/tppReports/` renderers. The old statement that no renderer exists is not current evidence. Issues #124 and #121 identify dashboard parity and commission definitions to audit. A shared resolver or a populated menu does not prove every report contains its required information.

## Acceptance Criteria

- [ ] PR11-01: The report inventory maps all 90 supplied workbooks, including the 70 indexed reports, to a supported report, source-only historical reference, or explicit unsupported requirement with reason and owner. Similar names do not justify treating different report purposes as equivalent.
- [ ] PR11-02: Operational report templates render their own required fields and grouping: service/BEO, kitchen prep, recipes, purchasing, staffing, packing, and financial summaries cannot all render a generic event menu. Missing source fields display a specific reason, not fabricated values or silently omitted sections.
- [ ] PR11-03: Every financial or KPI measure declares date basis, timezone, currency, included statuses, refunds/voids, tax/fee treatment, and whether it uses reconstructed ledger facts or historical references. Filters and totals use the same definition.
- [ ] PR11-04: Each of the seven dashboard requirements in the complete feature specification has a route/widget mapping, real-data query, empty/error state, and metric definition. Commission and attribution use the approved effective terms and allocation basis; no guessed formula can satisfy parity.
- [ ] PR11-05: Revenue, payment, stock, staffing, and recipe-cost totals reconcile to their owning records for the selected period. Unknown cost/quantity remains unknown with coverage counts, never zero or a misleading complete margin.
- [ ] PR11-06: A user can drill from an aggregate to its contributing records and, for imported history, its source reference. Excluded, unresolved, and duplicate records have visible counts; an aggregate source report is not counted again as individual transactions.
- [ ] PR11-07: Screen, print, and downloadable exports agree on filters, revision, row count, totals, and missing-data notices. Long reports paginate without clipped columns or missing rows; generated files obey the same access restrictions as the screen.
- [ ] PR11-08: Reports identify their source revision/as-of time. A live report reflects acknowledged edits; a saved snapshot remains reproducible and visibly dated. A failed refresh does not silently show old figures as current.
- [ ] PR11-09: An imported event and a natively created event both produce usable report sets through ordinary navigation. Evidence includes source-to-field comparisons, calculation fixtures, export inspection, and an authorized user's actual result, not only a resolver unit test.

## Dependencies and proof

PR01/PR02 establish source coverage; PR03–PR10 supply truthful domain data; PR12 secures exports; PR14 qualifies usability and scale. Record which omissions are missing source data versus missing mapping/rendering. Fix the appropriate owner rather than inserting demo values.

## Out of Scope

This owns presentation and reproducibility, not alternate accounting, staffing, or recipe business rules. Their owning specs remain required.

## Open Questions

Confirm commission/attribution formulas and ambiguous legacy report definitions with the business owner. Record unresolved definitions per metric; unrelated reports can still be completed and verified.
