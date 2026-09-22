# Catalog reclassification: TPP menu items that are not dishes

**Status:** Built on `dev` 2026-09-21 (owner: "design it", then "do it").
Qualified on the local backend against the real 2,783 imported rows: 414
kitchen batches, 70 orphans, 27 supplies and a sample of 8 prep steps
applied through the page with no failures. Not yet run on production.

**Where it lives:** engine `convex/lib/culinaryModel/catalogReclassification.ts`,
seam `convex/catalogReclassification.ts` (candidates, recordSuggestions, plan,
decide, apply), planner `scripts/catalog-reclassification-plan.ts`, page
`/kitchen/cleanup`, proof `tests/proofs/catalog-reclassification.runtime.test.ts`.

**Lessons from the local run:** two TPP parents can share one Capsule dish,
so parents are deduped by dish before attaching or adding tasks; a retry
after a partial failure reuses a same-name recipe or task instead of making
a second one; kitchen batches and prep steps apply five per call because each
one writes under every parent dish (about 15 s per five locally); the planner
runs as the signed-in account, so the operator needs kitchen access
(`CATALOG_PLAN_JWT` takes a minted session token for a chosen account).
**Not built in this pass:** ingredient lines on a drafted recipe, the "Make …"
task on its parents, and the `DishTaskMaterial` link on a prep step. The TPP
rows travel in the recipe's `sourceText`, so the recipe shows as
"ingredients missing" on the unresolved-work page until a person or a later
pass adds them. On production most batches and prep steps already exist
from the 2026-09-14 recipe import, so apply mostly links and retires there.
**Scope:** the 2,783 TPP menu items imported as `Dish` rows on 2026-09-03, of
which 1,893 carry no category and about 1,033 are not dishes at all.
**Out of scope:** new entities, schema changes, any reasoning-model call.

## 1. The problem in one paragraph

TPP kept one recursive "Menu Item" table for everything the kitchen touches.
The 2026-09-03 menus import (`convex/importCommit.ts`, `menus` branch) mapped
every row to one `Dish` because the xlsx export had no way to tell rows
apart, and its Category column was blank for 1,893 rows. So the kitchen book
lists "Portion 2oz salmon filet", "Make strawberry puree", "Portion
plasticware" and "Pizza Menu TBD" as dishes. Revision 2 of the culinary
model (`docs/systems/culinary.md` § Naming and mapping model) already says
where each of those belongs. This design moves them there, row by row, with
a person approving each group, and keeps every source link and every event
history intact.

## 2. What the data says (measured 2026-09-21)

Sources: `work/tpp-menus-1..3.json` (the 2,783 imported rows) joined by
normalized name to `work/tpp-recipes/tpp-recipes-full.json` (2,836 TPP items
with their category, verb, recipe rows and parent links). Joined 2,757 of
2,783. Jev run: `scripts/jev-menu-item-kind-probe.ts`.

| Fact                                                             | Count |
| ---------------------------------------------------------------- | ----: |
| Imported rows with no category                                   | 1,893 |
| Of those, TPP category in the recipe export is "Prep List Item"  | 1,342 |
| Of those, TPP category is a real service category (Drop Off, …)  |   461 |
| Jev: prep step or kitchen batch                                  |   869 |
| … used as a line under a parent dish or package in TPP           |   807 |
| … with no parent anywhere (orphans)                              |    62 |
| Jev: supply                                                      |   109 |
| Jev: placeholder / service / package                             |    57 |
| Rows the existing rule engine calls `dish` that Jev flags as not |    63 |

Two consequences shape the design:

1. **Most of the answer is already a rule.** The recipe export carries the
   TPP category the xlsx lost. "Prep List Item" plus the verb rule in
   `classifyTppItem` (`convex/lib/culinaryModel/tppImport.ts`) settles 1,342
   rows without a model.
2. **Jev earns its place on the remainder.** Among rows the rule calls
   `dish`, Jev finds 21 placeholders, 19 supplies, 10 services and 13
   packages the rule cannot see, at confidence the gate can use.

## 3. Target: where each kind of row goes

The revision-2 table is the authority. This design adds nothing to it.

