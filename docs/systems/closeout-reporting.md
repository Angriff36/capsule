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

## Primary workspace (Slice 8 thin unit)

Shipped under **`/finance/closeout`**:

| Route                | Outcome                                                         |
| -------------------- | --------------------------------------------------------------- |
| `/finance/closeout`  | Capture reconciled numbers for a closed-out event; finalize folio |

**User outcome proven:** Walk an Event to `closed_out`, capture an EventCloseout draft with consistent money/headcount fields, then finalize (finance manager) to freeze the fact.

Roles: `financeAccess` for capture/read; `financeManageAccess` required for finalize.

## Core workflows (shipped vs deferred)

**Shipped**

- Capture EventCloseout (createViaCapture) for events in `closed_out`
- Finalize draft closeouts (immutable afterward)
- List draft vs finalized; hide finalized by default

**Deferred**

- PayrollInput prepare/finalize/void UI
- SavedReportDefinition library and result rendering (`/reports` remains planned)
- Automatic aggregation from operational facts (operators enter reconciled numbers)

## Cross-system handoffs

Event lifecycle owns `closeOut`; EventCloseout stores the reconciliation fact. Capture requires `event.stage == closed_out`. Automatic closeout aggregation is not defined.

## Proof

- Runtime: `tests/proofs/event-closeout-lifecycle.runtime.test.ts`
- Routes/lifecycle: `tests/finance-routes.test.ts`
- Integration guard: `bun run check:closeout-manifest`

## References

- Related owner: [workforce.md](workforce.md)
- Implementation sequence: [implementation-plan.md](../product/implementation-plan.md)
