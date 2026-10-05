# Migration reconciliation tolerances (PL-CUTOVER, AC-293)

Written 2026-10-02 by the product builder loop, before the reconcile code and
its proof. Spec: `specs/capsule-complete-feature-spec.md` §6.5 and §6.6 ("The
agreed test year and then the full dataset reconcile within documented
tolerances").

## What is compared

TPP's side is the events import's own saved rows (the event link's saved
source row). Capsule's side is the Capsule event each link names. Events are
matched by their link (TPP EventID), never by name. The same rules run the
daily comparison (`src/lib/parallelRunCompare.ts`, `convex/parallelRun.ts`).

A period (the test year, then the whole history) is checked from the
**Compare with TPP** page: pick the first and last day, press **Check this
period**. The check saves every difference it finds in the same list as the
daily check, so a person settles them the same way.

## Tolerances

A period reconciles when all four hold:

| Check | Tolerance | Why |
| --- | --- | --- |
| Events in TPP with no Capsule event | 0 | Every TPP event must have come over. Unmatched ones wait on the match-up page. |
| Capsule events in the period that TPP does not have | 0 | In a past period, an event only in Capsule means a double or a wrong date. |
| Total price, TPP vs Capsule | at most 1 cent per event | The import copies the TPP price; only cent rounding may differ. |
| Differences still open for events in the period | 0 | Each per-event difference (date, guests, price, stage, salesperson, occasion, service style, venue, removed event) is settled by a person as "fixed" or "fine as is". |

The counts by stage, salesperson, occasion, service style and venue have no
separate tolerance: each per-event difference behind them is either open (the
period fails) or settled by a person with a reason (the period passes).

## Options considered

1. **Percent tolerances on totals** (for example 5% on counts, 0.5% on
   revenue). Benefit: quick to pass. Negative: hundreds of wrong events can hide
   inside 5%; nobody knows which ones.
2. **Exact totals and zero per-event differences, no settling.** Benefit:
   strongest. Negative: never passes - TPP keeps old stages and people fix
   things in Capsule only; that is tedium with no real harm prevented.
3. **Exact identity, cent rounding on money, every per-event difference
   settled by a named person (chosen).** Benefit: each real difference is seen
   and owned once; legitimate differences pass with a reason. Negative: the
   first run of a large period lists many differences; "Mark all fine" by kind
   (with one reason) keeps that short.

## Daily operation

The daily comparison runs once a day by itself after the first **Compare now**
and stops after the switch from TPP is approved (go). Open differences are
switch blockers on the **Switch from TPP** page.