| Jev / rule kind      | Becomes                                                       | Command path (all generated, all existing)                                                                                 |
| -------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| served dish          | stays a `Dish`, `kind = food`, category backfilled from TPP   | `Dish.classifyKind(food)`, `Dish.reviseDetails(category)`                                                                  |
| supply               | stays a `Dish`, `kind = supply`                               | `Dish.classifyKind(supply)`                                                                                                |
| package              | stays a `Dish`, `kind = package`                              | `Dish.classifyKind(package)`                                                                                               |
| service / modifier   | stays a `Dish`, `kind = service`                              | `Dish.classifyKind(service)`                                                                                               |
| placeholder          | stays a `Dish`, `kind = food`, category `Choice placeholder`  | `Dish.reviseDetails(category)`; the client picks later, as in TPP                                                          |
| kitchen batch (Make) | a `Component`, attached to each parent dish                   | `Component.draft`, `ComponentIngredient.add` per inventory row, `DishComponent.attach` per parent, `DishTask.add` "Make …" |
| prep step            | a `DishTask` under each parent dish                           | `DishTask.add(dishId, name, ingredientId?, componentId?)`, `DishTaskMaterial.link` when the row acts on one requirement    |
| orphan prep / batch  | see § 7, decision 1                                           |                                                                                                                            |

The retired `Dish` row is never deleted. `Dish.retire(reason)` keeps the row,
its `ExternalRecordLink`, and every `EventDish` that ever pointed at it.
Event menus and prep history still render. A re-import cannot resurrect it:
the menus branch skips any external id that already has a link.

## 4. The four layers

Capsule keeps these apart on purpose. No layer does another layer's job.

### 4.1 Rules (deterministic, authored TypeScript, pure, tested)

Run first. A row a rule decides never reaches Jev.

- TPP category "Prep List Item" (from the recipe export) → not a dish.
- Timing tag in the name: `(day of)`, `(1 day prior)`, `close to day of`,
  `night before` → prep step (owner rule, 2026-09-21).
- Verb rule from `classifyTppItem`: Make/Cook/Roast/Bake/Brine/… → kitchen
  batch ("Make stays a recipe", revision 2); Portion/Cut/Slice/… over one
  inventory row → prep step that portions that ingredient.
- Packaging words (`SUPPLY_WORDS` in the same file) → supply.
- Backfill: a row whose recipe-export category is a service category
  ("Finish at Event", "Drop Off", …) gets that category on the `Dish`.

### 4.2 Jev (fast classification, one Choice question per row)

Only for rows the rules leave as `dish` or cannot join to the export
(about 600). Question: served_dish, supply, package, service, placeholder,
prep_step, kitchen_batch, other. Confidence ≥ 0.8 → the suggestion is
"ready"; below → "needs a look". Jev never writes. Its answer is stored as a
suggestion (§ 4.4), with `suggestedBy = "jev-1.13.0"`.

What Jev must not decide: whether a batch's unit converts (that is `units.ts`,
and "unresolved" stays unresolved), quantities, which parent dish a step
belongs to (TPP already says), anything about money.

### 4.3 Reasoning model

None. Nothing in this flow needs one. If a row is ambiguous, a person
decides on the review screen.

### 4.4 Commands and side effects (governed, idempotent)

**Suggestions are `ExternalRecordLink` rows, not a new entity.** Revision 2
allows one legacy record to map to several Capsule records, one link per
`role`, with `decision = suggested | approved | rejected` and `suggestedBy`.
A suggestion for a row is a link with:

- `recordType = "menu"`, same `externalId` as the imported dish's link
- `role = "reclassify"`, `ordinal = 0`
- `capsuleEntity` = the target kind's entity (`dish`, `component`,
  `dish_task`), `capsuleId = ""` until applied
- `decision = "suggested"`, `suggestedBy = "rule:<name>"` or `"jev-1.13.0"`
- `metadata` = JSON `{ kind, confidence, parents: [tppSak…] }`

That gives durable, reviewable, re-runnable suggestions with the existing
`decide()` command and no schema work.

**Apply is one authored seam:** `convex/lib/catalogReclassification.ts`,
shaped like `repairImportedDishRecipe` in `culinaryOperations.ts`:

```
planCatalogReclassification(query)   → the review list, grouped by kind,
                                        with confidence, source, parents,
                                        and whether any live event uses the row
applyCatalogReclassification(mutation, { operationKey, linkIds[] })
```

