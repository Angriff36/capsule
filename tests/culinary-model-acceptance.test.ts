// Revision-2 culinary model — acceptance cases from the naming/mapping proposal.
// Pure-module regression tests over convex/lib/culinaryModel.
import { describe, expect, it } from "vitest";
import {
  componentBatchCost,
  componentContentStatus,
  dishPortionCost,
  type ComponentLike,
  type IngredientLike,
} from "../convex/lib/culinaryModel/costing";
import {
  expandEventDish,
  planSharedBatch,
  purchasingTotals,
  reconcileContributions,
  type DemandLookups,
  type DishLike,
  type EventDishLike,
  type ExistingContributionRow,
} from "../convex/lib/culinaryModel/demand";
import {
  absenceDecision,
  assignOrdinal,
  buildLinkKey,
  mergeConflicts,
  threeWayReconcile,
} from "../convex/lib/culinaryModel/importMapping";
import {
  classifyTppItem,
  suggestLinksForItem,
  type TppMenuItem,
} from "../convex/lib/culinaryModel/tppImport";
import {
  convertQuantity,
  resolveTppUnit,
  toPurchaseBasis,
  type ItemUnitMappingLike,
} from "../convex/lib/culinaryModel/units";

const ingredient = (
  id: string,
  name: string,
  unit: IngredientLike["unit"],
  costPerUnit: number | null,
): IngredientLike => ({ id, name, unit, costPerUnit });
const component = (
  partial: Partial<ComponentLike> & Pick<ComponentLike, "id" | "name">,
): ComponentLike => ({
  yieldQuantity: 1,
  yieldUnit: "batch",
  instructions: null,
  stepCount: 0,
  ingredientLines: [],
  componentLines: [],
  ...partial,
});

const lookups = (args: {
  dishes?: DishLike[];
  components?: ComponentLike[];
  ingredients?: IngredientLike[];
  mappings?: ItemUnitMappingLike[];
  portionSpecs?: DemandLookups["portionSpecs"];
}): DemandLookups => ({
  dishes: new Map((args.dishes ?? []).map((d) => [d.id, d])),
  components: new Map((args.components ?? []).map((c) => [c.id, c])),
  ingredients: new Map((args.ingredients ?? []).map((i) => [i.id, i])),
  portionSpecs: args.portionSpecs ?? new Map(),
  mappings: args.mappings ?? [],
});

const eventDish = (
  partial: Partial<EventDishLike> &
    Pick<EventDishLike, "id" | "dishId" | "quantityServings">,
): EventDishLike => ({
  eventId: "ev1",
  overrides: [],
  prepTasks: [],
  ...partial,
});

describe("A. mozzarella per-portion round trip", () => {
  const mozz = ingredient("ing-mozz", "Mozzarella", "ounce", 0.58);
  const pizza: DishLike = {
    id: "dish-four-cheese",
    name: '14" Four Cheese',
    kind: "food",
    ingredientLines: [
      {
        id: "di-mozz",
        ingredientId: "ing-mozz",
        quantity: 4,
        unit: "ounce",
        quantityBasis: "as_purchased",
      },
    ],
    componentLines: [],
    tasks: [
      {
        id: "dt-portion-mozz",
        name: "Portion mozzarella",
        materialDishIngredientIds: ["di-mozz"],
        materialDishComponentIds: [],
      },
    ],
  };
  const lk = lookups({ dishes: [pizza], ingredients: [mozz] });

  it("2 pizzas -> 8 oz and 3 pizzas -> 12 oz, never multiplied again", () => {
    const two = expandEventDish(
      eventDish({ id: "ed2", dishId: pizza.id, quantityServings: 2 }),
      lk,
    );
    const three = expandEventDish(
      eventDish({ id: "ed3", dishId: pizza.id, quantityServings: 3 }),
      lk,
    );
    expect(two.contributions).toHaveLength(1);
    expect(two.contributions[0]).toMatchObject({
      ingredientId: "ing-mozz",
      quantity: 8,
      unit: "ounce",
      purchasable: true,
      servings: 2,
    });
    expect(three.contributions[0]).toMatchObject({
      quantity: 12,
      unit: "ounce",
    });
    expect(purchasingTotals(three.contributions).totals[0].quantity).toBe(12);
  });
});

