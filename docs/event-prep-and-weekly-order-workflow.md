---
source_of_truth: true
created: 2026-07-19
updated: 2026-07-21
# Correction 2026-07-21: Capsule pins Manifest 3.6.41; event→weekly purchasing is Manifest-owned — see § Implementation boundary.
# Correction 2026-07-21: Visual SoT for Dish vs Component vs DishTask is work/list*.jpg and work/components/*.jpg — see § What the kitchen actually needs.
# Correction 2026-07-21: Event.approve also opens PackList + plans ProductionBatch; Delivery on PackListPacked — see § Demand and the weekly order form.
---

# Event prep and weekly inventory order workflow

## What the kitchen actually needs

**Visual source of truth:** photos in `work/` (not agent invention).

- `work/list3.jpg`, `work/list4.jpg`, `work/list5.jpg` — production sheets.
  The bold ALL-CAPS menu lines are **Dishes**. Under each dish are prep /
  portion lines with quantities (those are **DishTask** templates). Lines like
  “MAKE HUCKLEBERRY BBQ SAUCE” or “MAKE HONEY CINNAMON BUTTER (COMPONENT)” point
  at a separate **Component**, they are not the dish itself.
- `work/components/*.jpg` — component formula sheets (pesto, brine, sauce,
  concentrate). Those are **Components** with ingredients + method.

A Dish is a reusable finished offering. It has reusable DishTask templates such as:

- Chop romaine
- Portion croutons
- Portion Caesar dressing
- Make a component when that component is not already available

A Component is a reusable formula. It has ComponentIngredients and ordered ComponentSteps for making a component. A Component is not rewritten when an Event needs a different amount. Never name a Component the same as its Dish and pretend that is “full ingredients.”

A Menu only groups Dishes. It does not own prep work.

## Event generation

When a Dish is added to an Event:

1. Capsule creates an EventDish for the selected Dish.
2. Active DishTask templates are copied into editable PrepTask rows (host prep sync).
3. Manifest expands DishComponent → ComponentIngredient into `EventIngredientContribution` rows and aggregates `IngredientDemand` (`calculated`, `purchaseEligibleEventId = eventId`).
4. The Event quantity (servings / headcount) drives those quantities.
5. Event-specific instructions, dietary requirements, and one-off tasks are added to the Event work list.

Runtime prep work is always owned by EventDish. A template row has a Dish reference but no EventDish reference; an instantiated event row must have EventDish as its parent.

## Demand and the weekly order form

Users perform only:

1. Add dishes to an event.
2. Set or change headcount.
3. Approve the event.
4. Review and submit the automatically maintained weekly order draft.

They do **not** confirm demand, create PurchaseNeeds, generate a prep-list draft, or manually link needs to lines.

When the Event is **approved**:

1. Compat fanOut may repair `purchaseEligibleEventId` on legacy calculated rows
2. Manifest fanOut foreach-creates `PurchaseNeed` for eligible demand
3. `WeeklyPurchasingConfig.routeNeed` uses each ingredient's first preferred vendor, falling back to the tenant default, and ensures the matching weekly `VendorOrder` DRAFT
4. Lines consolidate identical ingredients; on-hand stock reduces the ordered quantity once across the week
5. Needs stay `open` until the buyer submits the draft — approval never auto-submits
6. Manifest also `PackList.open` (match `eventId` + `activeEventId`, else create) and fanOut `ProductionBatch.plan` per `EventDishComponentSeed` (MCP-proved 2026-07-21 on local Convex after #8/#10/#11/#14)
7. Manifest `Invoice.issue` (match `eventId`, else create) from `quotedPrice` / `clientId` on the expanded `EventApproved` payload — remains draft until finance sends
8. `Delivery.schedule` is **not** on approve — it runs on `PackListPacked` after pack
9. After the event is completed and **closed out**, Manifest seeds `EventCloseout.capture`
   (match `eventId`, else create): budget/headcount from the event, actuals zeroed
   for finance to re-capture before finalize
10. If the event has an **owner** (`assignedToId` on plan or Assign owner), Manifest
    seeds `EventAssignment.assign` as role `event_lead` (fanOut `Person` — no-op when
    owner is unset; also on `EventOwnerAssigned`)

Headcount or dish changes revise contributions and reconcile the same draft (idempotent; no duplicate quantities).

When receiving an order line, the buyer enters the actual unit price with the
receipt quantity. `VendorOrderLine.recordReceipt` retains that price on the line
and creates one immutable `IngredientPriceObservation` for the ingredient,
vendor, order, and partial receipt. Ingredient price trends and Component costing
use the newest confirmed observation; Ingredients without a receipt observation
continue using their catalog cost. Physical stock receipt remains a separate
generated Inventory command.

```
EventDish + headcount
  -> EventIngredientContribution (BOM)
  -> IngredientDemand (calculated)
  -> (on approve) PurchaseNeed
  -> Weekly VendorOrder DRAFT + consolidated VendorOrderLine
  -> (on approve) PackList draft + ProductionBatch plan(s) + Invoice (quotedPrice)
  -> (on PackList.markPacked) Delivery schedule
  -> (on Event.closeOut) EventCloseout draft (budget seed, zero actuals)
  -> (on approve / assignOwner, if owner set) EventAssignment event_lead
```

## Implementation boundary

> **Correction (2026-07-21):** Manifest owns recalculation, BOM expansion, shortage consolidation, weekly draft ensure/reconcile (`src/procurement/event-purchasing.manifest` + related demand/order/purchase-need commands). Pin `@angriff36/manifest` **`3.6.41`** (exact — requires `sum(Entity where … of field)`, single-target and fanOut `match … else create`, Convex else-create allocate, and fanOut soft-delete source exclusion so headcount cascades skip retired EventDish rows). Host `PrepPurchaseDraftCoordinator` and `EventComponentDemandReconciler` / `EventMenuComponentDemandSync` are removed. UI “Generate prep-list draft” / “Create need” / demand-confirm theater controls are removed. PrepTask template sync may still use `EventPrepCoordinator` (with `skipDemand`); component→demand→weekly draft is Manifest-owned.
>
> Proof: `tests/proofs/event-weekly-purchasing.runtime.test.ts`.

- Rank preferred vendors on Ingredient detail when an ingredient should route to a specific supplier. The first vendor is the automatic default; the saved order remains editable.
- Configure one `WeeklyPurchasingConfig` per tenant as the fallback before approve routes needs without an ingredient preference.
  Manifest declares `unique [tenantId]`, but `WeeklyPurchasingConfig_createViaConfigure`
  currently inserts without enforcing that uniqueness — repeated configure calls can leave
  multiple live config rows and ambiguous `routeNeed` vendors. Do not soft-ignore configure
  failures; treat multi-config as a data defect until createVia guards/unique are fixed.
- `purchasingWeekStart` is denormalized from Event plan/reschedule (`startsAt`) onto EventDish / contribution / demand / need.
- demand.manifest remains authoritative for IngredientDemand lifecycle commands.
