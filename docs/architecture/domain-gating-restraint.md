# Domain gating restraint (agents)

**Status:** Binding for Capsule domain authoring (`.manifest` policies/guards/constraints)  
**Created:** 2026-07-19  
**Audience:** AI agents and humans writing Capsule Manifest domain

## The failure mode

Agents systematically **overgate**: invent specialty roles, freeze mutations at the first lifecycle stage that “sounds serious,” and add seed/match constraints that feel careful but block real ops.

Real catering ops are messy. Mid-service you run out of a dish, swap a plate, zero servings (86), or rewrite a note. If the model forbids that, people work around the software — or the software is wrong.

## Rules

1. **Default read wide, write narrow — but not cartoon-narrow.**  
   Prefer `staffAccess` for read on operational records the whole crew needs. Prefer `manageAccess` (or a real specialty manage cap) for composition/money/destructive changes. Do **not** invent “event staff only may see the menu.”

2. **Gate on harm, not vibes.**  
   Ask: “What breaks if a manager does this during executing?” If the answer is “prep recalculates / audit trail updates” — that is fine. If the answer is “money silently lies” — gate or put the change on Invoice/Payment instead.

3. **Live ops stages stay mutable for managers.**  
   For event-linked composition (EventDish and similar): planning → executing should usually allow add / remove / adjust / notes. Lock **cancelled** (and usually post-close menu adds). Do not freeze the menu at `approved` just because execution “sounds final.”

4. **Zero is a valid ops signal.**  
   Servings `0` can mean 86’d without deleting the line. Do not force `> 0` forever after add unless the domain truly forbids zero.

5. **Do not confuse seed/API checks with business rules.**  
   `eventId` param must match seeded FK is a createVia safety check. Explain it that way. Never sell it as “you cannot move dishes between events” — remove + `addToEvent` on a new row does that.

6. **Refunds are not servings.**  
   Money corrections live on Invoice/Payment/closeout. Do not block ops field edits “because refund.”

7. **Every guard needs a one-line why that a cook would accept.**  
   If you cannot say it in plain ops language, delete the guard.

## Anti-patterns (do not ship)

- Specialty `*Access` read policies on records every employed role needs
- “No edits once executing” with no 86/swap path
- Requiring resurrection of soft-deleted rows instead of new-row re-add
- Stage locks copied from another entity without checking the workflow
- Extra role gates on top of default execute policy “just in case”

## Evidence

Owner pushback 2026-07-19 on EventDish overgating (read roles, `select` naming, freeze-during-executing, re-add confusion). Corrected in `src/culinary/event-dish.manifest`.
