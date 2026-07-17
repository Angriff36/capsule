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

## Primary workspace

Use a **reconciliation folio**:

- Event closeout compares captured planned/actual financial and operational facts, unresolved issues, and notes before finalization;
- PayrollInput is a private ruled worksheet by Person/period with regular, overtime, total minutes, rates, and optional Event/Shift attribution;
- Reports is a library of governed saved definitions and a result workspace projected from live facts—not a collection of ornamental charts.

## Core workflows

- Capture and finalize an immutable EventCloseout point-in-time fact.
- Prepare, finalize, or void PayrollInput.
- Create, rename, update, share, archive, or restore SavedReportDefinitions.
- Navigate from closeout/report results to owning operational records for correction before finalization.

## Cross-system handoffs

Event lifecycle owns `closeOut`; EventCloseout stores the reconciliation fact. PayrollInput derives from Person/Shift/TimeRecord context but is finance-owned. Report results derive from governed facts across all systems. Automatic closeout aggregation is not yet defined.

## States and permissions

Closeout finalization and payroll facts are finance-manage work; payroll rates/amounts and notes are sensitive. Report sharing must follow the saved definition's governed scope. Exact money/decimal behavior remains a release gate.

## Current status

Generated queries and commands exist. No authored closeout, payroll, or report workspace exists. Reporting data execution/rendering is not implied by the SavedReportDefinition entity and must be designed against a real query/projection path.

## References

- Canonical: `C:/projects/Manifest-source/src/finance`, `C:/projects/Manifest-source/src/insights/report.manifest`
- Related owner: [workforce.md](workforce.md)
- Read-only intent reference: Capsule-Pro accounting, payroll, and analytics areas