describe("B. cut and par-steam potatoes share one requirement", () => {
  const potatoes = ingredient("ing-potato", "Russet potatoes", "pound", 0.6);
  const hash: DishLike = {
    id: "dish-hash",
    name: "Roasted Idaho Potato Breakfast Hash",
    kind: "food",
    ingredientLines: [
      {
        id: "di-potato",
        ingredientId: "ing-potato",
        quantity: 0.375,
        unit: "pound",
        quantityBasis: "raw",
      },
    ],
    componentLines: [],
    tasks: [
      {
        id: "dt-cut",
        name: "Cut potatoes into fork size pieces",
        materialDishIngredientIds: ["di-potato"],
        materialDishComponentIds: [],
      },
      {
        id: "dt-steam",
        name: "Par steam potatoes",
        materialDishIngredientIds: ["di-potato"],
        materialDishComponentIds: [],
      },
    ],
  };
  it("80 servings -> 30 lb once, whatever the task count", () => {
    const demand = expandEventDish(
      eventDish({ id: "ed", dishId: hash.id, quantityServings: 80 }),
      lookups({ dishes: [hash], ingredients: [potatoes] }),
    );
    expect(demand.contributions).toHaveLength(1);
    expect(demand.contributions[0].quantity).toBe(30);
    const withoutSteam = { ...hash, tasks: hash.tasks.slice(0, 1) };
    const again = expandEventDish(
      eventDish({ id: "ed", dishId: hash.id, quantityServings: 80 }),
      lookups({ dishes: [withoutSteam], ingredients: [potatoes] }),
    );
    expect(again.contributions[0].quantity).toBe(30);
  });
});

describe("C/K. Dijon: making task kept, recipe content missing, requirement stays visible", () => {
  const dijon = component({
    id: "cmp-dijon",
    name: "Make dijon vinaigrette dressing",
    yieldQuantity: 1,
    yieldUnit: "quart",
  });
  const dish: DishLike = {
    id: "dish-dijon",
    name: "Dijon Vinaigrette Dressing for Salad",
    kind: "food",
    ingredientLines: [],
    componentLines: [
      {
        id: "dc-dijon",
        componentId: "cmp-dijon",
        yieldQuantity: 1,
        batchMultiplier: 1,
        quantityBasis: "as_produced",
      },
    ],
    tasks: [
      {
        id: "dt-make-dijon",
        name: "Make dijon vinaigrette dressing",
        componentId: "cmp-dijon",
        resolution: "content_missing",
        materialDishIngredientIds: [],
        materialDishComponentIds: ["dc-dijon"],
      },
    ],
  };
  it("classifies the TPP item as a recipe with both_missing, never a portion", () => {
    const item: TppMenuItem = {
      mi_MenuItemSak: 650403,
      mi_SubBusinessSak: 376,
      mi_ItemName: "Make dijon vinaigrette dressing",
      mic_Category: "Prep List Item",
      mi_YieldAmt: 1,
      mi_YieldSak: 29310,
      mi_LastChangeDate: "2020-05-12",
      Recipe: [],
    };
    const cls = classifyTppItem(item);
    expect(cls.role).toBe("recipe");
    expect(cls.contentStatus).toBe("both_missing");
    expect(componentContentStatus(dijon)).toBe("both_missing");
  });
  it("keeps the recipe need and the making step in the unresolved report with no contributions and unknown cost", () => {
    const demand = expandEventDish(
      eventDish({ id: "ed", dishId: dish.id, quantityServings: 40 }),
      lookups({ dishes: [dish], components: [dijon] }),
    );
    expect(demand.contributions).toHaveLength(0);
    expect(demand.recipeNeeds).toHaveLength(1);
    expect(demand.recipeNeeds[0]).toMatchObject({
      componentId: "cmp-dijon",
      contentStatus: "both_missing",
      batchesExact: 40,
    });
    expect(
      demand.unresolved.some(
        (u) => u.kind === "recipe_content" && u.refId === "cmp-dijon",
      ),
    ).toBe(true);
    const cost = componentBatchCost("cmp-dijon", {
      components: new Map([[dijon.id, dijon]]),
      ingredients: new Map(),
      mappings: [],
    });
    expect(cost.confidence).toBe("none");
    expect(cost.knownSubtotal).toBe(0);
    expect(cost.totalLines).toBe(0);
  });
  it("maps the dish row to a dish_component requirement plus a making step, not a portioning step", () => {
    const sub: TppMenuItem = {
      mi_MenuItemSak: 650403,
      mi_SubBusinessSak: 376,
      mi_ItemName: "Make dijon vinaigrette dressing",
      mic_Category: "Prep List Item",
      mi_YieldAmt: 1,
      mi_YieldSak: 29310,
      Recipe: [],
    };
    const parent: TppMenuItem = {
      mi_MenuItemSak: 649093,
      mi_SubBusinessSak: 376,
      mi_ItemName: "Dijon Vinaigrette Dressing for Salad",
      mic_Category: " Finish at Kitchen",
      mi_YieldAmt: 1,
      mi_YieldSak: 29314,
      Recipe: [
        {
          recp_RecipeSak: 900001,
          NAME: "Make dijon vinaigrette dressing",
          recphis_MajorAmt: 2,
          unitMeas_Description: "Oz - Fld",
          recp_SubMenuItemSak: 650403,
          recp_InventorySak: null,
        },
      ],
    };
    const catalog = new Map([
      [sub.mi_MenuItemSak, sub],
      [parent.mi_MenuItemSak, parent],
    ]);
    const links = suggestLinksForItem(parent, catalog);
    const requirement = links.find((l) => l.role === "food_requirement");
    const step = links.find((l) => l.role === "prep_step");
    expect(requirement?.capsuleEntity).toBe("dish_component");
    expect(requirement?.suggestedValues).toMatchObject({
      unit: "fluid_ounce",
      recipeContentStatus: "both_missing",
    });
    expect(step?.suggestedValues).toMatchObject({
      name: "Make dijon vinaigrette dressing",
      resolution: "content_missing",
    });
    expect(String(step?.suggestedValues.name)).not.toMatch(/^Portion/);
    expect(requirement?.linkKey).toBe(
      "tpp_legacy|376|menu_item_recipe_row|900001|food_requirement|0",
    );
  });
});

