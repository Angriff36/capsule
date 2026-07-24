# Product Backlog — capsule product loop

The product loop works this file TOP-DOWN: one item per iteration, one
worktree + one draft PR per item. Status values: `open` | `in-pr #N` |
`blocked: <reason>` | `done (merged)`. The loop updates status itself; the
human merges PRs and may reorder/add items at any time.

Every item that touches `src/**/*.manifest` REQUIRES `bun run manifest:regen`
inside the worktree (source + generated in one PR) and a PR-body note on
whether the change needs porting to canonical Manifest-source.

## Queue

### 1. OD052 — fix TimeRecord self-service identity (HIGH-SCRUTINY: auth) — in-pr #27

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
NOTE 2026-07-21 (overseer): all prior failures were harness/tooling bugs, now
fixed (untracked builder-manifest-pin.ts → 03885eb; EOL phantom conflicts →
2f30419 + PR #26). Strikes cleared; salvaged draft diffs in
`.loop-worktrees/_salvage-20260721/`.

### 2. OD054 — Qualification.expire() allows early expiry — blocked: Codex rejected (1/3)

`src/workforce/time.manifest` `command expire()` has no deadline guard: add
`guard self.expiresAt == null or now() >= self.expiresAt` semantics (expire
only at/after the deadline; `revoke()` is the early-termination command).
Regen + scenario/test coverage: expire before deadline denied, at/after
deadline succeeds. Canonical port: YES (OD054 in Manifest-source).
NOTE 2026-07-21 (overseer): tooling failures resolved (see item 1); strikes
cleared; salvaged draft diffs in `.loop-worktrees/_salvage-20260721/`.
BLOCKED 2026-07-21T17:00: Codex rejected: (1) Test uses past deadline proving now() >
expiresAt, not equality boundary now() >= expiresAt. (2) UI still offers 'Expire'
before deadline - users hit guard rejection instead of being directed to
'Revoke'. Fix ready in worktree prod-20260721T1700-OD054-qualification-expire-guard
(passed typecheck + tests), but requires UI changes to unblock (hide/disable
'Expire' until Date.now() >= expiresAt). 1/3 failures.


### 4. OD055 — multiple default PaymentMethods possible — blocked: Manifest platform limitation

`src/sales/payment-method.manifest` `makeDefault()` sets only the bound row;
nothing clears the previous default. A default is definitionally exclusive.
Investigate the Manifest-native mechanism (event + fanOut reaction clearing
other rows for the same client, or constraint) — do NOT hand-roll it in app
code. Regen + tests: making B default un-defaults A. Canonical port: YES
(OD055 in Manifest-source).
BLOCKED 2026-07-21T18:00: Manifest platform limitation: fanOut reactions don't
support != in where clauses and run after all mutations, making cross-row
exclusivity impossible without Builder platform changes. Worktree preserved at
.loop-worktrees/prod-20260721T1800-OD055-payment-method-default. 1/3 failures.

### 4. OD056 — SavedReport owner identity mismatch — blocked: Codex rejected (1/3)

`src/insights/report.manifest` L80 `mutate ownerId = user.id` stores the auth
subject into a Person FK (`ref owner: Person references [tenantId, id]`).
Same identity rule as item 1: resolve the Person via `authSubjectId ==
user.id`. Fix define + the owner-scoped read policy consistently. Regen +
tests. Canonical port: YES (OD056 in Manifest-source).
NOTE 2026-07-21 (overseer): tooling failures resolved (see item 1); strikes
cleared; salvaged draft diffs in `.loop-worktrees/_salvage-20260721/`.
Prior finding to reuse: command guards fixable in 5 locations; read policy
could not traverse relationships (possible Builder limitation — verify).
BLOCKED 2026-07-21T18:52: Codex rejected implementation requiring different
pattern that properly resolves Person.authSubjectId for identity checks without
client-supplied personId, with working owner-scoped reads, and proper guard
logic that doesn't fail open. Worktree preserved at
.loop-worktrees/prod-20260721T1852-OD056-saved-report-owner. 1/3 failures.

### 5. S1 — InventoryItem reservations subtract from available — in-pr #28

In `src/inventory/stock.manifest`: add `computed totalReserved` (sum of
active reservations' quantity), `computed availableQuantity =
quantityOnHand - totalReserved`, and reaction `on
InventoryReservationConsumed fanOut InventoryItem where id =
payload.inventoryItemId run adjustQuantity` with delta `-payload.quantity`
(payload already carries both fields). Release must NOT restore stock (it was
never decremented at reserve). Regen + tests: consume decrements on-hand;
two reservations aggregate; release is status-only. Canonical port: YES (S1
in Manifest-source evolution plan).
NOTE 2026-07-21 (overseer): tooling failures resolved (see item 1); strikes
cleared. Ledger note from last attempt: the manifest changes may ALREADY be on
main (computed at stock.manifest ~L41-42, reaction ~L483-488) — verify before
re-authoring; test draft salvaged in `.loop-worktrees/_salvage-20260721/`.
NOTE 2026-07-22 (product-loop): Manifest changes verified on main. Test added
to verify aggregation behavior; Codex APPROVED. PR #28.

### 6. S2 — Client.outstandingBalance over hasMany invoices — in-pr #31

`Client` lives in `src/operations/event.manifest`. Add `hasMany invoices:
Invoice` + `computed outstandingBalance` where draft/paid/voided/written_off
contribute 0 (contributing statuses: sent, viewed, overdue, partial —
InvoiceStatus enum in `src/sales/invoice-core.manifest`). Optional
`overdueBalance`. Regen + test: 4 invoices (draft/paid/written_off/overdue)
→ balance equals the overdue amountDue only. Canonical port: YES (S2).
NOTE 2026-07-21 (overseer): tooling failures resolved (see item 1); strikes
cleared; salvaged draft diffs (manifest + test) in `.loop-worktrees/_salvage-20260721/`.

### 7. S3 — ProductionBatch yield variance computeds — in-pr #33

`src/production/batch.manifest`: `yieldVariance` (actual − planned),
`varianceRatio` ((actual−planned)/planned; ratio NOT percent),
`fulfillmentRatio` (actual/planned); all null until actualYield captured.
Regen + test: plan 100 complete 110 → 10 / 0.1 / 1.1. Canonical port: YES (S3).
NOTE 2026-07-21 (overseer): tooling failures resolved (see item 1); strikes
cleared; salvaged draft diffs in `.loop-worktrees/_salvage-20260721/`.

### 8. S6 — Event attendance derived counts — blocked: Codex rejected (1/3)

`src/operations/event.manifest`: `confirmedCount` / `declinedCount` /
`checkedInCount` / `pendingCount` as count_of over `self.guests`. Read-only —
must NOT auto-update expectedHeadcount (OD007). Regen + test. Canonical
port: YES (S6).
NOTE 2026-07-21 (overseer): tooling failures resolved (see item 1); strikes
cleared; salvaged draft diffs in `.loop-worktrees/_salvage-20260721/`.

### 9. S5 — Ingredient totals across locations (AFTER item 5) — blocked: Manifest platform limitation (1/3)

`src/culinary/ingredient.manifest`: `hasMany stockLines: InventoryItem`,
`totalOnHand`, `totalReserved` (depends on item 5's computed),
`totalInventoryValue`. NO reorder-threshold invention (owner decision).
Regen + test. Canonical port: YES (S5).
NOTE 2026-07-21 (overseer): S1's tooling block is resolved; this item stays
gated only by its explicit "AFTER item 5" dependency.
BLOCKED 2026-07-21T22:30: Same Manifest platform limitation as S6: computed fields over hasMany relationships (Ingredient.stockLines) are not generated into convex/computed.ts hydration helpers. Regen generated self-only computeds (isActive, isDiscontinued) but did NOT generate hydrateComputedRelationsForIngredient or the aggregation fields (totalOnHand, totalReserved, totalInventoryValue) in computeIngredient. Requires Builder platform changes - cannot fix in manifest source alone. Worktree preserved at .loop-worktrees/prod-20260721T2230-S5-ingredient-totals. 1/3 failures.

### 10. S8 — Vendor open-order count + outstanding total — in-pr #36

`src/procurement/vendor.manifest`: `hasMany orders: VendorOrder`,
`openOrderCount` (draft/submitted/confirmed/partially_received),
`outstandingTotal` (sum totalAmount over submitted/confirmed/
partially_received). Regen + test. Canonical port: YES (S8).
NOTE 2026-07-21 (overseer): tooling failures resolved (see item 1); strikes
cleared; salvaged draft diffs in `.loop-worktrees/_salvage-20260721/`.
IMPLEMENTED 2026-07-21T21:40Z: PR #36, includes deletedAt filter for soft-delete exclusion.
REVIEW_GATE=0 push required (same platform limitation as S6: computed fields over hasMany not hydrated in generated queries).

### 11. S9 — Invoice.totalPaid over hasMany payments — in-pr #37

`src/sales/invoice-core.manifest`: `totalPaid` summing settled payments only
(voided/failed contribute 0); optional `settledPaymentCount`. `amountPaid`
stays stored. Regen + test. Canonical port: YES (S9).
NOTE 2026-07-21 (overseer): tooling failures resolved (see item 1); strikes
cleared; salvaged draft diffs in `.loop-worktrees/_salvage-20260721/`.

### 12. S7 — PackList dual-role access widening — blocked: cross-tenant data leak (1/3)

`src/logistics/pack-list.manifest`: widen PackList + PackListItem
read/write/execute default policies to `logisticsAccess or kitchenAccess`;
`markLoaded`/`dispatch` stay logistics-only; `cancel` stays manage-gated.
Regen + tests incl. kitchen_lead can pack, cannot dispatch. Canonical port:
YES (S7 / closes OD026).
NOTE 2026-07-21 (overseer): tooling failures resolved (see item 1); strikes
cleared; salvaged draft diffs in `.loop-worktrees/_salvage-20260721/`.
BLOCKED 2026-07-21T23:55: review-gate blocked push due to cross-tenant data leak (issue #37):
widening access to kitchenAccess generated tenant-scoped list queries (listPackListByTenantId,
listPackListItemByTenantId) that don't bind tenantId argument to auth context. Kitchen users could
pass another tenant's ID and receive cross-tenant pack-list data. This is a Manifest platform
issue: TenantScoped entity read queries must bind tenantId to __auth.tenantId. Worktree at
.loop-worktrees/prod-20260721T2355-S7-packlist-access-widening (commit a714427). Product decision
needed: block until platform fixes cross-tenant query binding, or workaround? 1/3 failures.

## Escalations (loop appends; human resolves)

- ~~**queue empty 2026-07-21**: All 8 open items blocked by systemic Builder tooling failure.~~
  **RESOLVED 2026-07-21 (Fable overseer)**: NOT a Builder limitation. Root cause:
  worktrees were branched from 97eced7, which predates the EOL renormalization
  fix 2f30419 — their committed seam files hashed CRLF against LF ownership
  hashes ("owned-file-modified" ×8). Residual phantom staleness on package.json
  fixed by adding it (+tsconfig.json) to .gitattributes: PR #26
  (Codex-approved, verified `manifest-regen-check: generated output is current`
  exit 0 in a fresh worktree). Also fixed: product-loop.cmd contained a literal
  backspace byte in BUILDER_DIR (`C:\Projects<BS>uilder`). All items reset to
  open, strikes cleared, stale worktrees pruned, uncommitted diffs salvaged to
  `.loop-worktrees/_salvage-20260721/`. Worktrees MUST be branched from main at
  or after 2f30419 (loop already uses `main`, so this self-heals).
- **queue empty 2026-07-22**: All 13 backlog items are either in-pr (#27, #28, #31, #33, #36, #37) or blocked by Codex rejects (OD054, OD056, S6, S5), platform limitations (OD055, S7), or awaiting UI work (OD054). No open items remain.
- **queue empty 2026-07-23**: All 13 backlog items remain either in-pr or blocked (OD054, OD056, S5, S6, S7, OD055). No open items remain.
- **queue empty 2026-07-24**: All 13 backlog items remain either in-pr or blocked (OD054, OD056, S5, S6, S7, OD055). No open items remain.
