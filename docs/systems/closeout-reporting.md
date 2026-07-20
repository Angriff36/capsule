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

## Primary workspace (Slice 8 + 8b)

| Route               | Outcome                                                              |
| ------------------- | -------------------------------------------------------------------- |
| `/finance/closeout` | Capture reconciled numbers for a closed-out event; finalize folio    |
| `/finance/payroll`  | Prepare person/period payroll rollup; finalize or void               |

**User outcomes proven**

1. Event → `closed_out` → EventCloseout.capture → finalize
2. Person.hire → PayrollInput.prepare → finalize (finance managers; opaque person ids)

## Core workflows (shipped vs deferred)

**Shipped**

- EventCloseout capture/finalize
- PayrollInput prepare/finalize/void (`financeManageAccess`)

**Deferred**

- SavedReportDefinition library and result rendering (`/reports` remains planned)
- Automatic aggregation from operational facts into closeout/payroll numbers
- PayrollInput `hourlyRate` / `overtimeRate` / `grossAmount` entry — Manifest encrypts
  private money to ciphertext while Convex schema still declares `number` (proven insert
  failure); minutes + optional notes ship without those fields

## Cross-system handoffs

Event lifecycle owns `closeOut`; EventCloseout stores the reconciliation fact. PayrollInput is finance-owned and optionally links Event/Shift. Person list uses `staffAccess` (finance managers have it).

## Proof

- Closeout runtime: `tests/proofs/event-closeout-lifecycle.runtime.test.ts`
- Payroll runtime: `tests/proofs/payroll-input-lifecycle.runtime.test.ts`
- Routes/lifecycle: `tests/finance-routes.test.ts`
- Guards: `bun run check:closeout-manifest`, `bun run check:payroll-manifest`

## References

- Related owner: [workforce.md](workforce.md)
- Implementation sequence: [implementation-plan.md](../product/implementation-plan.md)
