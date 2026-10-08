/**
 * Old-system equipment list (PL-SOURCE-DATASETS, AC-057 "equipment
 * references"): the tool lines of the Inventory In-Stock report become
 * equipment items.
 *
 *   - each line becomes one item tagged TPP-<name> with its category, count,
 *     storage place and old-system details (group, bin, vendor, last change)
 *   - a count of 0 comes in as 0
 *   - reading the same list again adds nothing and changes nothing; a count
 *     changed in Capsule stays and is listed as differing
 *   - an item made by hand (or from Goodshuffle) under the same name is left
 *     alone; a cook may not bring items in
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { TppEquipmentRow } from "../../src/lib/tppInventoryList";
import {
  harness,
  rolesFor,
  runner,
} from "./buyer-qty-override-survival.runtime.helpers";

beforeAll(() => {
  process.env.CONVEX_FIELD_ENCRYPTION_KEY ||=
    "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
});

const TENANT = "tenant-tpp-equipment-items";

const row = (
  name: string,
  more: Partial<TppEquipmentRow> = {},
): TppEquipmentRow => ({
  name,
  group: "(DAY OF) Must Pack BOH Items",
  bin: "",
  vendor: "",
  inStock: 0,
  storage: "",
  lastUpdated: "2020-03-27",
  ...more,
});

const LIST: TppEquipmentRow[] = [
  row("Tongs - Kitchen", {
    group: "(DAY OF) Chef Pack Based On Need",
    inStock: 10,
    storage: "Kitchen",
  }),
  row("Stir Sticks in Container", { bin: "D12", storage: "Warehouse" }),
  row("Kitchen Mat", { vendor: "Mangia", inStock: 8 }),
  row("Fire Extinguisher", { group: "2. CHECK ITEMS IN TRAILER" }),
  row("Coffee urn"),
];

type ImportResult = {
  added: number;
  updated: number;
  unchanged: number;
  sameName: string[];
  countDiffers: { name: string; inFile: number; inCapsule: number }[];
};

describe("runtime proof: old-system equipment list", () => {
  it("brings tools in once, keeps Capsule counts, leaves hand-made items alone", async () => {
    const proof = harness();
    const roles = rolesFor(proof, TENANT);
    const inventory = runner(proof, roles.inventory);
    const read = async () =>
      (
        (await roles.inventory.query(api.queries.listEquipment, {})) as any[]
      ).filter((item) => item.deletedAt == null);
    const bringIn = (rows: TppEquipmentRow[]) =>
      roles.inventory.mutation(api.tppEquipmentItems.importTppEquipmentItems, {
        rows,
      }) as Promise<ImportResult>;

    await inventory(api.mutations.Equipment_createViaRegister, {
      name: "Coffee urn",
      assetTag: "URN-1",
      category: "Catering Equipment",
      ownership: "owned",
      quantity: 1,
    });

    const first = await bringIn(LIST);
    expect(first).toMatchObject({ added: 4, updated: 0, unchanged: 0 });
    expect(first.sameName).toEqual(["Coffee urn"]);

    const items = await read();
    expect(items).toHaveLength(5);
    const tongs = items.find((item) => item.assetTag === "TPP-tongs-kitchen");
    expect(tongs).toMatchObject({
      name: "Tongs - Kitchen",
      category: "Cooking",
      ownership: "owned",
      quantity: 10,
      homeLocation: "Kitchen",
      status: "active",
    });
    expect(JSON.parse(tongs.customFieldsJson)).toMatchObject({
      "Old-system group": "(DAY OF) Chef Pack Based On Need",
      "Last changed in the old system": "2020-03-27",
    });
    const sticks = items.find(
      (item) => item.assetTag === "TPP-stir-sticks-in-container",
    );
    expect(sticks).toMatchObject({ quantity: 0, homeLocation: "Warehouse" });
    expect(JSON.parse(sticks.customFieldsJson)["Old-system bin"]).toBe("D12");
    expect(
      items.find((item) => item.assetTag === "TPP-fire-extinguisher"),
    ).toMatchObject({ category: "Site" });
    expect(items.filter((item) => /coffee urn/i.test(item.name))).toHaveLength(
      1,
    );

    const again = await bringIn(LIST);
    expect(again).toMatchObject({
      added: 0,
      updated: 0,
      unchanged: 4,
      countDiffers: [],
    });

    await inventory(api.mutations.Equipment_recount, {
      docId: tongs._id,
      actualQuantity: 7,
    });
    const moved = LIST.map((item) =>
      item.name === "Kitchen Mat" ? { ...item, storage: "Dish Pit" } : item,
    );
    const later = await bringIn(moved);
    expect(later).toMatchObject({ added: 0, updated: 1, unchanged: 3 });
    expect(later.countDiffers).toEqual([
      { name: "Tongs - Kitchen", inFile: 10, inCapsule: 7 },
    ]);
    const after = await read();
    expect(after).toHaveLength(5);
    expect(after.find((item) => item._id === tongs._id)?.quantity).toBe(7);
    expect(
      after.find((item) => item.assetTag === "TPP-kitchen-mat")?.homeLocation,
    ).toBe("Dish Pit");

    const cook = proof.asRole({
      subject: `cook-${TENANT}`,
      role: "kitchen_staff",
      tenantId: TENANT,
    });
    await expect(
      cook.mutation(api.tppEquipmentItems.importTppEquipmentItems, {
        rows: [row("Pizza Peel")],
      }),
    ).rejects.toThrow();
    expect(await read()).toHaveLength(5);
  });
});
