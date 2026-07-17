# Current Manifest projection status

Authority: verified behavior of the generated CapsuleX artifacts in this checkout. Canonical product/domain intent remains in `C:/projects/Manifest-source`; this file records where the current projection succeeds or diverges.

Verified **2026-07-16** against Manifest **3.6.12** and Builder preset `convex-application` **1.3.4**.

## Generated coverage

| Evidence                                |                                     Current result |
| --------------------------------------- | -------------------------------------------------: |
| Canonical `.manifest` inputs            |   36/36 SHA-256 matches with `Manifest-source/src` |
| Governed business entities              |    43 (plus TenantScoped and SoftDeletable mixins) |
| Command capabilities / public mutations |                                          219 / 219 |
| Public queries                          |                                                214 |
| Internal event-log queries              |                                                  4 |
| Relationships                           |                                                 99 |
| Assembly verification                   | 20/20; complete; export allowed; 0 assembly errors |

Current positive evidence:

- public list, detail, and relationship-index queries exist for governed entities;
- mutations call the trusted auth seam, enforce tenant boundaries, policies, guards, and state transitions;
- generated mutations accept optional `version` and reject mismatches;
- encrypted scalar fields route through the authored encryption seam in inspected Event mutations;
- `Event_beginExecution` loads prep/pack/delivery relationships and evaluates the generated readiness guard;
- generated React wiring exposes typed command inputs, lifecycle transitions, invalidation hints, and failure categories.

## Reaction evidence

The current generated output has cleared the three previously recorded projection-shape defects. This is structural evidence, not yet a Convex runtime proof:

- `C:\projects\capsule\convex\mutations.ts` contains zero `payload.payload` references;
- fan-out reactions read the emitted flat payload and invoke their downstream governed command runners;
- `Payment_settle` invokes `__runInvoiceApplyPayment` instead of patching Invoice directly;
- `QualityCheck_fail` invokes `__runPrepTaskMarkBlocked` instead of patching PrepTask directly;
- `IngredientDemand_confirm` invokes `__runPurchaseNeedCreate` instead of inserting PurchaseNeed directly;
- `VendorOrderLine_addLine` invokes `__runPurchaseNeedMarkOrdered`;
- `C:\projects\capsule\tests\event-reaction-projection.test.ts` locks those source-shape corrections and passes in the current checkout.

### PX001 — Fan-out reaction payload shape: structurally resolved

The earlier generated output used invalid nested `payload.payload.*` reads. Manifest 3.6.12 output uses the flat emitted payload and dispatches fan-out consequences through governed runners. Current structural regression: `C:\projects\capsule\tests\event-reaction-projection.test.ts`.

### PX002 — Single-target governed dispatch: structurally resolved

The earlier generated output directly patched Invoice and PrepTask targets. Current output dispatches:

- `Payment_settle` → `__runInvoiceApplyPayment`;
- `QualityCheck_fail` → `__runPrepTaskMarkBlocked`.

This restores the generated target command path for guards, state changes, event emission, versioning, and downstream behavior.

### PX003 — Governed PurchaseNeed creation: structurally resolved

The earlier generated output inserted PurchaseNeed directly. Current `IngredientDemand_confirm` invokes `__runPurchaseNeedCreate`, preserving the target command's policy, guards, defaults, version, and event emission path.

### Remaining runtime proof debt

The repository does not yet include a Convex runtime test harness that executes these public mutations against authenticated, seeded tenant data. The following consequences are structurally corrected but not end-to-end proven:

- Event approval → IngredientDemand confirmation;
- Event cancellation → active Delivery, InventoryReservation, Invoice, PackList, PrepTask, and PurchaseNeed cancellation;
- Payment settlement → Invoice payment application;
- ~~failed QualityCheck → blocked PrepTask~~ — runtime proven in `tests/proofs/quality-check-fail-block.runtime.test.ts`;
- confirmed IngredientDemand → created PurchaseNeed (runtime proven);
- added VendorOrderLine → ordered PurchaseNeed.

A runtime proof must execute the source mutation and assert downstream document state, target event emission, version changes, tenant isolation, and rejection behavior. Merely finding the target runner in generated source is not sufficient.

## Degraded capabilities

- Canonical `searchable` declarations do not produce a full-text search surface; current generated access is list/detail/index based.
- Manifest money/decimal values project to JavaScript/Convex numbers. Exact scale and rounding must be verified before finance, costing, demand, receipt, or closeout slices ship.
- Assembly verification and the current source-shape regression do not execute the reaction paths above. Neither is an end-to-end workflow proof.

## Release rule

Individual entity CRUD/lifecycle UI may use the generated contracts. Automated cross-system consequences may be described as structurally available, but they are not verified workflows until focused Convex runtime reaction tests pass. Fix future projection defects at the Manifest/Builder source, regenerate CapsuleX, and add a focused regression; never patch `C:\projects\capsule\convex\mutations.ts` by hand.
