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

## 5. Evidence as of 2026-07-26

- `bun run check` — green, exit 0 (typecheck, format, secrets, 768 tests, build, baseline).
- `bunx vitest run tests/proofs` — **22 files, 50 tests passing**: real
  `convex-test` runtime proofs against generated mutations, including
  event→approve→packlist, approve→production batch, closeout, food-cost
  rollup, weekly purchasing, pack-list→delivery, invoice→payment, shift, and
  payroll lifecycles, each with a role-denial case proving no partial writes.
- 109 routes registered in `src/app/App.tsx`.
- Browser-verified this session: the public `/quote` form renders and submits
  (fails correctly on an empty deployment), and its error copy no longer leaks
  the server stack trace.
- **Not** browser-verified: every authenticated route. Blocked by an empty
  database (#113) and by browser auth needing a minted Clerk token.