describe("D. cooked bacon without a confirmed yield", () => {
  const bacon = ingredient("ing-bacon", "Bacon", "pound", 4.5);
  const dish: DishLike = {
    id: "dish-idaho",
    name: '14" Idaho Pizza',
    kind: "food",
    ingredientLines: [
      {
        id: "di-bacon",
        ingredientId: "ing-bacon",
        quantity: 1.5,
        unit: "ounce",
        quantityBasis: "cooked",
      },
    ],
    componentLines: [],
    tasks: [],
  };
  it("counts the stated cooked weight outside the finalized total and fabricates no purchase quantity", () => {
    const demand = expandEventDish(
      eventDish({ id: "ed", dishId: dish.id, quantityServings: 3 }),
      lookups({ dishes: [dish], ingredients: [bacon] }),
    );
    expect(demand.contributions[0]).toMatchObject({
      exactQuantity: 4.5,
      statedUnit: "ounce",
      basisStatus: "yield_not_confirmed",
      purchasable: false,
    });
    const totals = purchasingTotals(demand.contributions);
    expect(totals.complete).toBe(false);
    expect(totals.totals).toHaveLength(0);
    expect(totals.unresolved[0]).toMatchObject({
      quantity: 4.5,
      unit: "ounce",
    });
  });
  it("converts once a yield is confirmed on the ingredient", () => {
    const mappings: ItemUnitMappingLike[] = [
      {
        ingredientId: "ing-bacon",
        kind: "yield",
        unit: "pound",
        equalsQuantity: 0.4,
        equalsUnit: "pound",
        fromBasis: "raw",
        toBasis: "cooked",
      },
    ];
    const result = toPurchaseBasis(4.5, "ounce", "cooked", mappings, {
      itemKind: "ingredient",
      itemId: "ing-bacon",
    });
    expect(result.status).toBe("resolved");
    expect(result.quantity).toBeCloseTo(11.25, 6);
  });
  it("matching units alone do not resolve an unknown basis", () => {
    const demand = expandEventDish(
      eventDish({ id: "ed", dishId: dish.id, quantityServings: 1 }),
      lookups({
        dishes: [
          {
            ...dish,
            ingredientLines: [
              {
                id: "di",
                ingredientId: "ing-bacon",
                quantity: 1,
                unit: "pound",
                quantityBasis: "unknown",
              },
            ],
          },
        ],
        ingredients: [bacon],
      }),
    );
    expect(demand.contributions[0]).toMatchObject({
      unitStatus: "resolved",
      basisStatus: "basis_unknown",
      purchasable: false,
    });
  });
});

