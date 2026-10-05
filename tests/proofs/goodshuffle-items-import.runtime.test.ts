/**
 * Goodshuffle replacement (PL-REPLACEMENT-PROOF, "no way in yet for
 * Goodshuffle items"): the Goodshuffle inventory export brings the rental
 * items into the equipment list.
 *
 *   - each product row becomes one item tagged GS-<Product ID> with its
 *     count, client price, place, description and details; service and
 *     delivery rows come back as charges with their row numbers
 *   - a count of 0 comes in as 0; "TBD" is no place
 *   - reading the same file again adds nothing and changes nothing
 *   - a changed price follows the file; a count changed in Capsule stays and
 *     is listed as differing
 *   - an item made by hand under the same name is left alone
 *   - pictures are listed for copying; a cook may not bring items in
 */
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import { goodshuffleSheetRows } from "../../src/lib/goodshuffleItems";
import { parseCsv } from "../../src/lib/tppMenuCsv";
import {
  harness,
  rolesFor,
  runner,
} from "./buyer-qty-override-survival.runtime.helpers";

beforeAll(() => {
  process.env.CONVEX_FIELD_ENCRYPTION_KEY ||=
    "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
});

const TENANT = "tenant-goodshuffle-items";

const sample = goodshuffleSheetRows(
  parseCsv(
    readFileSync(
      new URL(
        "../fixtures/goodshuffle/inventory-export-sample.csv",
        import.meta.url,
      ),
      "utf8",
    ),
  ),
);

type ImportResult = {
  added: number;
  updated: number;
  unchanged: number;
  sameName: string[];
  countDiffers: { name: string; inFile: number; inCapsule: number }[];
  pictures: { equipmentId: string; url: string }[];
  problems: { row: number; reason: string }[];
};

describe("runtime proof: Goodshuffle item list", () => {
  it("brings items in once, follows later file changes, keeps Capsule counts", async () => {
    const proof = harness();
    const roles = rolesFor(proof, TENANT);
    const inventory = runner(proof, roles.inventory);
    const read = async () =>
      (
        (await roles.inventory.query(api.queries.listEquipment, {})) as any[]
      ).filter((row) => row.deletedAt == null);
    const bringIn = (rows: Record<string, string>[]) =>
      roles.inventory.mutation(api.goodshuffleItems.importGoodshuffleItems, {
        rows,
        firstRowNumber: sample.firstRowNumber,
      }) as Promise<ImportResult>;

    // Someone already made one item by hand.
    await inventory(api.mutations.Equipment_createViaRegister, {
      name: "Coffee urn",
      assetTag: "URN-1",
      category: "Catering Equipment",
      ownership: "owned",
      quantity: 1,
    });

    const first = await bringIn(sample.rows);
    expect(first).toMatchObject({ added: 5, updated: 0, unchanged: 0 });
    expect(first.sameName).toEqual(["Coffee urn"]);
    expect(first.problems).toEqual([
      {
        row: 4,
        reason: expect.stringMatching(/Setup and Teardown.*not an item/),
      },
      {
        row: 5,
        reason: expect.stringMatching(/Standard Delivery Fee.*not an item/),
      },
    ]);
    expect(first.pictures).toHaveLength(5);
    expect(first.pictures.every((p) => p.url.startsWith("https://"))).toBe(
      true,
    );

    const items = await read();
    expect(items).toHaveLength(6);
    const ottoman = items.find((row) => row.assetTag === "GS-454264687");
    expect(ottoman).toMatchObject({
      name: "Modern White Furniture - Bench Ottoman",
      category: "Furniture",
      ownership: "owned",
      quantity: 4,
      customerPrice: 65,
      status: "active",
    });
    expect(JSON.parse(ottoman.customFieldsJson)).toMatchObject({
      "Sub category": "Ottomans",
      Color: "White",
    });
    const charger = items.find((row) => row.assetTag === "GS-283294937");
    expect(charger).toMatchObject({ quantity: 11, homeLocation: "5E" });
    expect(
      JSON.parse(charger.customFieldsJson)["Set aside in Goodshuffle"],
    ).toBe("1");
    const ball = items.find((row) => row.assetTag === "GS-442859378");
    expect(ball.quantity).toBe(0);
    expect(ball.homeLocation ?? null).toBeNull();
    // The hand-made urn is untouched; no second urn.
    expect(items.filter((row) => /coffee urn/i.test(row.name))).toHaveLength(1);

    const again = await bringIn(sample.rows);
    expect(again).toMatchObject({
      added: 0,
      updated: 0,
      unchanged: 5,
      countDiffers: [],
    });
    expect(await read()).toHaveLength(6);

    // Goodshuffle price changed; someone recounted the chargers here.
    await inventory(api.mutations.Equipment_recount, {
      docId: charger._id,
      actualQuantity: 9,
    });
    const repriced = sample.rows.map((row) =>
      row["Product ID"] === "454264687"
        ? { ...row, "Flat Fee Price": "70.0" }
        : row,
    );
    const later = await bringIn(repriced);
    expect(later).toMatchObject({ added: 0, updated: 1, unchanged: 4 });
    expect(later.countDiffers).toEqual([
      { name: "Charger - Gold", inFile: 11, inCapsule: 9 },
    ]);
    const after = await read();
    expect(after.find((row) => row._id === ottoman._id)?.customerPrice).toBe(
      70,
    );
    expect(after.find((row) => row._id === charger._id)?.quantity).toBe(9);

    const cook = proof.asRole({
      subject: `cook-${TENANT}`,
      role: "kitchen_staff",
      tenantId: TENANT,
    });
    await expect(
      cook.mutation(api.goodshuffleItems.importGoodshuffleItems, {
        rows: sample.rows.map((row) => ({
          ...row,
          "Product ID": `${row["Product ID"]}9`,
        })),
      }),
    ).rejects.toThrow();
    expect(await read()).toHaveLength(6);
  });
});
