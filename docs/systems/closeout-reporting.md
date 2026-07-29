# Closeout and reporting

> Owns the CapsuleX operator experience for EventCloseout, PayrollInput, and SavedReportDefinition.

## Purpose

Turn completed operational facts into a governed event closeout, payroll-ready inputs, and reusable report definitions without maintaining separate summary truth.

## Owned domain

| Source                                                         | Entities              |
| -------------------------------------------------------------- | --------------------- |
| `finance/event-closeout.manifest`, `finance/closeout.manifest` | EventCloseout         |
| `finance/payroll-input.manifest`                               | PayrollInput          |
| `insights/report.manifest`                                     | SavedReportDefinition |

## Primary workspace (Slice 8 + 8b + reports)

| Route               | Outcome                                                              |
| ------------------- | -------------------------------------------------------------------- |
| `/finance/closeout` | Capture reconciled numbers for a closed-out event; finalize folio    |
| `/finance/payroll`  | Prepare/finalize rollups; compile and export a selected payroll period |
| `/reports`          | Save/rename/share/archive/restore report definitions                 |

**User outcomes proven**

1. Event → `closed_out` → EventCloseout.capture → finalize
2. Person.hire → PayrollInput.prepare → finalize (finance managers; opaque person ids)
3. SavedReportDefinition.createDefinition → archive → restore (staffAccess)

## Core workflows (shipped vs deferred)

**Shipped**

- EventCloseout capture/finalize
- Categorized closeout photo evidence for venue condition, leftover food, and
  equipment return, stored directly against the EventCloseout record for waste
  and credit review
- PayrollInput prepare/finalize/void (`financeManageAccess`)
- Payroll period preview and UTF-8 CSV export for Gusto Smart Import, ADP
  mapping, and Paychex mapping. Closed/corrected TimeRecords supply recorded
  hours; finalized PayrollInputs supply reviewed regular/overtime totals and
  expose their delta as the manual adjustment.
- SavedReportDefinition library on `/reports` (create, rename, share, archive, restore)

**Deferred**

- Chart/result rendering for saved definitions (library stores config only)
- PayrollInput `hourlyRate` / `overtimeRate` / `grossAmount` entry — Manifest encrypts
  private money to ciphertext while Convex schema still declares `number` (proven insert
  failure); minutes + optional notes ship without those fields

Payroll compilation is read-only: it does not materialize a second stored
summary or submit payroll. ADP and Paychex companies may still need to map the
export columns to their account-specific earning codes or import template.

**Resolved (2026-07-29):** `finance_manager` still lacks `workforceAccess`, but
payroll and closeout no longer read time records through the generated
workforce queries. The authored seam `convex/laborSummary.ts` serves
clock-derived hours, pay rates, and labor-cost aggregates to
finance/workforce managers (and admin tier) directly:
`payrollTimeRecords` feeds the export preview, `eventLaborSummary` pre-fills
closeout labor, and `personPeriodLaborSummary` pre-fills payroll inputs.
`Person.hourlyRate` is a `private` field (stripped from `listPerson`); raw
rates are only exposed via the seam's `listPayRates` to
workforce/finance managers.

## Cross-system handoffs

Event lifecycle owns `closeOut`; EventCloseout stores the reconciliation fact. PayrollInput is finance-owned and optionally links Event/Shift. Person list uses `staffAccess` (finance managers have it).

## Proof

- Closeout runtime: `tests/proofs/event-closeout-lifecycle.runtime.test.ts`
- Payroll runtime: `tests/proofs/payroll-input-lifecycle.runtime.test.ts`
- Reports runtime: `tests/proofs/saved-report-definition-lifecycle.runtime.test.ts`
- Routes/lifecycle: `tests/finance-routes.test.ts`, `tests/reports-routes.test.ts`
- Guards: `bun run check:closeout-manifest`, `bun run check:payroll-manifest`

## References

- Related owner: [workforce.md](workforce.md)
- Implementation sequence: [implementation-plan.md](../product/implementation-plan.md)
