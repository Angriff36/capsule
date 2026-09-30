/**
 * Runtime proof (AC-468, BE-10.3): matching ingredients in units that convert
 * add up on one weekly line; amounts in units that do not convert are never
 * added to them. They stay on their own line and the line names the problem.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import { orderLineUnitIssues } from "../../src/features/inventory/orderLineUnitIssues";
import {
  approvedEvent,
  drafts,
  harness,
  linkedEventIds,
  linesOf,
  liveRows,
  rolesFor,
  runner,
  seedCatalog,
  type DemandLinkRow,
} from "./weekly-purchasing.runtime.helpers";

const M = api.mutations;

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

/** Another dish whose recipe uses the same ingredient in another unit. */
async function dishUsing(
  proof: ReturnType<typeof harness>,
  tenantId: string,
  ingredientId: string,
  quantity: number,
  unit: string,
  name: string,
) {
  const kitchen = runner(proof, rolesFor(proof, tenantId).kitchen);
  const component = await kitchen(M.Component_createViaDraft, {
    name: `${name} base`,
    yieldQuantity: 1,
    yieldUnit: "portion",
    batchMultiplier: 1,
  });
  await kitchen(M.ComponentIngredient_createViaAdd, {
    componentId: component.docId,
    ingredientId,
    quantity,
    unit,
  });
  await kitchen(M.Component_publishVersion, {
    docId: component.docId,
    version: 1,
  });
  const dish = await kitchen(M.Dish_createViaIntroduce, {
    name,
    portionSize: 1,
    portionUnit: "portion",
    category: "bread",
  });
  await kitchen(M.DishComponent_createViaAttach, {
    dishId: dish.docId,
    componentId: component.docId,
    yieldQuantity: 1,
    batchMultiplier: 1,
  });
  return dish.docId;
}

describe("runtime proof: units that do not convert stay apart (AC-468)", () => {
  it("two demands in incompatible units keep separate lines and the ingredient shows a named review issue", async () => {
    const proof = harness();
    const tenantId = "tenant-ac468-unit-review";
    const roles = rolesFor(proof, tenantId);
    const catalog = await seedCatalog(proof, tenantId, [
      { name: "Sugar", perServing: 0.1 },
    ]);
    const [sugarId] = catalog.ingredientIds as [string];
    // Grams convert to the kilogram catalog unit; cups do not (no weight
    // for a cup of sugar is recorded).
    const gramDish = await dishUsing(
      proof,
      tenantId,
      sugarId,
      50,
      "gram",
      "Gram dish",
    );
    const cupDish = await dishUsing(
      proof,
      tenantId,
      sugarId,
      0.5,
      "cup",
      "Cup dish",
    );

    // One event uses sugar by weight AND by the cup; another only by the cup.
    const mixed = await approvedEvent(proof, tenantId, {
      title: "AC-468 weight and cups",
      headcount: 20,
      dishIds: [catalog.dishIds[0]!, gramDish, cupDish],
    });
    const cupsOnly = await approvedEvent(proof, tenantId, {
      title: "AC-468 cups only",
      headcount: 10,
      dishIds: [cupDish],
    });

    const demands = await liveRows<{
      _id: string;
      tenantId: string;
      eventId: string;
      requiredQuantity: number;
      unit: string;
      unitReviewReason?: string | null;
    }>(roles.procurement, "ingredientDemands", tenantId);
    const mixedDemand = demands.find((d) => d.eventId === mixed)!;
    const cupsDemand = demands.find((d) => d.eventId === cupsOnly)!;
    // 20 x 0.1 kg + 20 x 50 g = 3 kg; the 10 cups are never added to it.
    expect(mixedDemand.unit).toBe("kilogram");
    expect(Number(mixedDemand.requiredQuantity)).toBeCloseTo(3, 4);
    expect(mixedDemand.unitReviewReason).toMatch(
      /don't turn into kilogram, so they are left out/,
    );
    // All cups: kept in cups, on its own, and named.
    expect(cupsDemand.unit).toBe("cup");
    expect(Number(cupsDemand.requiredQuantity)).toBeCloseTo(5, 4);
    expect(cupsDemand.unitReviewReason).toMatch(
      /in cup, but the item is bought by the kilogram/,
    );

    const [draft] = await drafts(roles.procurement, tenantId);
    const lines = (
      await linesOf(roles.procurement, tenantId, draft!._id)
    ).filter((line) => line.ingredientId === sugarId);
    expect(lines).toHaveLength(2);
    const kg = lines.find((line) => line.unit === "kilogram");
    expect(Number(kg!.orderedQuantity)).toBeCloseTo(3, 4);
    expect(await linkedEventIds(roles.procurement, tenantId, kg!._id)).toEqual([
      mixed,
    ]);
    const cups = lines.find((line) => line.unit === "cup");
    expect(Number(cups!.orderedQuantity)).toBeCloseTo(5, 4);
    expect(
      await linkedEventIds(roles.procurement, tenantId, cups!._id),
    ).toEqual([cupsOnly]);

    // The order page names the issue on each line it touches.
    const issues = orderLineUnitIssues({
      lines,
      links: await liveRows<DemandLinkRow>(
        roles.procurement,
        "vendorOrderLineDemands",
        tenantId,
      ),
      demands,
    });
    expect(issues.get(kg!._id)).toEqual([
      { eventId: mixed, reason: mixedDemand.unitReviewReason },
    ]);
    expect(issues.get(cups!._id)).toEqual([
      { eventId: cupsOnly, reason: cupsDemand.unitReviewReason },
    ]);
  });
});