describe("J. shared batch shares reconcile to formula batches", () => {
  const butterBlend = ingredient(
    "ing-butter",
    "Whipped butter blend",
    "pound",
    3.2,
  );
  const honey = ingredient("ing-honey", "Honey", "cup", 1.1);
  const cinnamon = ingredient("ing-cinnamon", "Cinnamon", "tablespoon", 0.2);
  const salt = ingredient("ing-salt", "Salt", "teaspoon", 0.01);
  const honeyButter = component({
    id: "cmp-honey-butter",
    name: "Honey cinnamon butter",
    yieldQuantity: 2,
    yieldUnit: "quart",
    stepCount: 2,
    ingredientLines: [
      {
        id: "cl-butter",
        ingredientId: "ing-butter",
        quantity: 1,
        unit: "tub",
        quantityBasis: "as_purchased",
      },
      {
        id: "cl-honey",
        ingredientId: "ing-honey",
        quantity: 1,
        unit: "cup",
        quantityBasis: "as_purchased",
      },
      {
        id: "cl-cinnamon",
        ingredientId: "ing-cinnamon",
        quantity: 2,
        unit: "tablespoon",
        quantityBasis: "as_purchased",
      },
      {
        id: "cl-salt",
        ingredientId: "ing-salt",
        quantity: 1,
        unit: "teaspoon",
        quantityBasis: "as_purchased",
      },
    ],
  });
  const lk = lookups({
    components: [honeyButter],
    ingredients: [butterBlend, honey, cinnamon, salt],
  });

  it("splits two batches into 0.875 + 0.13125 + 0.99375 surplus, counted once, tub unresolved", () => {
    const plan = planSharedBatch({
      batchId: "pb1",
      component: honeyButter,
      allocations: [
        {
          eventId: "ev-5673",
          eventDishId: "ed-5673",
          quantity: 1.75,
          unit: "quart",
        },
        {
          eventId: "ev-5826",
          eventDishId: "ed-5826",
          quantity: 1.05,
          unit: "cup",
        },
      ],
      lookups: lk,
      rounding: { scope: "production_group", rule: "whole_up" },
    });
    expect(plan.plannedExact).toBeCloseTo(2.0125, 6);
    expect(plan.plannedRounded).toBe(4);
    expect(plan.surplusQuantity).toBeCloseTo(1.9875, 6);
    const shares = plan.allocations.map((a) => a.formulaShare);
    expect(shares[0]).toBeCloseTo(0.875, 6);
    expect(shares[1]).toBeCloseTo(0.13125, 6);
    expect(shares[2]).toBeCloseTo(0.99375, 6);
    expect(shares.reduce((s, x) => s + x, 0)).toBeCloseTo(2, 6);
    expect(plan.allocations[2].isSurplus).toBe(true);
    // Honey: 1 cup per batch x 2 batches = 2 cups across all owners, once.
    const honeyRows = plan.contributions.filter(
      (c) => c.ingredientId === "ing-honey",
    );
    expect(honeyRows.reduce((s, c) => s + c.quantity, 0)).toBeCloseTo(2, 6);
    expect(honeyRows.map((c) => c.ownership)).toEqual([
      "batch_allocation",
      "batch_allocation",
      "batch_surplus",
    ]);
    // Tub has no mapping: visible, not purchasable, not fabricated.
    const tubRows = plan.contributions.filter(
      (c) => c.ingredientId === "ing-butter",
    );
    expect(
      tubRows.every(
        (c) => c.unitStatus === "unresolved_no_mapping" && !c.purchasable,
      ),
    ).toBe(true);
    expect(purchasingTotals(plan.contributions).complete).toBe(false);
  });
  it("without rounding the surplus is zero and shares equal exact batches", () => {
    const plan = planSharedBatch({
      batchId: "pb2",
      component: honeyButter,
      allocations: [
        {
          eventId: "ev-5673",
          eventDishId: "ed-5673",
          quantity: 1.75,
          unit: "quart",
        },
        {
          eventId: "ev-5826",
          eventDishId: "ed-5826",
          quantity: 1.05,
          unit: "cup",
        },
      ],
      lookups: lk,
      rounding: { scope: "none", rule: "none" },
    });
    expect(plan.surplusQuantity).toBe(0);
    expect(plan.allocations).toHaveLength(2);
    expect(plan.batchesRounded).toBeCloseTo(1.00625, 6);
  });
});

describe("repeat runs replace contributions idempotently", () => {
  const flour = ingredient("ing-flour", "Flour", "ounce", 0.05);
  const dish: DishLike = {
    id: "dish-a",
    name: "A",
    kind: "food",
    ingredientLines: [
      {
        id: "di-flour",
        ingredientId: "ing-flour",
        quantity: 2,
        unit: "ounce",
        quantityBasis: "as_purchased",
      },
    ],
    componentLines: [],
    tasks: [],
  };
  it("second plan creates nothing and supersedes nothing; a servings change updates in place", () => {
    const lk = lookups({ dishes: [dish], ingredients: [flour] });
    const first = expandEventDish(
      eventDish({ id: "ed", dishId: dish.id, quantityServings: 10 }),
      lk,
    );
    const plan1 = reconcileContributions([], first.contributions, "ed");
    expect(plan1.create).toHaveLength(1);
    const existing: ExistingContributionRow[] = plan1.create.map((c, i) => ({
      id: `row${i}`,
      sourceKey: c.sourceKey,
      eventDishId: c.eventDishId,
      componentId: c.componentId,
      ingredientId: c.ingredientId,
      unit: c.unit,
      quantity: c.quantity,
      deletedAt: null,
    }));
    const plan2 = reconcileContributions(existing, first.contributions, "ed");
    expect(plan2.create).toHaveLength(0);
    expect(plan2.supersede).toHaveLength(0);
    expect(plan2.unchanged).toHaveLength(1);
    const second = expandEventDish(
      eventDish({ id: "ed", dishId: dish.id, quantityServings: 12 }),
      lk,
    );
    const plan3 = reconcileContributions(existing, second.contributions, "ed");
    expect(plan3.update).toHaveLength(1);
    expect(plan3.create).toHaveLength(0);
  });
  it("adopts a legacy reaction row instead of duplicating it", () => {
    const lk = lookups({ dishes: [dish], ingredients: [flour] });
    const next = expandEventDish(
      eventDish({ id: "ed", dishId: dish.id, quantityServings: 10 }),
      lk,
    );
    const legacy: ExistingContributionRow[] = [
      {
        id: "legacy",
        sourceKey: null,
        eventDishId: "ed",
        componentId: null,
        ingredientId: "ing-flour",
        unit: "ounce",
        quantity: 20,
        deletedAt: null,
      },
    ];
    const plan = reconcileContributions(legacy, next.contributions, "ed");
    expect(plan.create).toHaveLength(0);
    expect(plan.update.map((u) => u.id)).toEqual(["legacy"]);
  });
});

