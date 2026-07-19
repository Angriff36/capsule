# Prep-list purchase draft Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let procurement users generate a vendor-order draft that combines open prep-list demand across a selected date range.

**Architecture:** Existing `PurchaseNeed` rows remain the event-level provenance. A generated draft `VendorOrder` owns the selected date range; its lines are grouped by `ingredientId` and `unit`, and every contributing `PurchaseNeed` is explicitly linked to the line while remaining open. Submitting the order transitions linked needs to ordered through a Manifest reaction.

**Tech Stack:** Manifest DSL, Builder Convex projection, React, Vitest, convex-test.

## Global Constraints

- Edit domain behavior only in `src/**/*.manifest`; regenerate with `bun run manifest:regen`.
- Never hand-edit generated Convex/schema/client/wiring artifacts.
- The UI invokes generated command hooks only; no direct table writes or local lifecycle tables.
- A generated draft must not submit an order or mark a purchase need ordered.
- Source range is inclusive, based on `Event.startsAt`; last and upcoming week are UI shortcuts for the same date-range command flow.
- A buyer chooses an active vendor before draft generation.

---

### Task 1: Add governed draft-link semantics to the procurement source

**Files:**

- Modify: `src/procurement/order.manifest`
- Modify: `src/procurement/purchase-need.manifest`
- Test: `tests/proofs/prep-purchase-draft.runtime.test.ts`

**Interfaces:**

- Produces `VendorOrder` fields `sourceRangeStart: datetime?`, `sourceRangeEnd: datetime?`, and an `open` command accepting the two optional values.
- Produces `PurchaseNeed.assignToDraft(vendorOrderId: uuid, vendorOrderLineId: uuid)` and `PurchaseNeed.markDraftOrdered()`.
- Consumes `VendorOrderSubmitted` to fan out `markDraftOrdered` to linked open needs.

- [ ] **Step 1: Write the failing runtime proof**

Create a convex-test fixture with two approved events whose `startsAt` values are in range, the same active ingredient, two calculated/confirmed demands, two open purchase needs, and one active vendor. Execute the generated VendorOrder creation, one generated VendorOrderLine creation, and the new generated `PurchaseNeed.assignToDraft` command once for each need. Assert that both needs point to the same order and line, both remain `open`, and the line quantity is the combined total. Submit the order and assert that both needs become `ordered`.

- [ ] **Step 2: Run the proof to verify it fails**

Run: `bunx vitest run tests/proofs/prep-purchase-draft.runtime.test.ts`

Expected: FAIL because `PurchaseNeed_assignToDraft` and `PurchaseNeed_markDraftOrdered` do not exist.

- [ ] **Step 3: Implement the minimal Manifest behavior**

In `VendorOrder`, persist `sourceRangeStart` and `sourceRangeEnd` from `open`, require both-or-neither, require `sourceRangeStart <= sourceRangeEnd`, and include the values in `VendorOrderOpened`. In `PurchaseNeed`, add an `assignToDraft` command guarded by `status == "open"`, an active draft order, and matching tenant; persist `vendorOrderId` and `vendorOrderLineId` without changing status. Add `markDraftOrdered()` guarded by an open need with both links and a submitted linked order; transition to `ordered`. Replace the current `VendorOrderLineAdded` ordering reaction with `VendorOrderSubmitted fanOut PurchaseNeed where vendorOrderId = payload.vendorOrderId run markDraftOrdered`.

- [ ] **Step 4: Regenerate owned output**

Run: `bun run manifest:regen`

Expected: Builder applies a conflict-free ownership transaction that updates generated Convex, schema, wiring, and hook surfaces together with `.builder/ownership.json`.

- [ ] **Step 5: Run the proof to verify it passes**

Run: `bunx vitest run tests/proofs/prep-purchase-draft.runtime.test.ts`

Expected: PASS; linked needs remain open in a draft and become ordered only on submission.

### Task 2: Build the test-first purchasing-draft coordinator and form

**Files:**

- Create: `src/features/inventory/PrepPurchaseDraftCoordinator.ts`
- Test: `tests/prep-purchase-draft-coordinator.test.ts`
- Modify: `src/features/inventory/PurchasingPage.tsx`

