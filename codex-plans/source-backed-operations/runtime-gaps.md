# Runtime gaps and repair evidence

## Current implementation checkpoint

The prior continuation made concrete progress (instruction preservation, original-workbook evidence, runtime reproductions); it was not blocked. This continuation implements the first connected quantity corrections, still short of the full goal:

- EventDish stores followsEventHeadcount; whole-event rows follow attendance and explicit counts remain fixed even after coincidentally matching a later headcount. Legacy rows infer this once. Explicit serving edits fix the count; clearing the existing headcount override restores whole-event behavior. quantityServings is now also the generated/client cost authority. Generated planned food cost uses fractional recipe batches, consistent with demand.
- EventDishServingsAdjusted now updates linked, uncompleted generated PrepTasks on the server, preserving instructions, assignees and recorded work. Completed/cancelled and manually edited rows retain their work. Supplemental work after a completed task needs further implementation and verification; do not call completed-work reconciliation done.
- Ingredient contributions retain quantityPerServing across zero and restore. Zero demand stays zero, including open weekly purchasing/draft line reconciliation; artificial 0.0001 floors removed. Existing submitted/received purchasing paths still need verification and correction; do not imply those flows are qualified.
- Original-source fixed counts 167/42/334/0 reproduced through actual generated Convex mutations: attendance 200 now yields 200/42/334/0, not four 200s. The linked asparagus task and demand both become 37.5 lb, with its note intact. 86 yields zero demand; restore yields 37.5 lb.
- Related GitHub issues: #311 (serving propagation) and #312 (86/phantom demand), both remain open pending full repair/release.
- Follow-up client correction: EventPrepTab no longer converts zero servings to one; EventPrepTaskSynchronizer returns no work for an 86'd line and only calls the pending-only refresh command for pending work. Existing focused 23 tests and formatting pass after this change.
- Full `bun run test`: 165 files / 1425 tests passed. Full typecheck passed before the final small computed-cost/comment change; focused 18 tests pass after that change. Regeneration ownership and targeted authored TypeScript formatting pass. Full `bun run check`, independent review and release remain required.
- Builder isolation: C:/Projects/builder-source-operations, detached at Builder 87ba52c, installed Manifest 3.6.48. Set BUILDER_DIR to this path for regeneration and branch push; shared C:/Projects/builder has unrelated dirty work and was preserved. This isolated tool dependency change is not a Builder source fix.

Remaining data/model work is substantial: source-proven links and true batch formulas, existing prep adoption, units (including parmesan source conflict), completed-work deltas, substitutions/removals and component edits, zero-initial dish creation with prep, packing and reports, source presentation, desktop/mobile, My Day boundaries, and live repeatable repair. Continue against the full task_plan and findings ledger.

## Prep linkage (confirmed, issue #310)

Issue: https://github.com/Angriff36/capsule/issues/310

`convex/lib/dishRecipeRepair.ts` skips matching prep rows by name without attaching recipe references. `src/features/kitchen/EventPrepTaskSynchronizer.ts` matches by template ID. Local executable reproduction `.artifacts/operations-source-study/reproduce-prep-link.ts` produced a second 37.5 lb row at 200 servings while leaving an imported 31.31 lb row intact. No live writes used. Repair needs explicit, source-proven reconciliation of existing records and preserved work, not a generic name-based merger.

UI path: `useEventMenuSync` -> `EventMenuSyncController.syncPrepForDish` -> `EventPrepCoordinator` -> synchronizer. The MCP add-and-sync path uses the same coordinator. Manifest generates prep on EventDishAdded; no equivalent serving-change reaction was found in task.manifest. Client refresh attempts any generated status, although the command is pending-only; refresh also replaces recipe instructions with event notes, unlike creation, which combines both. Reproduce these additional failures before changing them.

Instruction-loss defect reproduced with `.artifacts/operations-source-study/reproduce-prep-instructions.ts`: before change, quantity refresh sent undefined instructions despite an existing method and event note. Authored fix in EventPrepTaskSynchronizer now preserves existing specialInstructions (including explicit empty text), falling back to combined template/event instructions only when absent. Reproduction now passes; 23 existing tests in event-prep-coordinator, event-menu-sell-price and agent/capsule-event-prep-coordinator pass. Full typecheck and targeted Prettier check pass. This does not yet fix template linkage, non-pending reconciliation, server-owned propagation or source data.