describe("H/G. event overrides change demand without touching the master", () => {
  const garlic = ingredient("ing-garlic", "Creamy garlic spread", "ounce", 0.3);
  const oil = ingredient("ing-oil", "Olive oil", "fluid_ounce", 0.2);
  const salad: DishLike = {
    id: "dish-salad",
    name: "Mixed Green Salad with Creamy Garlic",
    kind: "food",
    ingredientLines: [
      {
        id: "di-garlic",
        ingredientId: "ing-garlic",
        quantity: 2,
        unit: "ounce",
        quantityBasis: "as_purchased",
      },
    ],
    componentLines: [],
    tasks: [],
  };
  it("removes one portion of creamy garlic and adds oil for one portion", () => {
    const lk = lookups({ dishes: [salad], ingredients: [garlic, oil] });
    const demand = expandEventDish(
      eventDish({
        id: "ed",
        dishId: salad.id,
        quantityServings: 12,
        overrides: [
          {
            id: "ov1",
            kind: "remove",
            targetDishIngredientId: "di-garlic",
            portionsAffected: 1,
          },
          {
            id: "ov2",
            kind: "add",
            ingredientId: "ing-oil",
            quantity: 1,
            unit: "fluid_ounce",
            portionsAffected: 1,
          },
        ],
      }),
      lk,
    );
    const garlicRow = demand.contributions.find(
      (c) => c.ingredientId === "ing-garlic",
    );
    const oilRow = demand.contributions.find(
      (c) => c.ingredientId === "ing-oil",
    );
    expect(garlicRow?.quantity).toBe(22);
    expect(oilRow?.quantity).toBe(1);
    expect(salad.ingredientLines[0].quantity).toBe(2);
  });
});

describe("I. make-or-portion is one pending choice, one branch after the pick", () => {
  const spread = ingredient("ing-spread", "Creamy Garlic Spread", "quart", 6);
  const recipe = component({
    id: "cmp-garlic",
    name: "Make creamy garlic",
    yieldQuantity: 1,
    yieldUnit: "quart",
    stepCount: 1,
    ingredientLines: [
      {
        id: "cl",
        ingredientId: "ing-spread",
        quantity: 1,
        unit: "quart",
        quantityBasis: "as_purchased",
      },
    ],
  });
  const dish: DishLike = {
    id: "dish-platter",
    name: "Fruit & Veggie Platter",
    kind: "food",
    ingredientLines: [
      {
        id: "di-spread",
        ingredientId: "ing-spread",
        quantity: 0.125,
        unit: "quart",
        quantityBasis: "as_purchased",
      },
    ],
    componentLines: [
      {
        id: "dc-garlic",
        componentId: "cmp-garlic",
        yieldQuantity: 8,
        batchMultiplier: 1,
        quantityBasis: "as_produced",
      },
    ],
    tasks: [
      {
        id: "dt-choice",
        name: "Make or portion creamy garlic",
        resolution: "choice_pending",
        choiceOptions: ["make", "portion"],
        materialDishIngredientIds: ["di-spread"],
        materialDishComponentIds: ["dc-garlic"],
      },
    ],
  };
  const lk = lookups({
    dishes: [dish],
    components: [recipe],
    ingredients: [spread],
  });
  it("contributes nothing while pending and is listed", () => {
    const demand = expandEventDish(
      eventDish({ id: "ed", dishId: dish.id, quantityServings: 8 }),
      lk,
    );
    expect(demand.contributions).toHaveLength(0);
    expect(demand.unresolved.some((u) => u.kind === "choice_pending")).toBe(
      true,
    );
  });
  it("after choosing portion only the ingredient line contributes", () => {
    const demand = expandEventDish(
      eventDish({
        id: "ed",
        dishId: dish.id,
        quantityServings: 8,
        prepTasks: [
          {
            dishTaskId: "dt-choice",
            resolution: "resolved",
            chosenOption: "portion",
            componentId: null,
            ingredientId: null,
          },
        ],
      }),
      lk,
    );
    expect(demand.contributions).toHaveLength(1);
    expect(demand.contributions[0]).toMatchObject({
      sourceDishIngredientId: "di-spread",
      quantity: 1,
    });
  });
});

