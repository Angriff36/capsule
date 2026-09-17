# Requirements, gaps and verification

Status is unverified unless current direct evidence is recorded. This initial ledger grows as the remaining sources are studied; it is not a scope ceiling.

| ID | Required behavior | Source | Evidence still needed |
| --- | --- | --- | --- |
| OPS-001 | Clear sales-to-ops readiness and print/binder status without reproducing unnecessary manual tool switching | Training pp1-3,8,12 | Current event lifecycle, rendered queue, change handling |
| OPS-002 | Service style, guest count, ordered menu and individual quantities; detect unresolved empty menu shells | Training pp3-4 | Source-to-live dish classification and usable linked formulas |
| OPS-003 | Production notes carry operational consequences such as cones and extra dressing bowls into packing | Training p4 | Actual event note-to-packing path and real example |
| OPS-004 | Backward timeline: service, onsite, travel, departure/NLT, loading/call time; return/cleanup/unload | Training p4 | Full-service example 11:30 serve, 08:30 onsite, 08:00 departure, 07:00 call; travel is evidenced input, not guessed |
| OPS-005 | Setup notes, dietary counts, weather plan, linens, servingware and accessible diagrams | Training p5 | Shared field view and printable event output |
| OPS-006 | Category packing and dish-associated reference views from consistent quantities; no duplicated associations | Training pp5-6,9 | Packing screen, reference report, category report and update/replay comparison |
| OPS-007 | Resolve excluded/equivalent items with actual equipment; tent/flooring/handwash/variant requirements and vehicle/trailer assignments | Training pp6-7 | Source-specific actual allocations; no automatic invented equivalents |
| OPS-008 | Verify rentals/decor and serving equipment; beverage/bar as applicable | Training pp7-8 | Event attachments, responsibility and linked packing |
| OPS-009 | Binder contains worksheet, menu, REF pack list, category pack list, event forms, staff timesheet/phones, rental pull sheet, relevant maps/diagrams | Training pp8-9,11,16 | All referenced form pages and actual generated/attached documents |
| OPS-010 | Prefill event scope/task breakdown from known event facts; preserve field-lead observations as blank until actually completed | Training pp10-11 | Field forms, persistence, print output and ownership |
| OPS-011 | Shop/arrival/packing/return/departure checklists, waste, bins, after-event, buffet drawing, two-person takeoff record | Training pp10-12 | Binder form details and matching runtime workflows |
| OPS-012 | Shared event tracker shows event number/date, NLT, vehicle/trailer and packing/readiness; personal work remains assigned work | Training pp7,11-13 and user request | Battle board, My Day and workspace runtime verification |
| OPS-013 | Prep hierarchy: event context, category, dish + dish servings, child work quantity/unit/instruction, production notes/container | Prep pp1-3; p1 visually inspected | Direct desktop/mobile/print comparison |
| OPS-014 | Finished dishes, actual subrecipes, ingredients and genuine prep work remain distinct and connected | User request; Prep pp1-3 | Migration source rows versus live classifications and joins |
| OPS-015 | Component references open usable recipes with quantities, yields, ingredients and methods | User request; Prep pp1-3 | Inspect all named drive/TPP references, recipe sources, live links |
| OPS-016 | Changes reconcile prep/demand/purchasing/packing without double counts or loss of completed/user-edited work | User request | Runtime before/after for guests, servings, substitution, removal, formula change and replay |
| OPS-017 | Repair existing affected data repeatably and preserve historical facts/provenance | User request | Source/live snapshots, reviewed repair plan, first/repeat run receipts |
| OPS-018 | Complete gates, independent review, authorized release and deployed verification | User request + AGENTS.md | Fresh commands, reviewer verdict, release receipt, authenticated deployed verification |

## Worked examples from prep reference

- Ashley + Jeffery wedding, invoice 6014, 2026-09-05. Main dish servings 167; appetizers 42; infused water 334. Individual event dish servings cannot be blindly replaced by guest count.
- Asparagus at 167 servings: snip/blanch 31.31 pounds; lemons 41.75 each; butter 10.44 pounds; sea salt 1.04 pounds; shaved parmesan 10.44 pounds (p1).
- Cougar Gold mac at 167: sauce 3.91 gallons, elbow pasta 10.44 pounds, panko topping 2.61 gallons, cooked bacon 2.61 pounds (p1).
- Rolls at 167: honey cinnamon butter 2.61 pounds and proof/bake 167 each (p1). Existing recipe text sources include Honey_Cinnamon_Butter.txt and Cougar_Gold_Mac_Sauce.txt; contents not yet verified.
- Ahi tuna at 42: crust 2.63 pounds and sear the same 2.63 pounds (p2). These are sequential work on the same tuna, not two ingredient demands.
- Mac bites at 42: use Cougar Gold cans as passing vessels (p2); production notes affect equipment.
- Infused water kit says only one per beverage container, ask if more than one, while the printed quantity is 4.18 batch (p3). Investigate container basis rather than treating proportional print quantity as an unquestionable formula.

## Evidence limits

All seven specified training/prep/binder PDFs extracted and rendered: 52 total pages. Entire training guide and prep text read. Visual inspection completed only for guide p4 and prep p1. Other images/documents and live records remain uninspected.

Prior production-readiness audits and memory report missing Ashley downstream links and generic report rendering. These are historical leads, not current findings. Recent main commits include recipe text and My Day fixes; their full behavior is not yet verified.

## Current implementation leads (not yet runtime-qualified)

- `scripts/repair-tpp-recipes.ts` already offers a preview-default source projection and authenticated apply with plan hash, tenant and dish-version checks. It reads `recipes.json` and `existing-catalog.json`; neither is a fresh live snapshot by itself. Existing repair artifacts dated September 8 must be reconciled before another repair.
- `src/lib/tppRecipeRepair.ts` explicitly projects top-level recipes into dishes and nested formulas into components. Inspect its complete classification/scaling behavior before changing it. Initial read covers lines 1-240 only. It defaults unrecognized yield to portion size 1 and unit batch; determine whether actual source rows trigger this and whether it invents operational meaning.
- Repair seam is exported in `convex/lib/culinaryOperations.ts`; attempted path `convex/lib/tppRecipeRepair.ts` does not exist. Follow the actual imported `repairDishRecipe` owner next.
- Event Forms One Print full extracted text read (12 pages; visual inspection pending): p4 requires measured leftovers, explicitly says not to guess unknown numbers; p5 separates red BOH, green FOH-to-buffet, yellow FOH-to-kitchen, blue miscellaneous bins and dirty-bin markings; p6 captures prep/cooking/packing feedback and equipment breakage; pp11-12 separate document presence, equipment, communication and physical departure checks with Warehouse/Ops and Event Lead names/dates.