For each approved link, in one transaction, through generated commands:

1. `Dish.classifyKind` / `reviseDetails` for rows that stay dishes. Done.
2. For a kitchen batch: `Component.draft` (name, yield from the TPP row,
   `sourceFingerprint`, `sourceText` = the raw row); `ComponentIngredient.add`
   per inventory row through `resolveTppUnit` — an unresolved unit is written
   as unresolved, never guessed; `DishComponent.attach` and `DishTask.add`
   ("Make …", `componentId`) on each parent dish that is a live `Dish`;
   `Dish.retire("Reclassified as recipe <componentId>")`.
3. For a prep step: `DishTask.add` on each live parent dish with the row's
   name, `ingredientId` when the row portions one inventory item,
   `DishTaskMaterial.link` to that parent's matching `DishIngredient` when one
   exists; `Dish.retire("Reclassified as prep step under <n> dishes")`.
4. `ExternalRecordLink.decide(approved)` on the suggestion, `capsuleId` set to
   the new record (first parent's task id, or the component id); a second link
   per extra parent with `ordinal = 1, 2, …`.
5. Write a materialization receipt keyed by `operationKey` so a lost
   acknowledgement never repeats writes.

Idempotency: the link key `(tpp_legacy, account, menu, externalId,
reclassify, ordinal)` is unique. Re-running plan does not duplicate
suggestions; re-running apply on an approved link is a no-op.

Guards, per `docs/architecture/domain-gating-restraint.md`: kitchen access
writes, that is all. A dish on a live event can still be reclassified; the
event keeps its line and its history. No stage freeze, no new role.

## 5. Review screen

One page, `/kitchen/catalog-cleanup` (or a tab on `/admin/imports`; either
fits the existing patterns, pick when building). It shows the plan grouped
by kind, each group with count, ready/needs-a-look split, and a sample:

- "Approve all ready" per group. Rules-decided rows are ready by definition.
- Per row: change the kind, or reject. A rejected row stays a dish and the
  link records the rejection so the next run does not ask again.
- Rows that Jev put below 0.8 sort to the top of "needs a look".
- After apply, the group shows the receipt: made N components, N tasks under
  N dishes, retired N dish rows.

Nothing else on the screen. No free-text prompts, no model chat.

## 6. Order of work

1. `catalogReclassification.ts` engine (pure): join rows to the recipe
   export, run the rules, emit the plan. Unit-tested against
   `work/tpp-recipes/tpp-recipes-full.json` samples. No Jev yet.
2. Jev step for the leftover `dish` rows, behind the confidence gate, writing
   suggestion links. Key from the tenant's assistant settings pattern
   (`convex/assistantConfig.ts` shape) or an env var on the self-hosted box;
   never in the repo.
3. Apply seam with receipts, proof test in `tests/proofs/` (kitchen-role,
   one batch with two parents, one prep step, one supply, rerun is a no-op).
4. Review page.
5. Run on the local backend against the real 2,783 rows; browser pass; then
   release and run on production.

## 7. Decisions for the owner

1. **Orphans (62 rows).** A prep step or batch with no parent dish in TPP
   cannot be a `DishTask` (it needs a dish). Proposed: retire the dish row
   with reason "prep item with no parent dish in TPP; add it under a dish
   when needed". History and link stay. Alternative: keep them as
   `Component` drafts with no usage, which clutters the recipe list.
2. **Placeholders (26 rows).** Proposed: keep as dishes with category
   "Choice placeholder" so proposals can still list "Chef's Choice
   Appetizer". Alternative: retire them and use `choice_pending` tasks only.
3. **Served dishes used inside other items (361 rows).** Proposed: leave
   them as dishes. A salad inside a box lunch is still a dish. No action.

## 8. Expected outcome on production

| Before                              | After                                          |
| ----------------------------------- | ---------------------------------------------- |
| 1,848 "Uncategorized" dishes        | about 450 real dishes, categorized from TPP    |
| prep steps listed as dishes         | ~750 `DishTask` templates under their dishes   |
| kitchen batches listed as dishes    | ~300 `Component` recipes with source rows      |
| supplies costed as food             | 109 `kind = supply`, out of food purchasing    |
| nothing tells you where a row went  | every retired row's link names its new record  |