describe("nested recipes keep quantities and partial costs", () => {
  const cream = ingredient("ing-cream", "Heavy cream", "quart", 5);
  const garlic = ingredient("ing-garlic", "Garlic", "ounce", null);
  const alfredo = component({
    id: "cmp-alfredo",
    name: "Alfredo sauce",
    yieldQuantity: 1,
    yieldUnit: "gallon",
    stepCount: 3,
    ingredientLines: [
      {
        id: "l1",
        ingredientId: "ing-cream",
        quantity: 4,
        unit: "quart",
        quantityBasis: "as_purchased",
      },
      {
        id: "l2",
        ingredientId: "ing-garlic",
        quantity: 2,
        unit: "ounce",
        quantityBasis: "as_purchased",
      },
    ],
  });
  const mac = component({
    id: "cmp-mac",
    name: "Mac sauce",
    yieldQuantity: 5,
    yieldUnit: "gallon",
    stepCount: 2,
    componentLines: [
      {
        id: "n1",
        childComponentId: "cmp-alfredo",
        quantity: 2,
        unit: "gallon",
      },
    ],
  });
  const cyclic = component({
    id: "cmp-cyc",
    name: "Cyclic",
    yieldQuantity: 1,
    yieldUnit: "batch",
    stepCount: 1,
    componentLines: [
      { id: "c1", childComponentId: "cmp-cyc2", quantity: 1, unit: "batch" },
    ],
  });
  const cyclic2 = component({
    id: "cmp-cyc2",
    name: "Cyclic 2",
    yieldQuantity: 1,
    yieldUnit: "batch",
    stepCount: 1,
    componentLines: [
      { id: "c2", childComponentId: "cmp-cyc", quantity: 1, unit: "batch" },
    ],
  });
  const cl = {
    components: new Map([alfredo, mac, cyclic, cyclic2].map((c) => [c.id, c])),
    ingredients: new Map([cream, garlic].map((i) => [i.id, i])),
    mappings: [] as ItemUnitMappingLike[],
  };

  it("expands a nested recipe into leaf ingredient demand with the path recorded", () => {
    const dish: DishLike = {
      id: "d",
      name: "Mac",
      kind: "food",
      ingredientLines: [],
      componentLines: [
        {
          id: "dc",
          componentId: "cmp-mac",
          yieldQuantity: 10,
          batchMultiplier: 1,
        },
      ],
      tasks: [],
    };
    const demand = expandEventDish(
      eventDish({ id: "ed", dishId: "d", quantityServings: 10 }),
      {
        ...lookups({ dishes: [dish] }),
        components: cl.components,
        ingredients: cl.ingredients,
      },
    );
    const creamRow = demand.contributions.find(
      (c) => c.ingredientId === "ing-cream",
    );
    // 10 servings / 10 yield = 1 batch mac = 2 gal alfredo = 2 batches alfredo = 8 qt cream
    expect(creamRow?.quantity).toBe(8);
    expect(creamRow?.componentPath).toEqual(["cmp-mac", "cmp-alfredo"]);
  });
  it("reports partial cost with the known subtotal apart from unknown lines", () => {
    const alfredoCost = componentBatchCost("cmp-alfredo", cl);
    expect(alfredoCost.confidence).toBe("partial");
    expect(alfredoCost.knownSubtotal).toBe(20);
    expect(alfredoCost.unknownLines).toBe(1);
    const macCost = componentBatchCost("cmp-mac", cl);
    expect(macCost.confidence).toBe("none");
    expect(macCost.lines[0].reason).toBe("sub-recipe partial");
  });
  it("rejects a recipe cycle in costing and demand", () => {
    expect(componentBatchCost("cmp-cyc", cl).cycle).toEqual([
      "cmp-cyc",
      "cmp-cyc2",
      "cmp-cyc",
    ]);
    const dish: DishLike = {
      id: "d",
      name: "Cyc",
      kind: "food",
      ingredientLines: [],
      componentLines: [
        {
          id: "dc",
          componentId: "cmp-cyc",
          yieldQuantity: 1,
          batchMultiplier: 1,
        },
      ],
      tasks: [],
    };
    const demand = expandEventDish(
      eventDish({ id: "ed", dishId: "d", quantityServings: 1 }),
      {
        ...lookups({ dishes: [dish] }),
        components: cl.components,
        ingredients: cl.ingredients,
      },
    );
    expect(demand.unresolved.some((u) => u.kind === "cycle")).toBe(true);
  });
  it("prices a dish portion through a portion spec", () => {
    const dough = component({
      id: "cmp-dough",
      name: "Pizza dough",
      yieldQuantity: 1,
      yieldUnit: "batch",
      stepCount: 4,
      ingredientLines: [
        {
          id: "f",
          ingredientId: "ing-flour",
          quantity: 90,
          unit: "ounce",
          quantityBasis: "as_purchased",
        },
      ],
    });
    const flour = ingredient("ing-flour", "High-gluten flour", "ounce", 0.04);
    const report = dishPortionCost(
      [
        {
          id: "dc-dough",
          kind: "component",
          refId: "cmp-dough",
          quantity: 1,
          unit: "piece",
          pieceCount: 1.05,
          portionSpecPiecesPerBatch: 15,
        },
      ],
      {
        components: new Map([[dough.id, dough]]),
        ingredients: new Map([[flour.id, flour]]),
        mappings: [],
      },
    );
    expect(report.confidence).toBe("complete");
    expect(report.knownSubtotal).toBeCloseTo((90 * 0.04 * 1.05) / 15, 2);
  });
});