## Guest count versus servings (confirmed source mismatch, runtime proof pending)

`src/procurement/event-purchasing.manifest` reacts to EventHeadcountChanged by calling adjustServings(newHeadcount) for every EventDish. This erases distinct dish servings. Ashley source has 42 appetizer servings, 167 mains and 334 infused water servings. `EventDish.targetHeadcount` meanwhile uses headcountOverride or event.expectedHeadcount for costing, not quantityServings. Need coherent portion/count authority through UI, costing, prep, component demand and packing, retaining explicit event edits.

Client `eventMenuCost.servingsFor` differs again: override > 0, then quantityServings > 0, then event headcount. An explicit zero (86) is therefore costed as the whole event. Existing component-to-demand proof only exercises a whole-event dish and does not cover distinct appetizer/beverage amounts. Inspect original proof setup for isolated runtime reproduction.

## Source coverage and batch identity

`scripts/repair-tpp-recipes.ts` uses exact normalized names and only recipes.json. Ashley's Ahi Tuna Wonton differs from the exported Ahi Tuna Wonton - passed. Do not assume identical formulas: archived version has crust 2 oz and sear 1 oz while event prep has both 1 oz per serving.

`dishRecipeRepair` creates each component with yield 1 serving and already-expanded per-serving ingredients; hashes include those leaves. This loses the real reusable batch recipe identity. Component.yieldQuantity currently also acts as guest divisor in costing; DishComponent supplies separate yieldQuantity/batchMultiplier to purchasing. Trace these semantics before restoring the photographed 5-gallon mac sauce recipe.

## Newly recovered authoritative inputs

Next repair input is now extracted as `.artifacts/operations-source-study/event-formulas.json` by `extract-event-formulas.py`: all 15 Ashley dishes, 71 step groups, exact event totals, and original worksheet row addresses. This is a source candidate, not an approved applied migration. Combine with actual batch photographs and heating/service methods; some steps have no ingredient children in this export, and previously noted unit conflicts remain. Do not default missing ingredient children to zero ingredient need.

Original `Menu_Item_Cost_per_Event.xlsx`, worksheet sheet1:

- A405/L405 Asparagus, 167 servings. G407/H407 prep 501 oz; G409/H409 actual asparagus 31.3125 lb. G417 butter 10.4375 lb; G421 sea salt 1.04375 lb. These agree with prep and shopping, contrasting the reference packing PDF's 41.75 lb asparagus.
- G423/H423 parmesan prep 167 oz but G425/H425 ingredient 10.4375 **oz**, while prep PDF says 10.44 **lb**. This is a separate 16x source unit conflict; do not silently choose one.
- A462/L462 Cougar Gold Gourmet Mac n Cheese, 167 servings. G464/H464 sauce 501 fluid oz (=3.9140625 gal), or 0.7828125 of the photographed 5-gallon batch. Butter/flour, milk/cream, Cougar Gold, Parmesan and Velveeta agree at this scale. **Correction after rereading the original photo:** Gruyere is 4 quarts per batch in the kitchen photo but 4 pounds in TPP costing; cornstarch is 1/4 cup in the photo but 1/4 pound in costing. These are unresolved source-unit conflicts, not exact formula matches. Owner clarification requested; do not convert volume to weight without supported density or select a source silently.
- G490/H490 pasta 167 oz; G492/H492 dry elbow pasta 10.4375 lb; olive oil 20.875 tbsp. Panko topping G496/H496 41.75 cups, child ingredients rows 498-510. Cooked bacon G512/H512 41.75 oz and G514/H514 bacon bits 2.609375 lb.
- Mashed potatoes G529/H529 2.839 batches; ingredient rows 531-539 give butter 5.678 lb, evaporated milk 5.678 qt, salt 1.4195 cups, white pepper 17.034 tbsp, Yukon potatoes 56.78 lb. Need actual method and yield evidence before presenting as complete recipe.

`Heating_and_Serving_Event_Menu.xlsx` provides actual service methods including asparagus, mac sauce/pasta, chicken roulade, dinner rolls. Preserve operational instructions without spreadsheet row dumps. This source is not covered by recipe-category JSON.

Migration logs explicitly document missing category exports due to 504/blocked report pages. Therefore source archive completeness cannot be inferred from an import receipt. Event-specific costing and other supplied sources recover substantial information despite those gaps.

