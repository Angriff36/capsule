# Task 4 report: safe culinary clone, import, and restore

## Status

Implemented and verified on `fix/full-wiring-audit-20260906` from `01194ef`.

- Added `convex/lib/culinaryOperations.ts`, an authored culinary mutation seam. This location follows the AGENTS ownership boundary (`convex/lib/**`) and keeps the domain-specific transaction separate from the existing pack/layout/PO materializer.
- Menu clone now sends only `sourceMenuId`, the reviewed destination name/template flag, and a durable operation key. The server loads the source and lines, validates live tenant-owned dishes, runs generated commands atomically, and receipts the whole result.
- Component import keeps the legacy `ComponentImportFinalizer` generated-command ports for `CapsuleDocumentEnterCoordinator`, while the workbench uses its new atomic port with a frozen pending review payload.
- Snapshot restore now receives `snapshotId` plus `componentId`, validates their relationship and tenant, reads the durable snapshot server-side, and atomically restores through generated commands. Current snapshots now preserve `sortOrder`, `wasteFactor`, and `prepNotes`; old snapshots fall back to line index and generated waste defaults.
- Snapshot capture remains best effort. Failure is visible as a nonblocking warning and does not stop the requested edit/restore attempt.
- `ComponentVersionHistoryPanel` forwards the durable snapshot ID rather than parsed client JSON.

## TDD evidence

RED was observed first for `tests/proofs/safe-culinary-operations.runtime.test.ts`: the new module was missing (and the initial dish fixture exposed its generated validator requirements). After implementing the seam, the real convex-test proof passed.

RED was also observed first for `tests/component-snapshot-capture.test.ts`: the behavior helper module did not exist. The implementation then made the nonblocking warning behavior pass.

The runtime proof executes actual generated commands through convex-test. It covers menu rollback and replay after source drift; component-import rollback, confirmed replay, and foreign-tenant ingredient rejection; snapshot/component mismatch; exact restored line metadata; and confirmed restore replay. These are runtime transaction/replay assertions, not source-string checks.

## Commands and outputs

- `CONVEX_DEPLOYMENT=befitting-armadillo-283 bunx convex codegen --typecheck disable` — passed; generated API binding registered the new authored module. This is the documented no-`.env.local` fallback and does not deploy application state.
- `bun run typecheck` — passed.
- `bunx vitest run tests/component-snapshot-capture.test.ts tests/proofs/safe-culinary-operations.runtime.test.ts tests/proofs/component-import-finalize.runtime.test.ts tests/pending-operation.test.ts tests/culinary-manifest-integration-guard.test.ts tests/event-manifest-integration-guard.test.ts tests/culinary-slice-contract.test.ts` — 7 files passed, 25 tests passed.
- After removing the temporary failure-injection argument, `bun run typecheck && bunx vitest run tests/proofs/safe-culinary-operations.runtime.test.ts tests/component-snapshot-capture.test.ts tests/culinary-manifest-integration-guard.test.ts` — passed, 3 files and 9 tests.
- `git diff --check` — passed.

## Concerns

- No schema or Manifest source was changed. No production writes or deployments were performed.
- Capture-warning proof is a focused helper behavior test, not a mounted UI test. The mounted page consumes that same helper and renders its warning state with `role="status"`.

## Recovery-output follow-up

Recovered receipts now propagate their actual saved menu/component/snapshot identity, line count, and `recovered` flag through the adapters. The UI does not navigate or claim the newly requested content was applied when an earlier receipt is recovered. Import retains the current review and links the actual saved component; all three surfaces keep the action available so the operator can deliberately submit again after the pending key is confirmed and cleared.

RED: `bunx vitest run tests/culinary-recovery.test.ts` failed because the recovery outcome adapter did not exist. GREEN and final focused verification: `bun run typecheck && bunx vitest run tests/culinary-recovery.test.ts tests/proofs/safe-culinary-operations.runtime.test.ts tests/component-snapshot-capture.test.ts tests/culinary-manifest-integration-guard.test.ts tests/proofs/component-import-finalize.runtime.test.ts tests/pending-operation.test.ts` — passed, 6 files and 19 tests. Runtime coverage includes changed menu name, changed reviewed import projection, and changed selected snapshot ID resolving to the earlier durable receipt; adapter coverage verifies that those results are presented as prior work rather than the new request.

## Review fix round 1

The pending-operation helper now preserves stable operation identity while submitting current operator input. This is safe only for the six audited consumers because each authenticates and uses a tenant-scoped whole-operation parent receipt: a committed request returns the receipt's actual prior result, while an uncommitted invalid request can execute corrected current input atomically under the same key. The source comment documents that precondition.

Import now checks the authenticated/role-authorized parent receipt before live ingredient validation, so a confirmed import remains recoverable after its matched ingredient is deleted. Tenant isolation remains ahead of receipt lookup through the tenant-scoped receipt key and kitchen authorization.

RED: `bunx vitest run tests/pending-operation.test.ts` produced 2 failed and 2 passed because in-memory and stored retries still returned old payloads. GREEN: `bunx vitest run tests/pending-operation.test.ts tests/proofs/safe-culinary-operations.runtime.test.ts` passed 2 files and 8 tests. The runtime proof now also covers restore failure after existing-line removal with full component/line rollback, corrected retry under the same key, legacy snapshot defaults (`sortOrder: 0`, `wasteFactor: 1`), corrected import after rollback, and confirmed import recovery after matched-ingredient deletion.

Final Task 3 plus Task 4 focused gate: `bun run typecheck && bunx vitest run tests/pending-operation.test.ts tests/event-draft-po-coordinator.test.ts tests/proofs/safe-template-materialization.runtime.test.ts tests/proofs/safe-culinary-operations.runtime.test.ts tests/culinary-recovery.test.ts tests/component-snapshot-capture.test.ts tests/culinary-manifest-integration-guard.test.ts tests/event-manifest-integration-guard.test.ts tests/logistics-manifest-integration-guard.test.ts tests/supply-manifest-integration-guard.test.ts` — passed, 10 files and 49 tests.
