# Task 5 report

## Implementation

- Added `BulkRunFailure` and `runBulkItems`, preserving the original command cause plus confirmed completed/failed/remaining counts while `useBulkRun` still clears busy progress in `finally`.
- Updated command failure classification to unwrap bulk causes, retain denial/guard/conflict categorization, title and action, and append truthful counts.
- Reused the shared bulk runner for prep assignment, Event Prep sync-all, Kitchen Dashboard prep sync, and dashboard bulk task verbs.
- Added `convex/lib/operationalTransactions.ts`:
  - `issueEventStock` authenticates first, validates tenant/event/ingredient relationships server-side, invokes generated consume/confirm/fulfill commands in one transaction, and rereads the actual demand version after confirmation.
  - `reorderEventTimeline` authenticates first, validates the complete live event row set and tenant ownership, then invokes generated adjust commands atomically with caller-supplied versions.
- Wired Event Inventory and Event Timeline through thin authored hooks in `src/lib/operational-transactions.ts`; no generated business command or policy was duplicated.
- Event menu template application now reconciles already-persisted dishes, reports partial line failures through the shared bulk failure, waits until reactive EventDish rows contain the saved lines, and runs stock sync as an explicit retryable second phase. A stock-sync failure reports that menu lines were already saved.
- Removed the UI's split stock consume/confirm/fulfill coordinator path. The legacy coordinator remains only for older HTTP lifecycle proof coverage and is no longer consumed by the shipped Event Inventory UI.
- Refreshed `convex/_generated/api.d.ts` using the documented no-`.env.local` dry-codegen fallback.

## RED

`bunx vitest run tests/bulk-run-failure.test.ts`

- Failed: `TypeError: (0 , runBulkItems) is not a function`.

`bunx vitest run tests/proofs/operational-transactions.runtime.test.ts`

- After correcting the fixture to use typed Convex IDs, failed: `Could not find module for: "lib/operationalTransactions"`.

## GREEN

`bunx vitest run tests/bulk-run-failure.test.ts tests/proofs/operational-transactions.runtime.test.ts tests/event-stock-issue-coordinator.test.ts tests/event-prep-coordinator.test.ts`

- 4 files passed, 9 tests passed. The Convex proof verifies transaction rollback after a stale later timeline row.

`bun run typecheck`

- Passed (`tsc --noEmit`).

`bun run check:event-manifest && bun run check:culinary-manifest && bun run check:supply-manifest && bun run check:production-manifest`

- All four integration guards passed.

Follow-up stock/menu recovery RED:

`bunx vitest run tests/proofs/operational-transactions.runtime.test.ts`

- Failed two new stock cases with `Guard 0 failed`, proving the fixtures had not established generated `InventoryItem.adjustQuantity` eligibility (`stockedAt`). After fixing that fixture, the success case exercised the generated confirm reaction's real version changes rather than a `+2` guess.

`bunx vitest run tests/event-menu-stock-sync-lifecycle.test.ts`

- Failed because `TemplateStockSyncLifecycle` did not exist.

Follow-up GREEN:

`bunx vitest run tests/proofs/operational-transactions.runtime.test.ts tests/event-menu-stock-sync-lifecycle.test.ts && bun run typecheck`

- 2 files passed, 5 tests passed; `tsc --noEmit` passed. Stock coverage now proves post-consume rollback of reservation and inventory, successful confirm/fulfill using the reread version, parent-receipt recovery after an ambiguous lost acknowledgement without a second consumption, and tenant/event/ingredient rejection. The menu lifecycle proves readiness, exact saved-row observation, reactive demand revision, retained failed phase, and retry completion.

`bunx vitest run tests/bulk-run-failure.test.ts tests/proofs/operational-transactions.runtime.test.ts tests/event-menu-stock-sync-lifecycle.test.ts && bun run typecheck`

- 3 files passed, 7 tests passed; `tsc --noEmit` passed. The shared failure now carries the actual completed and unfinished row objects, and the kitchen assignment proof confirms a successful prefix is removed from the retry set while the failed row and remaining suffix stay selected.

Codegen fallback:

`CONVEX_DEPLOYMENT=befitting-armadillo-283 bunx convex codegen --typecheck disable`

- Generated server/API bindings successfully; no production deployment was performed.

## Test boundaries and concerns