describe("units", () => {
  it("converts inside a dimension and refuses across without a density", () => {
    expect(convertQuantity(1.05, "cup", "quart").quantity).toBeCloseTo(
      0.2625,
      6,
    );
    expect(convertQuantity(2, "fluid_ounce", "quart").quantity).toBeCloseTo(
      0.0625,
      6,
    );
    expect(convertQuantity(1, "cup", "pound").status).toBe(
      "unresolved_no_density",
    );
    const density: ItemUnitMappingLike[] = [
      {
        ingredientId: "x",
        kind: "density",
        unit: "cup",
        equalsQuantity: 0.5,
        equalsUnit: "pound",
      },
    ];
    expect(
      convertQuantity(2, "cup", "pound", density, {
        itemKind: "ingredient",
        itemId: "x",
      }),
    ).toMatchObject({ quantity: 1, status: "resolved" });
  });
  it("count units need an item pack mapping", () => {
    expect(convertQuantity(1, "tub", "pound").status).toBe(
      "unresolved_no_mapping",
    );
    const pack: ItemUnitMappingLike[] = [
      {
        ingredientId: "b",
        kind: "pack",
        unit: "tub",
        equalsQuantity: 3,
        equalsUnit: "pound",
      },
    ];
    expect(
      convertQuantity(2, "tub", "ounce", pack, {
        itemKind: "ingredient",
        itemId: "b",
      }).quantity,
    ).toBeCloseTo(96, 6);
  });
  it("keeps TPP Cup ambiguous and maps Oz - Fld to fluid_ounce", () => {
    expect(resolveTppUnit("Oz - Fld")).toMatchObject({
      unit: "fluid_ounce",
      status: "resolved",
    });
    expect(resolveTppUnit("Oz - Dry")).toMatchObject({ unit: "ounce" });
    expect(resolveTppUnit("Cup")).toMatchObject({
      unit: null,
      status: "unresolved_ambiguous_source",
    });
  });
});

describe("identity and re-import", () => {
  it("builds account-scoped keys and gives one item several roles by row", () => {
    const mozz: TppMenuItem = {
      mi_MenuItemSak: 649296,
      mi_SubBusinessSak: 376,
      mi_ItemName: "Portion Mozzarella",
      mic_Category: "Prep List Item",
      mi_YieldAmt: 1,
      mi_YieldSak: 29312,
      Recipe: [
        {
          recp_RecipeSak: 887804,
          NAME: "Mozzarella",
          recphis_MajorAmt: 1,
          unitMeas_Description: "Pound",
          recp_SubMenuItemSak: null,
          recp_InventorySak: 417053,
        },
      ],
    };
    const lasagna: TppMenuItem = {
      mi_MenuItemSak: 648570,
      mi_SubBusinessSak: 376,
      mi_ItemName: "5 Layer Lasagna",
      mic_Category: " Finish at Kitchen",
      mi_YieldAmt: 1,
      mi_YieldSak: 29328,
      Recipe: [
        {
          recp_RecipeSak: 889446,
          NAME: "Portion Mozzarella",
          recphis_MajorAmt: 1,
          unitMeas_Description: "Oz - Dry",
          recp_SubMenuItemSak: 649296,
          recp_InventorySak: null,
        },
      ],
    };
    const ziti: TppMenuItem = {
      ...lasagna,
      mi_MenuItemSak: 648536,
      mi_ItemName: "Baked Ziti",
      Recipe: [
        { ...lasagna.Recipe[0], recp_RecipeSak: 944153, recphis_MajorAmt: 2 },
      ],
    };
    const catalog = new Map(
      [mozz, lasagna, ziti].map((i) => [i.mi_MenuItemSak, i]),
    );
    expect(classifyTppItem(mozz).role).toBe("portion_pattern");
    const l1 = suggestLinksForItem(lasagna, catalog);
    const l2 = suggestLinksForItem(ziti, catalog);
    expect(l1.map((l) => l.linkKey)).toEqual([
      "tpp_legacy|376|menu_item|648570|dish|0",
      "tpp_legacy|376|menu_item_recipe_row|889446|food_requirement|0",
      "tpp_legacy|376|menu_item_recipe_row|889446|prep_step|0",
    ]);
    expect(l2.map((l) => l.linkKey)).toEqual([
      "tpp_legacy|376|menu_item|648536|dish|0",
      "tpp_legacy|376|menu_item_recipe_row|944153|food_requirement|0",
      "tpp_legacy|376|menu_item_recipe_row|944153|prep_step|0",
    ]);
    expect(l1[1].suggestedValues.quantity).toBe(1);
    expect(l2[1].suggestedValues.quantity).toBe(2);
    expect(new Set([...l1, ...l2].map((l) => l.linkKey)).size).toBe(6);
    expect(
      buildLinkKey({
        sourceSystem: "tpp_legacy",
        sourceAccount: null,
        recordType: "menu_item",
        externalId: "1",
        role: null,
        ordinal: null,
      }),
    ).toBe("tpp_legacy||menu_item|1||0");
    expect(assignOrdinal([0, 1])).toBe(2);
  });
  it("identical edits on both sides reconcile without a conflict and advance the baseline", () => {
    const r = threeWayReconcile({
      applied: { name: "Old", yield: 1 },
      capsule: { name: "New", yield: 1 },
      source: { name: "New", yield: 2 },
      fields: ["name", "yield"],
    });
    expect(r.conflicts).toHaveLength(0);
    expect(r.agreed).toEqual(["name"]);
    expect(r.writes).toEqual({ yield: 2 });
    expect(r.newApplied).toEqual({ name: "New", yield: 2 });
  });
  it("keeps Capsule edits when the source is unchanged, conflicts when all three differ", () => {
    const r = threeWayReconcile({
      applied: { name: "A", yield: 1 },
      capsule: { name: "B", yield: 3 },
      source: { name: "A", yield: 2 },
      fields: ["name", "yield"],
    });
    expect(r.kept).toEqual(["name"]);
    expect(r.conflicts).toEqual([
      { field: "yield", appliedValue: 1, capsuleValue: 3, sourceValue: 2 },
    ]);
    expect(r.newApplied).toEqual({ name: "A", yield: 1 });
  });
  it("does not re-raise an unchanged pending conflict", () => {
    const actions = mergeConflicts(
      [{ id: "c1", field: "yield", sourceValue: 2, status: "pending" }],
      [{ field: "yield", appliedValue: 1, capsuleValue: 3, sourceValue: 2 }],
      "v2",
    );
    expect(actions).toEqual([{ action: "noop", id: "c1", field: "yield" }]);
    const updated = mergeConflicts(
      [{ id: "c1", field: "yield", sourceValue: 2, status: "pending" }],
      [{ field: "yield", appliedValue: 1, capsuleValue: 3, sourceValue: 5 }],
      "v3",
    );
    expect(updated[0].action).toBe("update");
  });
  it("absence from a filtered export never supersedes", () => {
    expect(
      absenceDecision({
        seenInRun: false,
        runIsFullCatalog: false,
        approvedSupersede: false,
      }),
    ).toBe("keep");
    expect(
      absenceDecision({
        seenInRun: false,
        runIsFullCatalog: true,
        approvedSupersede: false,
      }),
    ).toBe("keep");
    expect(
      absenceDecision({
        seenInRun: false,
        runIsFullCatalog: false,
        approvedSupersede: false,
        evidence: { recordDeleted: true },
      }),
    ).toBe("supersede");
  });
});

