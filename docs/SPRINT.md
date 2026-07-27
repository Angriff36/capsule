# Capsule — Ship Sprint (3 days)

**Created:** 2026-07-26
**Ship target:** 2026-07-29
**Scope:** one catering company (single tenant) running one real event end to end, in production.

This document is the sprint plan, the event-lifecycle workflow, and the QA
script. Section 2 is the walkthrough — run it top to bottom and every step is
both the product flow and its test.

---

## 1. Ship gate — what must be true on 2026-07-29

| # | Gate | State on 2026-07-26 | Owner |
|---|------|---------------------|-------|
| G1 | A tenant exists with reference data (org, service styles, occasions, roles) | ❌ **BLOCKED** — deployment is empty and `bun run seed` is a no-op ([#113](https://github.com/Angriff36/capsule/issues/113)) | Ryan + agent |
| G2 | The public quote form accepts a real submission | ❌ blocked by G1 (throws "Unable to process quote" with no active org) | follows G1 |
| G3 | An event runs quote → closed_out through the UI | ⚠️ unverified in-browser (blocked by G1 + no browser auth); backend proven by 50 runtime tests | agent |
| G4 | Invoices can be paid, money reaching the tenant | ⚠️ code complete ([#112](https://github.com/Angriff36/capsule/issues/112) closed) — needs a Stripe account + `STRIPE_SECRET_KEY` | Ryan |
| G5 | Payments auto-reconcile | ❌ **won't make it** — [#52](https://github.com/Angriff36/capsule/issues/52) is a Manifest-repo fix; ship with manual "Sync payments" | accepted |
| G6 | Invoice email actually sends | ❌ needs `RESEND_API_KEY` + verified sender | Ryan |
| G7 | `bun run check` green | ✅ green (exit 0) | — |

**The critical path is G1.** Nothing else can be verified end to end until a
tenant with reference data exists. Everything below assumes G1 lands on Day 1.

---

## 2. The event lifecycle — full workflow and QA script

Ten stages. Each is: what the user does → where in the app → what must be true
after. Run in order against a single test event named **"QA Wedding — Sept 15"**.

The `stage` values are the real ones from `src/operations/event.manifest:656-665`:

```
quote → planning → pending_approval → approved → sales_lock
      → executing → final → completed → closed_out
                      (cancelled is reachable from every stage but closed_out)
```

### Stage 0 — Inbound inquiry (the prospect)

| | |
|---|---|
| **Actor** | Anonymous prospect, not signed in |
| **Route** | `/quote` (public, no auth) |
| **Do** | Fill name, email, date, guest count, service style, occasion, venue, menu prefs. Tick consent. Submit. |
| **Expect** | Success panel. A `quoteSubmission` row. Dropdowns are populated (G1). |
| **QA checks** | ① Service Style and Occasion dropdowns are **not empty**. ② Submitting twice with the same email+date is deduped, not doubled. ③ On failure the page shows plain copy, never a stack trace. |
| **Status** | ⚠️ Blocked by G1. Error-copy check ③ **fixed and verified in-browser 2026-07-26**. |

### Stage 1 — Triage the lead → `quote`

| | |
|---|---|
| **Actor** | Sales |
| **Route** | `/clients/quote-requests`, `/clients/pipeline` |
| **Do** | Review the submission, qualify it into a Lead, convert to a Client. |
| **Expect** | Lead in pipeline; Client created; source/referral attribution captured. |
| **QA checks** | ① Lead carries the referral source. ② Converting does not duplicate an existing Client (dedup on email). |

### Stage 2 — Create the event → `planning`

| | |
|---|---|
| **Actor** | Sales / event manager |
| **Route** | `/events/new` |
| **Do** | Client, date/time, headcount, venue, occasion, service style, **salesperson**, **referral source**, budget, quoted price. |
| **Expect** | Event at stage `planning`. |
| **QA checks** | ① All six reference selectors are populated and persist. ② `endsAt > startsAt` is enforced. ③ Event appears on `/events` and `/events/capacity`. |

### Stage 3 — Build the proposal

| | |
|---|---|
| **Actor** | Sales |
| **Route** | `/clients/proposals` (templates at `/clients/proposals/templates`) |
| **Do** | Draft from the event → apply a template → select menu dishes → price the lines → download the PDF. |
| **Expect** | Proposal `draft` with priced line items and a menu selection. |
| **QA checks** | ① The **readiness notice** warns when venue, menu, or pricing is missing — and does **not** block sending. ② Line-item edits recompute the total. ③ Catalog-sourced prices carry `menuDishId`; an override demands a reason. ④ PDF shows the itemized breakdown, timeline, and venue logistics. |
| **Status** | Readiness notice shipped 2026-07-26. |

### Stage 4 — Send, share, sign

| | |
|---|---|
| **Actor** | Sales → client |
| **Route** | `/clients/proposals` → public `/share/:token` and `/accept/:callbackToken` |
| **Do** | Send (snapshots an immutable revision) → share link → client opens, reviews pricing, signs. |
| **Expect** | Proposal `sent` → `viewed` → `accepted`; `ProposalAccepted` fires; dish selections cascade to `EventDish`. |
| **QA checks** | ① Send captures a revision snapshot including **venue logistics** — later venue edits must not change the accepted revision. ② Signing flips the proposal to `accepted` (the reaction wired 2026-07-26). ③ Revoking a share link makes the public URL dead. ④ A second signature callback cannot double-apply. |

### Stage 5 — Approval and sales lock → `pending_approval` → `approved` → `sales_lock`

| | |
|---|---|
| **Actor** | Event manager, then sales manager |
| **Route** | `/events/:id` |
| **Do** | `submitForApproval` → `approve` → `lockForSales` → `confirmSalesLock`. |
| **Expect** | Stage advances; approval opens the pack list and plans production batches. |
| **QA checks** | ① `returnToPlanning` works from `pending_approval` with a reason. ② Approval **auto-opens a PackList** and **plans a production batch** (both covered by runtime proofs). ③ A non-manager is denied and no partial state is left. |

### Stage 6 — Operational planning (parallel tracks, all pre-execution)

| Track | Route | Must be true after |
|---|---|---|
| Menu & recipes | `/kitchen/event-menu`, `/kitchen/dishes`, `/kitchen/recipes` | Event dishes resolve to recipes; estimated food cost rolls up and equals the sum of `EventDish.estimatedCost` |
| Allergens | `/events/:id/allergen-briefing`, `/kitchen/allergen-matrix` | Every guest restriction is represented; a failed quality check blocks the prep task |
| Prep | `/kitchen/prep` | Prep tasks exist per dish with due times before service |
| Purchasing | `/inventory/demand`, `/inventory/purchasing` | Ingredient demand fans out from recipes; shortages consolidate into one weekly vendor order that stays `DRAFT` |
| Stock | `/inventory/stock` | Reservations placed; reconcile leaves no orphan reservation |
| Staffing | `/staff/roster`, `/staff/time` | Shifts scheduled and assigned; approved time-off is not double-booked |
| Equipment & pack | `/logistics/packs`, `/logistics/pack-templates` | Pack list generated from a template, then packed |
| Layout | `/events/:id` battle board | Venue layout template copied into the event |
| Delivery | `/logistics/deliveries`, `/logistics/route` | Packed list schedules a delivery with a vehicle and a non-overlapping window |

**QA checks:** ① Changing headcount at this point re-drives demand and cost. ② Every one of these must stay **editable** — per `docs/architecture/domain-gating-restraint.md`, live ops must remain correctable.

### Stage 7 — Execution → `executing`

| | |
|---|---|
| **Actor** | Event + kitchen + logistics staff |
| **Route** | `/events/:id`, `/kitchen/display`, `/logistics/deliveries`, `/my` (mobile) |
| **Do** | `beginExecution`. Run prep, load out, deliver, serve. |
| **Expect** | Stage `executing`; shifts start/complete; delivery confirms. |
| **QA checks** | ① Mobile `/my` works on a phone viewport. ② Corrections are still possible mid-event (no freeze). ③ Incidents can be logged with corrective actions. |

### Stage 8 — Wrap → `final` → `completed`

| | |
|---|---|
| **Actor** | Event manager |
| **Route** | `/events/:id`, `/finance/closeout` |
| **Do** | `finalizeEvent` → `complete`. Capture actuals: waste, tips, staff hours. |
| **Expect** | Stage `completed`; closeout captured. |
| **QA checks** | ① Waste recorded against `/inventory/waste`. ② Tips flow to `/finance/tips`. ③ Staff feedback can reference the event (per-event, not just periodic). |

### Stage 9 — Money → invoice, payment, reconciliation

| | |
|---|---|
| **Actor** | Finance |
| **Route** | `/finance/invoices`, `/finance/payments`, `/admin/integrations` |
| **Do** | Issue → send invoice → client pays via Stripe link → record + settle → reconcile. |
| **Expect** | Payment settles, invoice balance drops, `PaymentSettled` applies the amount. |
| **QA checks** | ① **Funds land in the tenant's own Stripe account**, not the platform's — verify the `acct_…` on `/admin/integrations` matches the receiving account. ② An unconnected or not-charges-enabled tenant is told to finish onboarding instead of silently charging the platform. ③ Payment reconciliation is **manual** ("Sync payments") until #52 lands — schedule someone to press it. ④ Refunds/credit memos adjust the balance. |
| **Status** | Connect shipped 2026-07-26. Needs G4 (a real key) to verify with money. |

### Stage 10 — Close out → `closed_out`

| | |
|---|---|
| **Actor** | Finance / owner |
| **Route** | `/events/:id`, `/finance/closeout`, `/reports/*` |
| **Do** | `closeOut`. Review margin. |
| **Expect** | Terminal stage — no transitions out. |
| **QA checks** | ① Profit margin at `/finance/profit-margins` reflects actuals not estimates. ② The event appears in `/reports/tims-kpis`, `/reports/sales`, `/reports/scorecard`. ③ The **venue scorecard** on `/facilities/venues/:id` now counts this event (shipped 2026-07-26). ④ Revenue attribution splits to the salesperson at `/finance/attribution`. |

### Cancellation path (test separately)

Cancel from `planning` and again from `executing`. Expect: stage `cancelled`,
terminal, no transitions out; staffing/equipment/delivery released; the event
excluded from booked value on the venue scorecard.

---

## 3. Three-day plan

### Day 1 — Make the app usable (unblocks everything)

1. **Stand up a real tenant (G1).** Blocked on #113 — the generated seed is a
   no-op with no entrypoint and skips the entire event spine. Two options:
   - *Fix the generator* (Manifest repo — correct, slower), or
   - *Create the tenant through the UI* — sign in, create the organization,
     then add service styles, occasions, roles, venues, dishes by hand.
   For a 3-day ship, **do it through the UI** and treat #113 as post-ship.
2. **Add the keys (G4, G6).** Stripe secret key, `CAPSULE_PUBLIC_APP_URL`,
   `RESEND_API_KEY`, `INVOICE_REMINDER_FROM_EMAIL` via `bunx convex env set`.
3. **Connect Stripe.** `/admin/integrations` → Connect Stripe → finish
   onboarding → Refresh status until it reads "Accepting payments".
4. **Smoke-test the public entry point.** `/quote` submits successfully with
   populated dropdowns.

### Day 2 — Walk the lifecycle

Run Section 2, stages 0–10, on one test event. Log every defect; fix only what
blocks the walkthrough. Resist adding features.

### Day 3 — Real data, real money, cutover

1. Import or hand-enter the real venues, clients and menu.
2. Run **one real event's** invoice through Stripe for a small amount and
   confirm it lands in the tenant's bank account.
3. Decide TPP cutover: parallel run (`/admin/parallel-run`) or hard switch
   (`/admin/cutover`).
4. Freeze. Ship.

---

## 4. Known limitations to ship with (say these out loud)

1. **Payments do not auto-reconcile** (#52). Someone presses "Sync payments".
   The fix is in the Manifest repo, not this one.
2. **Single tenant only, safely.** Stripe Connect makes funds route correctly
   per tenant, but `quoteBuilder` resolves "the active organization" — the
   public quote form assumes one org per deployment.
3. **No inbound email/SMS/social.** The threading data model and inbox exist;
   no provider is connected. Nowsta is not built at all.
4. **The generated seed is broken** (#113). New deployments start empty.
5. **`/quote` is the only public write.** It is rate-capped per tenant per hour.

---

## 5. Evidence

### Automated (2026-07-26)

- `bun run check` — green, exit 0 (typecheck, format, secrets, tests, build, baseline).
- `bunx vitest run tests/proofs` — **22 files / 50 tests passing**: real
  `convex-test` runtime proofs against generated mutations, including
  event→approve→packlist, approve→production batch, closeout, food-cost
  rollup, weekly purchasing, pack-list→delivery, invoice→payment, shift, and
  payroll lifecycles, each with a role-denial case proving no partial writes.

### Browser route smoke test (2026-07-27, signed in as admin)

**This is a smoke test, not a workflow test.** It proves pages render and
individual commands fire. It does NOT prove one event moves through the
operational chain. See §6 for what that audit found.

- **53 authenticated routes loaded, zero crashes** — no error boundary, no
  unhandled Convex error, across events, clients, kitchen, inventory,
  logistics, facilities, staff, finance, all 7 report dashboards, and admin.
- **Staff account linking — proven end to end.** Linked an unlinked staff
  profile to a workspace account from the roster, confirmed the
  `authSubjectId` persisted in Convex, then unlinked and confirmed the row
  returned to its original state.
- **Venue scorecard — real derived numbers.** 12 events booked, 7 upcoming,
  1 cancelled (8%), $13,502 booked value, $1,227 average. Cross-checked:
  13502 ÷ 11 non-cancelled = 1227, so cancelled events are correctly excluded.
- **Proposal readiness notice — fires and does not block.** A freshly drafted
  proposal showed all three warnings (no linked event, no menu selections, no
  priced line items) and remained fully actionable.
- **Stripe Connect section renders** with "Not connected" and a working
  Connect button; with no `STRIPE_SECRET_KEY` set it reports the missing
  configuration cleanly.
- **Public `/quote`** renders and submits; on an empty-organization deployment
  it fails with plain copy rather than a stack trace.

### Not verified

- **Any flow requiring a real Stripe key** — onboarding, payment link creation,
  and settlement are unexercised until G4.
- **The full quote → closed_out stage progression on one event.** Individual
  stages are covered by runtime proofs; the continuous walkthrough is Day 2.
- **The escalation guard on `linkAccount`** was verified by reading the
  generated code, not by signing in as a workforce manager.

---

## 6. Operational workflow audit (2026-07-27)

Checked against the manifests, not the docs. "Automatic" below means a
server-side Manifest reaction fires it; anything else needs a human or a page
visit.

### Real, and genuinely automatic

> **Correction (2026-07-27):** the purchasing chain below is real in the
> manifest but was **unreachable from the UI until 2026-07-27**. Its first hop
> fans out over `DishRecipe`, and no screen in `src/features` ever called
> `DishRecipe.attach` — six places read `useListDishRecipe`, nothing wrote it.
> Every dish in production therefore had zero recipe lines, and
> `/inventory/demand` read "0 LINES" for an event that had a dish. An
> attach/detach panel now exists on the dish page (commit `7e4d0aa`). The
> chain firing end to end is **still unverified in the UI** — see §7.

The purchasing chain is the strongest thing in the app *on paper* — an
unbroken reaction path from adding a dish to a drafted vendor order:

`EventDishAdded → DishRecipe → EventDishRecipeSeeded → RecipeIngredient →
EventIngredientContribution → IngredientDemand.syncFromContributions →
PurchaseNeed → WeeklyPurchasingConfig.routeNeed → VendorOrder.ensureWeeklyDraft
→ VendorOrderLine.ensureWeeklyLine`

Also automatic: `EventApproved → PackList.open`, `EventApproved →
EventDishRecipeSeed`, `EventHeadcountChanged → EventDish` (re-drives demand and
cost), `PackListPacked → Delivery.schedule`, `VendorOrderLineReceived →
InventoryLot.record + IngredientPriceObservation.record`, `EventClosedOut →
EventCloseout.capture`, and the full `ClientMergeCompleted` fan-out across
events/proposals/contracts/invoices/payments.

### Gaps found

| Step | State |
|---|---|
| Dishes auto-create prep tasks | ✅ **BUILT + VERIFIED IN PRODUCTION 2026-07-27.** `EventDishAdded` now fans out over the dish's active `DishTask` templates and opens one `PrepTask` each, server-side. Proven live: 3 templates on Tito Test Dish produced exactly 3 prep tasks on Test Event (55 guests) — `55 portion`, `55 portion`, `342.65 ounce` (6.23 × 55) — visible on `/kitchen/prep` on first load, with no "Sync prep" click. See §7 for the duplicate-generation defect this exposed and fixed. |
| Prep task **claim** | ⚠️ Fixed but **still unproven end to end.** `claim` used to write `user.id` (the IdP subject) into `assignedToId`, declared `belongsTo assignedTo: Person`, so the FK never resolved. Fixed 2026-07-27 to `user.personId` (same bug fixed in `PrepTask` quality `pass`/`fail` and `AllergenCheck.record`). Verifying it needs a sign-in that is linked to a `Person`; the production admin account is not linked, so `claim` fails by design. See §7. |
| Prep task **assign** + **complete** | ✅ **VERIFIED IN PRODUCTION 2026-07-27.** Armed Josh Mitchell in Quick Assign → Assign moved the step `pending → in_progress` showing "Josh Mitchell" (the Person FK resolves — the 2026-07-27 fix holds) → Complete moved it to `completed`. Event rollup went to 1/3 · 33% and Crew Load to "0 doing · 0 claimed · 1 done". |
| Containers → pack list | ✅ **BUILT + VERIFIED IN PRODUCTION 2026-07-27.** New `DishContainer` entity + two chained reactions (`PackListOpened → EventDish → DishContainer → PackListItem.addItem`). Proven live: a 55-serving dish with a 25-serving pan and +1 always-send produced a pack line of **4 each, LISTED**, automatically. |
| Equipment per dish | 🟡 `DishContainer.equipmentNotes` carries it as free text (chafers, burners) so an operator is never blocked; a structured Dish → Equipment link is still not built. |
| Cook-on-site / kitchen / bring-hot split | ✅ Real `DishServiceMethod` enum on DishContainer: `cooked_on_site` / `cooked_at_kitchen` / `brought_hot` / `cold_service`. (`DishTask.category` remains a free string; the container carries the authoritative method.) |
| Post-event reports fire automatically | ❌ Only `EventClosedOut → EventCloseout.capture`. No automatic report generation or sending. |
| Event notifications | ⚠️ Unverified. |
| Vehicle assign / check-out | ⚠️ `vehicle.manifest` has register / reviseDetails / updateOperationalStatus and a `vehicleAssignment` seam; no explicit check-out command found. |
| Invoices sent | ⚠️ Issue/send commands exist; delivery needs `RESEND_API_KEY` (G6). |

### Not yet run

The continuous walkthrough — one event from lead through closeout, verifying
each cascade actually fired — has **not** been done. The pieces above are
evidence about the code, not about a live event.

---

## 7. Prep-list walkthrough (2026-07-27, production, signed in as `Angriff36`)

Run on **Test Event** (Jul 30 2026, 55 guests) with **Tito Test Dish**.

### What was built to make it runnable

1. `EventDishAdded → DishTask → PrepTask.open` reaction (`src/production/task.manifest`),
   matched on `(eventDishId, dishTaskId)` so a replay updates rather than duplicates.
2. `DishTask.activeDishId` — a nullable mirror of `dishId`, cleared on retire.
   `fanOut` takes a single predicate, so the "only active templates" filter has
   to live in the key. `backfillActiveKey` + a compat fanOut ahead of generation
   repairs templates that predate the field.
3. `DishTask.station` — real prep sheets (`work/prep_list.csv`) group by station
   ("Apps - Passed - Finish at Event"). `PrepTask` already had the field; the
   template had no way to set it.
4. A create/remove form on the dish page's prep-template panel, which was
   previously **read-only** — so the cascade had nothing to fan out.

### Defect found by running it: every prep task was created twice

First live run produced **6** tasks from 3 templates, in two different units
(`55 each` + `55 portion`; `6.23 ounce` + `342.65 ounce`).

Cause: the new server reaction *and* the surviving client-side
`EventPrepTaskSynchronizer` both materialized the templates. The client call
fires immediately after `createEventDish`, so its reactive catalogs have not
seen the server's rows yet and its dedupe-by-`dishTaskId` misses every time.

Fixed by making the server the only creator at add time — the three
post-create call sites now reconcile stock only. "Sync prep" and the
post-adjust path still run the full synchronizer, where the catalogs are
current, so they update rather than duplicate. The server's quantity rule was
also aligned to `EventPrepTaskSynchronizer.quantityFor` (`defaultQuantity` is
**per guest**, unit falls back to `portion`) — disagreeing would have made
every reconcile resize every generated task.

Re-run after the fix: exactly 3 tasks, correct units, correct quantities.

### Blocked: `claim` cannot be proven without a linked sign-in

`PrepTask.claim` guards on `user.personId`. The production admin account
(`Angriff36` / `user_3GR87p1FnpiFY9TUrupNU9WqWyt`) is **not** linked to any
`Person` — the two linked profiles (`bill colacurcio`, `me admin`) point at a
different Clerk user (`user_3Gt6c5YLSR9nLD4j90Tb7Cx4KOR`). Clicking Claim
therefore fails, correctly.

Proving it needs an owner decision, because the fix is a permission grant on
production: hire/link `Angriff36` to a `Person` under Administration → Team
roles. **Not done — awaiting authorization.**

The bare "Action failed unexpectedly" this produced was replaced with copy
naming the cause and pointing at both remedies (link the account, or use
Assign). Assign is unaffected and already works.

### Blocked: the purchasing chain has never had any input

`/inventory/demand` read **0 LINES** for Test Event even with a dish on it.
Root cause is not the reaction chain — it is that `DishRecipe.attach` had no
caller in `src/features`, so no dish anywhere had a recipe line. Fixed by
adding a "Recipes in this dish" panel (`7e4d0aa`), and Macaroni Salad (8
priced-at-zero ingredient lines) was attached to Tito Test Dish in production.

**Still unverified:** demand did not appear afterwards, because the cascade
fires on `EventDishAdded` and the dish was already on the event. Re-adding it
to re-fire the reaction did not complete before this session ran out — the
`window.prompt` in the Remove handler makes that path awkward to drive from
automation. Next session: remove and re-add the dish, then check
`/inventory/demand`, `/inventory/purchasing`, and the event Margin tab.

Also note: all 8 Macaroni Salad ingredients have **no cost recorded**
("8 LINES NEED PRICING ATTENTION", $0.00/quart). Even once demand flows,
margins and food-cost reporting will read zero until ingredient costs are
entered. That is data entry, not a code gap.

### Remaining, untouched this session

Timeline + staff assignment, event notifications, vehicle assign/check-out,
venue/client/event sync, post-event report firing, invoice send. The
lead → proposal → contract → event front half of §2 was also not walked.