**Interfaces:**

- Consumes open `PurchaseNeed`, `Event.startsAt`, active `Vendor`, and generated create/link hooks.
- Produces `PrepPurchaseDraftCoordinator.generate({ vendorId, rangeStart, rangeEnd })`, which creates one draft order, one line per `(ingredientId, unit)`, then assigns every contributing need to its group line.

- [ ] **Step 1: Write failing coordinator tests**

Define fake ports for `openOrder`, `addLine`, and `assignNeedToDraft`. Assert: two matching needs produce one line whose quantity is their sum; a need outside the inclusive range is excluded; identical ingredient IDs with distinct units produce separate lines; an empty selection throws `No open purchase needs fall within this date range`; and the coordinator passes the generated order and line IDs to every assignment.

- [ ] **Step 2: Run the coordinator tests to verify they fail**

Run: `bunx vitest run tests/prep-purchase-draft-coordinator.test.ts`

Expected: FAIL because the coordinator module does not exist.

- [ ] **Step 3: Implement the smallest coordinator**

Filter only non-deleted, `open` needs whose related event has a non-null `startsAt` within the inclusive range. Group by `${ingredientId}:${unit}`, sum `requiredQuantity`, create the range-tagged draft through `useCreateVendorOrder`, add one generated line per group with `unitCost: 0`, and link each group member with `usePurchaseNeedAssignToDraft`. Reject inverted ranges before issuing any command.

- [ ] **Step 4: Run coordinator tests to verify they pass**

Run: `bunx vitest run tests/prep-purchase-draft-coordinator.test.ts`

Expected: PASS.

- [ ] **Step 5: Wire the purchasing UI**

Add a `Generate prep-list draft` form to `PurchasingPage` with active-vendor selection, buttons that populate last-seven-days and upcoming-seven-days, date inputs for a custom inclusive range, disabled/busy behavior, and the existing `SupplyFailureBanner` for rejections. On success, close the form and link to the created order. Do not change the manual open-order workflow.

### Task 3: Expose provenance and enforce the existing guardrails

**Files:**

- Modify: `src/features/inventory/VendorOrderPage.tsx`
- Modify: `tests/supply-manifest-integration-guard.test.ts`
- Modify: `docs/systems/inventory.md`
- Modify: `docs/systems/procurement.md`

**Interfaces:**

- Consumes `PurchaseNeed.vendorOrderId` and `PurchaseNeed.vendorOrderLineId` as the source of draft-line provenance.
- Produces order-folio copy showing contributing event demands for each combined line.

- [ ] **Step 1: Write the failing source-contract assertion**

Extend the supply contract/guard test to require the new coordinator to use generated hooks and to reject direct `vendorOrders`, `vendorOrderLines`, or `purchaseNeeds` writes. Add a page contract assertion that the purchasing surface exposes `Generate prep-list draft` and the order folio renders all needs linked by `vendorOrderLineId`.

- [ ] **Step 2: Run the focused contracts to verify they fail**

Run: `bunx vitest run tests/supply-manifest-integration-guard.test.ts tests/supply-slice-contract.test.ts`

Expected: FAIL because the draft controls and provenance presentation are absent.

- [ ] **Step 3: Implement the presentation and docs**

In `VendorOrderPage`, replace the single `ingredientDemandId` lookup with all non-deleted purchase needs whose `vendorOrderLineId` equals the displayed line; render their event names and source quantities below the combined line. Update Inventory and Procurement system docs to describe the deliberate range-to-draft workflow and the fact that purchase needs become ordered only when the draft is submitted.

- [ ] **Step 4: Run focused verification**

Run: `bunx vitest run tests/prep-purchase-draft-coordinator.test.ts tests/proofs/prep-purchase-draft.runtime.test.ts tests/supply-manifest-integration-guard.test.ts tests/supply-slice-contract.test.ts`

Expected: PASS.

- [ ] **Step 5: Run repository verification**

Run: `bun run check`

Expected: PASS, or a recorded failure clearly attributable to pre-existing shared-worktree changes rather than this slice.
