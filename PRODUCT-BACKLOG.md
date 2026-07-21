# Product Backlog — capsule product loop

The product loop works this file TOP-DOWN: one item per iteration, one
worktree + one draft PR per item. Status values: `open` | `in-pr #N` |
`blocked: <reason>` | `done (merged)`. The loop updates status itself; the
human merges PRs and may reorder/add items at any time.

Every item that touches `src/**/*.manifest` REQUIRES `bun run manifest:regen`
inside the worktree (source + generated in one PR) and a PR-body note on
whether the change needs porting to canonical Manifest-source.

## Queue

### 1. OD052 — fix TimeRecord self-service identity (HIGH-SCRUTINY: auth) — open

`src/workforce/time.manifest` L67 + L97 guard `personId == user.id`, but
`user.id` is the auth subject and Person's auth link is `Person.authSubjectId`
(confirmed product rule 2026-07-19: self-service must identify the Person via
`Person.authSubjectId == user.id`, NEVER compare personId to user.id).
Workers currently cannot clock themselves in/out. Fix the guard idiom (may
need a relationship traversal or projection-boundary resolution — investigate
what the Manifest runtime supports, e.g. `self.person.authSubjectId ==
user.id`), regen, and add/adjust tests proving a worker can clock in/out on
their own record and cannot on someone else's. Canonical port: YES
(Manifest-source has the same defect, recorded as OD052 there).
ESCALATED: 3 attempts blocked by worktree regen tooling failure (STATE.md).
Fix is ready in .loop-worktrees/prod-20260721T0426-OD052-timerecord-identity/src/workforce/time.manifest
plus tests. Human must run regen to complete.

### 2. OD054 — Qualification.expire() allows early expiry — open

`src/workforce/time.manifest` `command expire()` has no deadline guard: add
`guard self.expiresAt == null or now() >= self.expiresAt` semantics (expire
only at/after the deadline; `revoke()` is the early-termination command).
Regen + scenario/test coverage: expire before deadline denied, at/after
deadline succeeds. Canonical port: YES (OD054 in Manifest-source).
ESCALATED: 3 attempts blocked by proven tooling failure (same as OD052/OD055/OD056).
Fix is ready in .loop-worktrees/prod-20260721T0500-OD054-qualification-expire/src/workforce/time.manifest
plus tests. Human must run regen to complete.


### 4. OD055 — multiple default PaymentMethods possible — blocked: tooling failure (2026-07-21, 2nd attempt)

`src/sales/payment-method.manifest` `makeDefault()` sets only the bound row;
nothing clears the previous default. A default is definitionally exclusive.
Investigate the Manifest-native mechanism (event + fanOut reaction clearing
other rows for the same client, or constraint) — do NOT hand-roll it in app
code. Regen + tests: making B default un-defaults A. Canonical port: YES
(OD055 in Manifest-source).

### 4. OD056 — SavedReport owner identity mismatch — blocked: tooling failure (2026-07-21)

`src/insights/report.manifest` L80 `mutate ownerId = user.id` stores the auth
subject into a Person FK (`ref owner: Person references [tenantId, id]`).
Same identity rule as item 1: resolve the Person via `authSubjectId ==
user.id`. Fix define + the owner-scoped read policy consistently. Regen +
tests. Canonical port: YES (OD056 in Manifest-source).
ESCALATED: 1 attempt blocked by proven tooling failure (same as OD052/OD054/OD055).
Command guards fixed (5 locations), read policy could not traverse relationships (Builder limitation).
Fix ready in .loop-worktrees/prod-20260721T0434-OD056-savedreport-identity/src/insights/report.manifest
plus tests. Human must run regen to complete.

### 5. S1 — InventoryItem reservations subtract from available — blocked: tooling failure (2026-07-21, 2nd attempt)

