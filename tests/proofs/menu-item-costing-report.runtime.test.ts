/**
 * Runtime proof (AC-140, PL-REPORT-INVENTORY): TPP "Menu Item Costing" is a
 * per-menu-item recipe cost, not invoice sales lines. Each active menu item
 * shows its cost per portion from its recipe and ingredient costs; an item
 * with a line that cannot be costed says "No" and shows no cost (never a low
 * cost that looks complete). Retired and merged items stay out; the category
 * box narrows the list; the report opens for kitchen readers. Synthetic
 * workspace only.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

const tenantId = "tenant-menu-item-costing";
const day = Date.UTC(2026, 8, 20);

type Report = {
  kind: string;
  rows: Array<{ values: Record<string, unknown> }>;
  measures: Array<{ key: string; value: number | null }>;
};

describe("runtime proof: Menu Item Costing costs menu items from recipes", () => {
  it("lists active items with recipe cost, marks uncostable ones, and filters by category", async () => {
    const proof = createManifestTestContext({
      convexTest: convexTest as never,
      schema,
      modules,
    });
    const as = (role: string) =>
      proof.asRole({ subject: "menu-costing-" + role, role, tenantId });

    await as("owner").run(async (ctx) => {
      const base = {
        tenantId,
        version: 1,
        createdAt: day,
        updatedAt: day,
        deletedAt: null,
      };
      const insert = (table: string, doc: Record<string, unknown>) =>
        ctx.db.insert(table as never, { ...base, ...doc } as never);
      const rice = await insert("ingredients", {
        name: "Arborio rice",
        unit: "ounce",
        costPerUnit: 0.5,
        status: "active",
      });
      const truffle = await insert("ingredients", {
        name: "Truffle",
        unit: "each",
        costPerUnit: 4,
        status: "active",
      });
      const dish = (name: string, category: string, extra = {}) =>
        insert("dishes", {
          name,
          category,
          portionSize: 2,
          portionUnit: "each",
          status: "active",
          ...extra,
        });
      const arancini = await dish("Arancini", "Apps");
      const risotto = await dish("Truffle Risotto", "Entrees");
      await dish("Old Soup", "Apps", { status: "retired" });
      const line = (
        dishId: unknown,
        ingredientId: unknown,
        quantity: number,
        unit: string,
      ) =>
        insert("dishIngredients", {
          dishId,
          ingredientId,
          quantity,
          unit,
          sortOrder: 1,
          addedAt: day,
        });
      await line(arancini, rice, 3, "ounce");
      // Truffle is bought by the each; a cup has no conversion, so the
      // risotto cannot be fully costed.
      await line(risotto, rice, 4, "ounce");
      await line(risotto, truffle, 1, "cup");
    });

    const run = (role: string, category?: string) =>
      as(role).query(api.tppReports.financial.run, {
        reportId: "menu-item-costing",
        parameters: category ? { category } : {},
      }) as Promise<Report>;

    const all = await run("owner");
    expect(all.kind).toBe("financial");
    expect(all.rows.map((row) => row.values)).toEqual([
      expect.objectContaining({
        item: "Arancini",
        category: "Apps",
        costed: "Yes",
        portionCost: 1.5,
      }),
      expect.objectContaining({
        item: "Truffle Risotto",
        category: "Entrees",
        costed: "No",
        portionCost: null,
      }),
    ]);
    expect(all.measures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "fullyCosted", value: 1 }),
        expect.objectContaining({ key: "notCosted", value: 1 }),
      ]),
    );

    const apps = await run("kitchen_staff", "apps");
    expect(apps.rows.map((row) => row.values.item)).toEqual(["Arancini"]);

    await expect(run("sales_staff")).rejects.toThrow(
      /can't open this money report/,
    );
  });
});