- The real Convex regression proves atomic rollback/persistence for timeline reorder and stock issuance. The stock parent receipt is written in the same transaction as all generated command effects and reports the actual prior output on retry.
- Template saved-line/stock-phase behavior is tested through its extracted production lifecycle controller rather than a mounted React tree. The component wires that controller to exact returned EventDish ids, reactive demand revision, and catalog readiness.
- The legacy `EventStockIssueCoordinator` remains for an existing HTTP command lifecycle proof but is not imported by production UI; removing or rewriting that proof helper can be handled separately without changing shipped behavior.

## Review fix round 1

RED:

`bunx vitest run tests/proofs/operational-transactions.runtime.test.ts`

- 1 of 5 failed: `materializeEventMenuTemplate` was not exported. This was the lost-ack server replay case.

`bunx vitest run tests/event-menu-stock-sync-lifecycle.test.ts`

- 2 of 2 failed: a changed subscription returned the same pending operation while the first sync was in flight, and `status()` did not exist for explicit failed/waiting UI state.

GREEN:

`bunx vitest run tests/event-menu-stock-sync-lifecycle.test.ts tests/proofs/operational-transactions.runtime.test.ts && bun run typecheck`

- 2 files passed, 7 tests passed; `tsc --noEmit` passed.
- Runtime coverage proves a parent-receipted menu materialization returns the actual two saved rows when a retry supplies changed current input, without duplicate EventDish rows (lost acknowledgement plus delayed client subscription boundary).
- Lifecycle coverage changes the observed row/demand subscription while a deferred stock sync is in flight and proves it does not launch twice. A stale completion after another `begin` cannot clear the newer waiting operation.
- Event menu feedback now announces saved/reconciled counts and waiting/syncing/failed stock phases. Failure names stock synchronization as unfinished and offers `Retry stock sync only`; it does not emit misleading bulk `0 failed / 0 remaining` counts.
- Stock receipt replay now checks the generated permission intersection before reading the receipt; the runtime test denies same-tenant replay after the role changes to driver.

## Review fix round 2

RED:

`bunx vitest run tests/event-menu-stock-sync-lifecycle.test.ts tests/proofs/operational-transactions.runtime.test.ts`

- Lifecycle passed, while the runtime suite failed to load the new recovered-output adapter: `Cannot find module '../../src/features/events/reconcileRecoveredMenuRequest'`. This joined the actual parent-receipt replay output to the current A+C request instead of testing two disconnected happy paths.

GREEN:

`bunx vitest run tests/event-menu-stock-sync-lifecycle.test.ts tests/proofs/operational-transactions.runtime.test.ts && bun run typecheck`

- 2 files passed, 7 tests passed; `tsc --noEmit` passed after correcting typed test IDs.
- The runtime integration commits template A, replays the same parent operation with current request A+C, verifies the receipt truthfully returns prior A, uses the production adapter to retain C as outstanding, and verifies only one EventDish exists before the deliberate remaining-lines action.
- Server output now includes the actual applied dish identities. UI distinguishes recovered prior counts from current outstanding lines and keeps an explicit `Apply remaining N` action visible even after prior stock synchronization completes.
- Stock lifecycle readiness now depends on the authoritative completed server operation, exact saved EventDish IDs, and every observed demand version being at least the version returned by the server transaction. The receipt therefore carries the actual prior operation's post-materialization demand versions; a replay does not invent a change requirement from the current request and cannot silently continue from a stale demand snapshot.

Authoritative readiness follow-up RED:

`bunx vitest run tests/event-menu-stock-sync-lifecycle.test.ts`

- 1 of 2 failed because the lifecycle launched with observed demand version `2` while the recovered server operation required version `3`, proving exact EventDish IDs alone did not establish demand-catalog readiness.

Authoritative readiness follow-up GREEN:

`bunx vitest run tests/event-menu-stock-sync-lifecycle.test.ts tests/proofs/operational-transactions.runtime.test.ts`

- 2 files passed, 7 tests passed. The lifecycle blocks below the returned demand versions and launches when the reactive catalog equals or exceeds them. The Convex runtime test joins an actual recovered receipt's saved EventDish IDs and demand-version map to the production lifecycle, with demand already reflecting the commit.

`bun run typecheck && bun run check:event-manifest && bun run check:culinary-manifest && bun run check:supply-manifest`

- `tsc --noEmit` passed and all three relevant integration guards passed.

Convex's local client implementation supplies the complementary read-own-writes ordering guarantee: `node_modules/convex/src/browser/sync/request_manager.ts:156-185` delays a successful mutation promise until a transition at or after its response timestamp, and `node_modules/convex/src/react/client.ts:758-777` applies query transitions synchronously in order. The explicit version comparison still makes the lifecycle barrier concrete and testable rather than relying on an arbitrary revision change or a stale pre-await closure.