describe("review fixes: adjust override and duplicate sub-recipe edges", () => {
  const cream = ingredient("ing-cream", "Heavy cream", "quart", 5);
  const sauce = component({
    id: "cmp-sauce",
    name: "Sauce",
    yieldQuantity: 1,
    yieldUnit: "quart",
    stepCount: 1,
    ingredientLines: [
      {
        id: "sl",
        ingredientId: "ing-cream",
        quantity: 1,
        unit: "quart",
        quantityBasis: "as_purchased",
      },
    ],
  });
  it("an adjust override on a recipe line keeps the affected portions at the override quantity", () => {
    const dish: DishLike = {
      id: "d",
      name: "Pasta",
      kind: "food",
      ingredientLines: [],
      componentLines: [
        {
          id: "dc-sauce",
          componentId: "cmp-sauce",
          yieldQuantity: 8,
          batchMultiplier: 1,
        },
      ],
      tasks: [],
    };
    const lk = lookups({
      dishes: [dish],
      components: [sauce],
      ingredients: [cream],
    });
    const demand = expandEventDish(
      eventDish({
        id: "ed",
        dishId: "d",
        quantityServings: 8,
        overrides: [
          {
            id: "ov",
            kind: "adjust",
            targetDishComponentId: "dc-sauce",
            quantity: 0.25,
            unit: "quart",
            portionsAffected: 2,
          },
        ],
      }),
      lk,
    );
    // 6 portions at 1/8 batch each = 0.75 qt, plus 2 portions at 0.25 qt = 0.5 qt.
    const total = demand.contributions.reduce((s, c) => s + c.quantity, 0);
    expect(total).toBeCloseTo(1.25, 6);
    expect(demand.contributions).toHaveLength(2);
  });
  it("two edges to the same sub-recipe under one parent keep distinct keys", () => {
    const parent = component({
      id: "cmp-parent",
      name: "Parent",
      yieldQuantity: 1,
      yieldUnit: "batch",
      stepCount: 1,
      componentLines: [
        {
          id: "edge-a",
          childComponentId: "cmp-sauce",
          quantity: 1,
          unit: "quart",
        },
        {
          id: "edge-b",
          childComponentId: "cmp-sauce",
          quantity: 2,
          unit: "quart",
        },
      ],
    });
    const dish: DishLike = {
      id: "d2",
      name: "Double",
      kind: "food",
      ingredientLines: [],
      componentLines: [
        {
          id: "dc-parent",
          componentId: "cmp-parent",
          yieldQuantity: 1,
          batchMultiplier: 1,
        },
      ],
      tasks: [],
    };
    const lk = lookups({
      dishes: [dish],
      components: [parent, sauce],
      ingredients: [cream],
    });
    const demand = expandEventDish(
      eventDish({ id: "ed2", dishId: "d2", quantityServings: 1 }),
      lk,
    );
    expect(demand.contributions).toHaveLength(2);
    expect(new Set(demand.contributions.map((c) => c.sourceKey)).size).toBe(2);
    const plan = reconcileContributions([], demand.contributions, "ed2");
    expect(plan.create).toHaveLength(2);
  });
});
