/**
 * Reading the Goodshuffle Pro inventory export (PL-REPLACEMENT-PROOF,
 * Goodshuffle item history). The samples are real rows cut from the
 * 2026-05-14 export (full and short forms).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  goodshuffleRowProblem,
  goodshuffleSheetRows,
  goodshuffleTag,
  readGoodshuffleRow,
} from "../src/lib/goodshuffleItems";
import { parseCsv } from "../src/lib/tppMenuCsv";

const sample = (name: string) =>
  goodshuffleSheetRows(
    parseCsv(
      readFileSync(
        new URL(`./fixtures/goodshuffle/${name}`, import.meta.url),
        "utf8",
      ),
    ),
  );

describe("Goodshuffle item list reader", () => {
  it("finds the header under the title lines and reads each item", () => {
    const { rows, firstRowNumber } = sample("inventory-export-sample.csv");
    expect(firstRowNumber).toBe(4);
    expect(rows).toHaveLength(8);
    const items = rows.map(readGoodshuffleRow);

    const ottoman = items.find((row) => row.productId === "454264687")!;
    expect(ottoman).toMatchObject({
      title: "Modern White Furniture - Bench Ottoman",
      isItem: true,
      category: "Furniture",
      quantity: 4,
      customerPrice: 65,
      homeLocation: "",
    });
    expect(ottoman.imageUrl).toMatch(/^https:\/\/.*cloudfront\.net\/.*\.png$/);
    expect(ottoman.details).toMatchObject({
      "Sub category": "Ottomans",
      Color: "White",
    });
    expect(goodshuffleTag(ottoman.productId)).toBe("GS-454264687");

    const charger = items.find((row) => row.title === "Charger - Gold")!;
    expect(charger.quantity).toBe(11);
    expect(charger.homeLocation).toBe("5E");
    expect(charger.details["Set aside in Goodshuffle"]).toBe("1");

    const urn = items.find((row) => row.title === "Coffee Urn")!;
    expect(urn.customerPrice).toBe(35);
    expect(urn.details["Three day price"]).toBe("$35.00");

    // "TBD" is not a place; a count of 0 is still an item.
    const ball = items.find((row) => row.productId === "442859378")!;
    expect(ball.homeLocation).toBe("");
    expect(ball.quantity).toBe(0);
    expect(goodshuffleRowProblem(ball)).toBeNull();

    // Several pictures: the first one is the main picture.
    const support = items.find((row) => row.productId === "358984365")!;
    expect(support.imageUrl).toMatch(/^https:\/\/[^,\s]+$/);

    const vendorItem = items.find((row) => row.productId === "283283512")!;
    expect(vendorItem.details["Vendor item number"]).toBeTruthy();
    expect(vendorItem.details["Bought from"]).toBeTruthy();
    // The row type is never read as the item's own "Type" attribute.
    expect(vendorItem.details.Kind).toBeUndefined();
  });

  it("sends service and delivery rows back as charges, not items", () => {
    const items = sample("inventory-export-sample.csv").rows.map(
      readGoodshuffleRow,
    );
    expect(goodshuffleRowProblem(items[0]!)).toBe(
      '"Setup and Teardown" is a service charge, not an item. Add it as a price line on proposals instead.',
    );
    expect(goodshuffleRowProblem(items[1]!)).toMatch(
      /delivery logistics charge, not an item/,
    );
  });

  it("reads the short export (SKU and Location without Attr::)", () => {
    const { rows } = sample("inventory-export-short-sample.csv");
    const charger = rows
      .map(readGoodshuffleRow)
      .find((row) => row.title === "Charger - Gold")!;
    expect(charger).toMatchObject({ quantity: 11, homeLocation: "5E" });
    expect(charger.details["Sub category"]).toBeTruthy();
  });
});