## Prep adoption / unit reconciliation (current)

`convex/lib/dishRecipeRepair.ts` and `scripts/repair-tpp-recipes.ts` now support explicit prepLinks with reviewed snapshot fields. Actual scratch Convex execution proves linking without duplicate work and preserves completed quantities on later resize. Do not apply the full candidate plan yet: Smore Bar has quart work rows but tablespoon templates (temper chocolate, Nutella, Reese's spread; verify all remaining matches), requiring compatible conversion in server `PrepTask.syncServings` and client `EventPrepTaskSynchronizer`. Both presently multiply template defaultQuantity without converting to the retained work unit. Same-unit links are supported; incompatible links reject before mutation. Recipe relationship changes must also preserve unit correctness.

Live snapshot correction: Infused Water EventDish is 167 servings, whereas source cost recipe is 334. Its prep rows remain 20.88 gallons water / 83.5 lb ice / 4.18 kits. Resolve event serving intent and the kit-per-container source conflict together; do not infer a rate from the wrong denominator.

### Unit reconciliation update

The earlier tablespoon/quart adoption limitation is now fixed in authored client calculation and Manifest server scaling. All nine Smore candidates pass preview. Initial-zero prep failure is also fixed and reproduced through the generated runtime. Prep adoption now uses generated PrepTask.linkRecipe, satisfying culinary/production integration guards. Full suite passes. Outstanding: completed-work increases need additional work tracking; source recipe batch identity/yields and unit conflicts; live repair; remaining requirements in this ledger. No production changes yet.

### Batch reconstruction update

The repair seam supports actual batch ingredient quantities with explicit measured component yield and amount per dish serving. The exact attachment ratio preserves existing demand/cost math (3 batches serving 640 guests for 5-gallon sauce at 3 fl oz/guest). RecipeRepairProjection exposes these fields; CLI --projected-recipes can preview reviewed photo/workbook projections. Existing attachment reuse prevents duplicate demand across new repair operations. Worked generated-runtime example passes at 167 and 200 servings. No complete live-source projection has been applied yet. Component cost panel already labels cost by yield unit via yieldCostLabel; the old Component.liveCostPerGuest property name/comment is misleading but not used by that panel. Nutrition semantics still need review for physical-yield recipes.


### Purchasing queue unsupported recommendation (#333)

The queue added up to 50% demand CV plus par shortfall and ignored stock when recommending purchases. Replaced on this branch with truthful shared stock/reservation/use-by facts and readable linked-order destinations; purchasing quantity computation still needs the separate #327/#328 domain corrections. Actual desktop/mobile fixture checked. No production verification yet.


### Reschedule reconciliation: shared and submitted order runtime matrix

Actual generated-command evidence, 2026-09-09, branch 6df7addd. Issue #328.

- Two events at the same start time each need 10 kg, with 5 kg recorded stock: one shared draft contains 15 kg and two demand links.
- Reschedule one event from July 20 to July 27. EventDish, EventIngredientContribution, IngredientDemand, PurchaseNeed, vendor orders/lines, and demand links are all unchanged. A subsequent servings increase to 120 drives the old-date draft to 17 kg. With the original order submitted, the same edit creates a 2 kg draft on the old date.
- Scratch-only candidate probe (NOT production or an implemented fix): update only the need date and invoke existing PurchaseNeed_reviseRequired. Shared-draft case fails `Guard 3 failed` at draft reassignment; the reaction transaction rolls back. Submitted case creates a 5 kg new-date draft while the original 15 kg pending supply remains on the old date. This is not a safe schedule-only fix or an established supply allocation.

Evidence scripts: `.artifacts/operations-source-study/qualify-reschedule-purchasing.ts` (draft/submitted), `probe-reschedule-reroute.ts` (draft/submitted); JSON before/after evidence stored alongside. No authored tests added, no production writes.

The repair needs coordinated current-date propagation through dish/seed/contribution/demand/need, editable draft contribution removal and both old/new draft reconciliation, and preserved submitted/received order history with explicit supply allocation. Existing reviseRequired also reopens ordered/fulfilled needs, so it cannot stand in for a date-only update that preserves completed work. Calendar boundary/timezone and cross-event stock allocation remain unresolved source/owner inputs tracked with #327.