In `src/inventory/stock.manifest`: add `computed totalReserved` (sum of
active reservations' quantity), `computed availableQuantity =
quantityOnHand - totalReserved`, and reaction `on
InventoryReservationConsumed fanOut InventoryItem where id =
payload.inventoryItemId run adjustQuantity` with delta `-payload.quantity`
(payload already carries both fields). Release must NOT restore stock (it was
never decremented at reserve). Regen + tests: consume decrements on-hand;
two reservations aggregate; release is status-only. Canonical port: YES (S1
in Manifest-source evolution plan).
ESCALATED: 2 attempts blocked by proven tooling failure (same as OD052/OD054/OD055/OD056/S2).
Fix is ready in .loop-worktrees/prod-20260721T1530-S1-inventory-reservations/src/inventory/stock.manifest
plus tests. Human must run regen to complete. 2/3 failures - one more attempt will escalate.

### 6. S2 — Client.outstandingBalance over hasMany invoices — open

`Client` lives in `src/operations/event.manifest`. Add `hasMany invoices:
Invoice` + `computed outstandingBalance` where draft/paid/voided/written_off
contribute 0 (contributing statuses: sent, viewed, overdue, partial —
InvoiceStatus enum in `src/sales/invoice-core.manifest`). Optional
`overdueBalance`. Regen + test: 4 invoices (draft/paid/written_off/overdue)
→ balance equals the overdue amountDue only. Canonical port: YES (S2).
NOTE: 1 tooling failure (2026-07-21). Test ready in .loop-worktrees/prod-20260721T1510-S2-client-balance/tests/proofs/client-outstanding-balance.runtime.test.ts.
Manifest changes ready (hasMany invoices + computed outstandingBalance/overdueBalance at lines 83-85 in event.manifest).

### 7. S3 — ProductionBatch yield variance computeds — blocked: tooling failure (2026-07-21)

`src/production/batch.manifest`: `yieldVariance` (actual − planned),
`varianceRatio` ((actual−planned)/planned; ratio NOT percent),
`fulfillmentRatio` (actual/planned); all null until actualYield captured.
Regen + test: plan 100 complete 110 → 10 / 0.1 / 1.1. Canonical port: YES (S3).
ESCALATED: 1 attempt blocked by proven tooling failure (same as OD052/OD054/OD055/OD056/S1/S2).
Fix is ready in .loop-worktrees/prod-20260721T1535-S3-yield-variance/src/production/batch.manifest
plus tests. Human must run regen to complete. 1/3 failures - not escalated yet.

### 8. S6 — Event attendance derived counts — blocked: tooling failure (2026-07-21)

`src/operations/event.manifest`: `confirmedCount` / `declinedCount` /
`checkedInCount` / `pendingCount` as count_of over `self.guests`. Read-only —
must NOT auto-update expectedHeadcount (OD007). Regen + test. Canonical
port: YES (S6).
ESCALATED: 1 attempt blocked by proven tooling failure (same as OD052/OD054/OD055/OD056/S1/S2/S3).
Fix is ready in .loop-worktrees/prod-20260721T1540-S6-attendance-counts/src/operations/event.manifest
plus tests. Human must run regen to complete. 1/3 failures - not escalated yet.

### 9. S5 — Ingredient totals across locations (AFTER item 5) — blocked: dependency on item 5

`src/culinary/ingredient.manifest`: `hasMany stockLines: InventoryItem`,
`totalOnHand`, `totalReserved` (depends on item 5's computed),
`totalInventoryValue`. NO reorder-threshold invention (owner decision).
Regen + test. Canonical port: YES (S5).
BLOCKED: Item 5 (S1) is blocked on tooling failure; S5's totalReserved computed
depends on S1's totalReserved field. Cannot complete until S1 lands.

### 10. S8 — Vendor open-order count + outstanding total — blocked: tooling failure (2026-07-21)

`src/procurement/vendor.manifest`: `hasMany orders: VendorOrder`,
`openOrderCount` (draft/submitted/confirmed/partially_received),
`outstandingTotal` (sum totalAmount over submitted/confirmed/
partially_received). Regen + test. Canonical port: YES (S8).
ESCALATED: 1 attempt blocked by proven tooling failure (same as OD052/OD054/OD055/OD056/S1/S2/S3/S6).
Fix is ready in .loop-worktrees/prod-20260721T1545-S8-vendor-totals/src/procurement/vendor.manifest
plus tests. Human must run regen to complete. 1/3 failures - not escalated yet.

### 11. S9 — Invoice.totalPaid over hasMany payments — blocked: tooling failure (2026-07-21)

`src/sales/invoice-core.manifest`: `totalPaid` summing settled payments only
(voided/failed contribute 0); optional `settledPaymentCount`. `amountPaid`
stays stored. Regen + test. Canonical port: YES (S9).
ESCALATED: 1 attempt blocked by proven tooling failure (same as OD052/OD054/OD055/OD056/S1/S2/S3/S6/S8).
Fix is ready in .loop-worktrees/prod-20260721T1550-S9-invoice-total-paid/src/sales/invoice-core.manifest
plus tests. Human must run regen to complete. 1/3 failures - not escalated yet.

### 12. S7 — PackList dual-role access widening — blocked: tooling failure (2026-07-21)

`src/logistics/pack-list.manifest`: widen PackList + PackListItem
read/write/execute default policies to `logisticsAccess or kitchenAccess`;
`markLoaded`/`dispatch` stay logistics-only; `cancel` stays manage-gated.
Regen + tests incl. kitchen_lead can pack, cannot dispatch. Canonical port:
YES (S7 / closes OD026).
ESCALATED: 1 attempt blocked by proven tooling failure (same as OD052/OD054/OD055/OD056/S1/S2/S3/S6/S8/S9).
Fix is ready in .loop-worktrees/prod-20260721T1555-S7-packlist-access/src/logistics/pack-list.manifest
plus tests. Human must run regen to complete. 1/3 failures - not escalated yet.

## Escalations (loop appends; human resolves)

- **queue empty 2026-07-21**: All 8 open items (S1,S2,S3,S6,S5,S8,S9,S7) blocked by systemic Builder tooling failure - manifest:regen with BUILDER_DIR set succeeds but reports conflicts on Builder-owned files (convex/*.ts author seam edits). Exit code 2 (conflicts). This is a Builder limitation: author seams in convex/*.ts are detected as "unrecognized modifications". Each item has manifest source + tests ready in worktrees; human must run regen in each worktree to complete. 1 strike each (S1 has 2 strikes). S5 blocked by dependency on S1. No actionable items remain until tooling issue resolved or manual regen completed. Worktrees: prod-20260721T1500-S1, prod-20260721T1510-S2, prod-20260721T1530-S1-2nd, prod-20260721T1535-S3, prod-20260721T1540-S6, prod-20260721T1545-S8, prod-20260721T1550-S9, prod-20260721T1555-S7.
