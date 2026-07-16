# Findings & Decisions: Publish Kitchen and next slice

## Requirements

- Commit and push the completed Kitchen slice.
- Move immediately to the next live repository-defined slice.
- Preserve generated ownership and unrelated user work.

## Research Findings

- Kitchen now consumes generated query, mutation, creation, and lifecycle surfaces directly.
- The previous full gate passed every stage except local baseline decay because two preserved untracked root entries kept the count above the cap.
- Current branch is `main` with authorized upstream `origin/main`; HEAD and upstream already include `e5a825c fix(events): consume governed generated creation`.
- The earlier 207-file staged regeneration set was published independently before this turn; it is no longer staged locally.
- Current Kitchen publication work is unstaged. Two generated files (`convex/_generated/api.d.ts`, `src/generated/manifest-wiring-bindings.ts`) are locally modified and must be attributed before staging because Kitchen code must not hand-edit generated output.
- Memory still names `Kitchen - production/tasks` from an older Capsule-V2 handoff, but explicitly says next-slice state must be regenerated from current repository evidence.
- `convex/_generated/api.d.ts` removes a stale import of the no-longer-present authored Culinary seam. This is a relevant Convex-codegen cleanup and is required for a coherent Kitchen publication.
- `src/generated/manifest-wiring-bindings.ts` only changes unrelated non-empty string branding across other domains; exclude it from the Kitchen commit.
- HEAD already contains the generated governed `useCreateIngredient`/other creation hooks, so Kitchen authored code can rely on them without committing the unrelated bindings diff.
- The local root-cap failure includes preserved untracked root entries; `scripts/check-baseline-decay.ts` itself is unrelated modified work and must not be included in the Kitchen commit.
- HEAD has 32 tracked root entries, so a clean checkout remains safely below the configured cap; the local failure comes from preserved untracked/ignored workspace entries rather than the Kitchen publication.
- `docs/generation/manifest-builder.md` contains pre-existing projection-status edits. Only the Culinary integration hunk is staged; projection documentation remains unstaged and preserved.

## Technical Decisions

| Decision                                               | Rationale                                                      |
| ------------------------------------------------------ | -------------------------------------------------------------- |
| Keep Kitchen publication separate from next-slice work | Produces an attributable checkpoint before new implementation. |

## Issues Encountered

| Issue                                                                       | Resolution                                                                               |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Superpowers bootstrap path is unavailable                                   | Logged once and continued with the active repository/skill instructions.                 |
| Initial partial staging grouped a projection-status line with Culinary docs | Reset only that file's index entry, split the hunk, and staged the Culinary block alone. |

## Resources

- `docs/product/implementation-plan.md`
- `docs/generation/manifest-builder.md`
- `docs/systems/`

## Visual/Browser Findings

- None yet for the next slice.

# Next-slice findings

- The live roadmap selects Slice 3, Demand, stock, and purchasing, after Culinary planning.
- Inventory owns `StorageLocation`, `InventoryItem`, `InventoryReservation`, `IngredientDemand`, and `WasteRecord`; Procurement owns `Vendor`, `VendorOrder`, `VendorOrderLine`, and `PurchaseNeed`.
- The intended thin loop is demand provenance into stock/reservation visibility, purchase need, vendor order, and receipt progress. The existing system docs explicitly prohibit claiming demand-to-purchase or receipt-to-stock automation until reactions are verified.
- Generated Convex command exports already exist for demand, stock, location, purchase need, vendor order, and line receipt lifecycles. Canonical sources are the six manifests under `C:\projects\Manifest-source\src\inventory` and `...\procurement`.
- The local Inventory and Procurement system pages are untracked user-authored artifacts. They are relevant owning docs and may be updated carefully, while unrelated untracked system/design pages remain untouched.
- Canonical lifecycle facts confirmed: demand moves pending -> calculated -> confirmed -> fulfilled/superseded; vendor orders move draft -> submitted -> confirmed -> partial/received; order lines move pending -> added -> receiving/complete. Receipt commands carry demand and location provenance, but the owning docs still mark receipt-to-stock automation as unverified.
- Generated client bindings are concentrated in `src/generated/manifest-wiring-bindings.ts`, while authored Convex callers must import the API through `src/lib/api.ts`.
- The authored UI precedent is direct consumption of generated React hooks from `src/lib/manifest-convex-react`, with lifecycle availability derived from generated `*Lifecycle` arrays in a small authored policy class.
- Culinary’s event handoff deliberately lets generated commands reject illegal stages and exposes command failures; Slice 3 should follow the same busy/failure/loading/empty conventions instead of reproducing guards locally.
- Generated creation hooks exist for IngredientDemand, InventoryItem, InventoryReservation, StorageLocation, Vendor, VendorOrder, and VendorOrderLine. `PurchaseNeed.create` is exposed as `usePurchaseNeedCreate`; its exact allocation semantics must be checked before using it as authored creation.
- All routine domain writes needed for the thin loop are already generated hooks, so no authored Convex seam is justified unless PurchaseNeed creation proves to require an allocator.
- The generated schemas expose every ledger/order field needed for an operator-readable working view, including demand provenance, on-hand/par/reorder, reservation status, order totals, received quantity, and discrepancies.
- App routing is centralized in `src/app/App.tsx`; Kitchen replaced a planned route family with explicit authored routes. Slice 3 should similarly replace only Inventory/Procurement planned routes.
- `PurchaseNeed_create` is itself a generated allocating mutation: it inserts the governed document, applies role/quantity guards, emits `PurchaseNeedOpened`, and requires no authored allocation seam.
- The existing focused-proof shape is repository contract tests plus an executable integration guard and lifecycle policy unit tests. Navigation currently expects Inventory to remain planned and will need a deliberately updated assertion.
- Generated lifecycle metadata covers demand confirmation/fulfillment/supersede, reservation reserve/release/consume, storage activation, vendor lifecycle, purchase-need ordering/fulfillment/cancellation, and order submission/confirmation/receipt-state/cancellation.
- `VendorOrderLine.recordReceipt` has generated capability/input/invalidation metadata but no proven lifecycle array because its next state is quantity-dependent. The UI must not recreate that transition table; it can expose receipt entry in the order folio and let the generated command enforce guards.
- The design contract explicitly assigns Slice 3 the working-ledger and queue/order-folio archetypes, with truthful degraded-state copy for automation, search, and numeric precision.
- The implemented thin route family is `/inventory/demand`, `/inventory/stock`, `/inventory/purchasing`, and `/inventory/orders/:id`, exposed through the existing Inventory shell area.
- Generated hooks cover every authored write in the implementation. The only cross-entity continuation is an explicit second operator command to mark a PurchaseNeed ordered after a demand-linked order line exists; no reaction is simulated.
- Focused compile and proof run is green: TypeScript plus 14 tests across route/hooks contracts, guardrail behavior, lifecycle policy, and navigation.
- Owning Inventory/Procurement docs and Manifest integration notes now enumerate routes, roles, commands, lifecycle behavior, failures, limits, and proof paths; the system map and live delivery status are aligned.
- The local Vite server started successfully on port 7811, but no in-app browser backend is attached (`agent.browsers.list()` returned empty), so desktop/mobile visual verification cannot be completed in this session.
