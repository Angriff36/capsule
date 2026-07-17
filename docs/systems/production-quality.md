# Production and quality

> Owns the CapsuleX operator experience for PrepTask, ProductionBatch, QualityCheck, Incident, and EventAllergenCheck.

## Purpose

Turn event demand into executable kitchen work, prove readiness through completion and inspection, and keep operational incidents and human allergen verification attached to the work they concern.

## Owned domain

| Source                            | Entities           |
| --------------------------------- | ------------------ |
| `production/task.manifest`        | PrepTask           |
| `production/batch.manifest`       | ProductionBatch    |
| `production/prep.manifest`        | QualityCheck       |
| `quality/incident.manifest`       | Incident           |
| `quality/allergen-check.manifest` | EventAllergenCheck |

## Primary workspace

Use an **execution board** with a companion **production sheet**:

- group prep by event, due window, station text, assignee, and real status;
- make quantity, unit, recipe/dish/demand provenance, claim, blocker, and completion visible in each row;
- give ProductionBatch a yield-focused document linked to recipe and event;
- place quality gates next to their subject, not in a detached QA dashboard;
- attach incident and allergen records to the relevant Event/work object.

## Core workflows

- Open, claim, release, start, complete, block/unblock, or cancel PrepTasks.
- Plan, start, complete, or cancel ProductionBatches.
- Open, pass, fail, or reinspect QualityChecks.
- Report, investigate, resolve, or dismiss Incidents.
- Record the human EventAllergenCheck result for event/dish context.

## Cross-system handoffs

Demand and culinary facts produce prep/batch work; completed prep and logistics state contribute to Event readiness; failed quality should block PrepTask; Event cancellation stops open prep; pack items may reference batches; incidents may reference prep, shift, or delivery.

## States and permissions

Claims use trusted operator identity. Lead/manage capabilities govern blocking, cancellation, reinspect, incident dismissal, and similar consequential actions. An EventAllergenCheck is a human verification fact, not an automated allergen engine.

Open decisions include first-class stations, task dependencies, quality auto-block semantics, and automated guest×dish allergen matching.

## Current status

Slice 4 operator surface ships at `/kitchen/prep` (Prep execution board).

| Surface          | Detail                                                                                                                                                                                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Route            | `/kitchen/prep`                                                                                                                                                                                                                                              |
| Roles            | `kitchen_staff` (read/claim/start/complete/open+pass QC); `kitchen_lead` / `kitchen_manager` for block, cancel, reinspect, and fail→block reaction                                                                                                           |
| Commands         | PrepTask open/claim/release/start/complete/markBlocked/unblock/cancel; QualityCheck open/pass/fail/reinspect                                                                                                                                                 |
| Lifecycle        | PrepTask `pending → claimed → in_progress → completed` (+ block/cancel); QualityCheck `pending → passed\|failed` (+ reinspect)                                                                                                                               |
| Failure behavior | Command failures surface through `ProductionFailureBanner`; denied lead actions and reaction failures leave no partial QC/prep state                                                                                                                         |
| Limitations      | Convex projection does not hydrate `belongsTo` for guards — PrepTask.open uses seeded FK guards. Stations remain free text. Quality auto-block semantics beyond the declared fail→markBlocked reaction remain open.                                          |
| Proof            | Structural: `tests/event-reaction-projection.test.ts`. Runtime: `tests/proofs/quality-check-fail-block.runtime.test.ts` (`QualityCheckFailed → PrepTask.markBlocked`). Guard: `generated/proof/guard.production.json` + `bun run check:production-manifest`. |

Manifest output dispatches `QualityCheck_fail` through the governed PrepTask `markBlocked` runner. That path is runtime-proven for an allowed lead role; kitchen_staff fail attempts fail closed without partial allocation.

## References

- Canonical: `C:/projects/Manifest-source/src/production`, `C:/projects/Manifest-source/src/quality`
- Projection limits: [projection-status.md](../generation/projection-status.md)
- Read-only intent reference: Capsule-Pro Kitchen prep/task and allergen flows
