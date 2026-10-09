/**
 * Dish pickers search by name, a dish page reads its own family, and the
 * new-dish form reads the newest dishes' facets; none reads the whole
 * catalog, and none shows another company's dishes.
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";

describe("dish lookup by name, family and facets", () => {
  it("finds by name, groups a family and stays inside the company", async () => {
    const proof = createManifestTestContext({
      convexTest: convexTest as never,
      schema,
      modules,
    });
    const kitchen = proof.asRole({
      subject: "dish-search-kitchen",
      role: "kitchen_manager",
      tenantId: "tenant-dish-search-a",
    });
    const other = proof.asRole({
      subject: "dish-search-other",
      role: "kitchen_manager",
      tenantId: "tenant-dish-search-b",
    });
    const make = async (actor: typeof kitchen, name: string) =>
      (
        (await proof.executeCommand(
          actor,
          api.mutations.Dish_createViaIntroduce,
          { name, portionSize: 1, portionUnit: "portion" },
        )) as { docId: string }
      ).docId;
    const salad = await make(kitchen, "Garden salad");
    await make(kitchen, "Chicken roulade");
    await make(other, "Garden salad deluxe");

    const found = (await kitchen.query(api.dishLookup.search, {
      text: "salad",
    })) as Array<{ name: string }>;
    expect(found.map((row) => row.name)).toEqual(["Garden salad"]);

    const family = (await kitchen.query(api.dishLookup.family, {
      dishId: salad,
    })) as Array<{ _id: string }>;
    expect(family.map((row) => row._id)).toEqual([salad]);

    const facets = (await kitchen.query(
      api.dishLookup.facets,
      {},
    )) as unknown[];
    expect(facets).toHaveLength(2);
  });
});
