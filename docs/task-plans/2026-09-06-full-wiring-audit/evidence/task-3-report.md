# Task 3 report — safe pack/layout template and draft PO recovery

## Result

Implemented an authored atomic Convex seam for pack-template items, event layout-template sections, and event draft purchase-order materialization. Each parent mutation invokes only the existing generated governed commands. Child errors are not caught, so Convex rolls back the complete parent transaction.

Each UI operation stores a UUID-backed pending operation key in local storage until the mutation confirms. Generated child commands receive deterministic per-item/per-section/per-demand idempotency keys derived from it. An ambiguous response or refresh therefore reuses the same keys; a confirmed operation clears the pending key so a later deliberate operation is new.

The draft PO coordinator still enforces the existing planning/quote/sales_lock restriction, reuses a live draft for the event, skips already covered demand/ingredient rows, preserves demand-unit pricing behavior, and now submits its planned lines through one materialization call.

## RED

- Added `tests/proofs/safe-template-materialization.runtime.test.ts` first.
- Initial focused run: 2 failed / 1 passed because `lib/safeMaterialization` did not exist. The early rollback test passed for the wrong missing-module reason and was not counted as rollback proof.
- After adding the seam, expanded the proof to the draft-PO cases; the first run exposed an invalid proof role, then an invalid seed field. Correcting those fixtures produced real generated-command execution.

## GREEN

- Runtime proof: 5/5 passed. It verifies real persisted rows, rollback after a later generated command rejects, and successful confirmed retries with no duplicate pack rows, layout rows, PO headers, or demand lines.
- Existing coordinator and product-chain tests passed.
- Event and logistics integration guards passed after routing UI hooks through the narrow authored client helper rather than importing Convex directly in feature files.
- `bun run typecheck` passed.
- Dry codegen completed with `CONVEX_DEPLOYMENT=befitting-armadillo-283 bunx convex codegen --typecheck disable`; generated `convex/_generated/api.d.ts` includes the new authored module.

## Full suite

`bun run test` ran once: 1318 passed and 2 failed. Both failures were caused by the first version directly importing `convex/react` from Event/Logistics feature files (`event-manifest-integration-guard` and `logistics-manifest-integration-guard`). That wiring was then corrected; a focused rerun of both failed guards plus the runtime and coordinator suites passed 21/21. The full suite was not run a second time, per the task instruction to run it once.

Raw logs: `.artifacts/task-3-tests.log`.

## Review fix round 1

RED reproduced the review findings:

- `tests/pending-operation.test.ts`: 3/3 failed because the original helper stored only a key and threw on storage access/cleanup.
- `tests/proofs/safe-template-materialization.runtime.test.ts`: the foreign-tenant replay resolved successfully from the generated global idempotency cache instead of rejecting.

GREEN changes:

- Pending operations now freeze `{ key, payload }`. Retries replay the original complete request even if the reactive template/demand source changes order or content.
- Storage is best-effort. A blocked `getItem`/`setItem` falls back to the frozen in-memory operation. A throwing `removeItem` cannot turn confirmed backend success into UI failure; the current tab tombstones that stale stored operation.
- Every public seam resolves auth and the live tenant-owned parent before invoking generated commands or their cache. Generated idempotency keys are additionally tenant-prefixed.
- The PO seam resolves the live Event and enforces planning/quote/sales_lock server-side; validates Vendor, Ingredient, and IngredientDemand tenant ownership; validates each demand's Event/Ingredient relationship; and validates an existing draft order belongs to the same Event and Vendor.
- Generated role, guard, lifecycle, constraint, reaction, and idempotency behavior remains authoritative because all writes still use the generated commands.

Focused verification after the fix:

- `bun run test -- tests/pending-operation.test.ts tests/proofs/safe-template-materialization.runtime.test.ts tests/event-draft-po-coordinator.test.ts tests/event-manifest-integration-guard.test.ts tests/logistics-manifest-integration-guard.test.ts`: 5 files passed, 26 tests passed.
- `bun run typecheck`: passed.
- No full suite was run during this round because the root agent's full gate was already running.

Follow-up replay authorization proof:

- RED: a same-tenant caller with unrelated `staff` role received cached success after an authorized logistics operation.
- GREEN: each public seam now checks the same relevant generated capability (including organization capability disablement) before any child-cache replay. The focused set then passed 5 files / 27 tests and typecheck passed.

## Review fix round 2

- Replaced string identifiers with table-specific `v.id(...)` validators and a typed `MutationCtx` parent resolver. Runtime coverage rejects a same-tenant Client id presented as an Event id at validation.
- Added a narrow `materializationReceipt` technical helper over `commandIdempotencyKeys`. Request receipts and a tenant/family/scope head commit atomically with governed children. Exact retries return the stored count/output as `recovered`; when storage is unavailable after a refresh, the deterministic fallback key reads the latest scope head instead of re-running children.
- Storage getter access is inside the recovery boundary. First use with blocked storage uses the stable `scope:storage-unavailable` key. After a confirmed result, a deliberate second application in the same tab receives a fresh key even when persistence remains blocked. If its acknowledgement is lost and the page refreshes, the stable fallback resolves the latest server receipt.
- A cleanup exception cannot mask backend success. A stale stored UUID after refresh replays its exact server receipt. UI copy explicitly says the earlier saved item/section/PO result was recovered and reports counts from the frozen/server-confirmed payload, not refreshed source rows.
- Existing Event draft reuse now passes the draft's actual Vendor to the seam, rather than the currently selected default Vendor.

Focused verification command: `bun run test -- tests/pending-operation.test.ts tests/proofs/safe-template-materialization.runtime.test.ts tests/event-draft-po-coordinator.test.ts tests/event-manifest-integration-guard.test.ts tests/logistics-manifest-integration-guard.test.ts` — 5 files passed, 28 tests passed. `bun run typecheck` passed. The subsequent vendor-reuse coverage command, `bun run test -- tests/event-draft-po-coordinator.test.ts`, passed 1 file / 7 tests. Coverage includes two deliberate applications with blocked storage, ambiguous second acknowledgement plus refresh, cleanup failure plus refresh, changed source payload/count, wrong-table ids, role/tenant denial, PO stage/demand/order ownership, and existing integration guards. Dry codegen registered `convex/lib/materializationReceipt.ts`. No full suite or production/deployment operation was run.

## Scope and concerns

- No generated mutation/schema source was edited; only codegen output changed.
- No guard or policy was weakened and no arbitrary-command endpoint was added.
- No production write or deployment was performed.
- Existing busy and failure rendering remains active around the single atomic calls. Pending payloads use browser storage when available; denied storage and failed cleanup recover through the tenant-scoped server receipt/head path and are reported as recovered prior saves rather than new writes.

## Review fix round 3

RED against committed source showed that the real `window.localStorage` property getter escaped both helper boundaries; a first `storage-unavailable` receipt shadowed the newer scope head; an Event manager with procurement disabled was denied despite generated `procurementAccess || manageAccess` semantics; and the coordinator reported its refreshed plan count instead of the receipt's frozen count.

GREEN moves storage acquisition inside both exception boundaries, checks the latest scope head before an older exact fallback receipt, applies procurement capability disablement only to the procurement branch while `manageAccess` remains exempt, and prefers the materialization result's line count. `bun run test -- tests/pending-operation.test.ts tests/proofs/safe-template-materialization.runtime.test.ts tests/event-draft-po-coordinator.test.ts tests/event-manifest-integration-guard.test.ts tests/logistics-manifest-integration-guard.test.ts` passed 5 files / 31 tests. `bun run typecheck` passed. No full suite, production write, or deployment was run.
