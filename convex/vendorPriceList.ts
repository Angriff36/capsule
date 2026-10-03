/**
 * AUTHOR SEAM - vendor price list from a file (PL-REPLACEMENT-PROOF, Galley:
 * "vendors and price history have no way in").
 *
 * Each row names a vendor, the vendor's item, the ingredient it is, the pack
 * and the pack price. A vendor not on the list yet is added; an ingredient
 * must already be in the catalog (a row with an unknown ingredient comes back
 * as a problem, nothing is guessed). An item already on file for that vendor
 * and ingredient (same item number, or same name when there is no number) is
 * updated, so a new price keeps the old one in the item's history
 * (VendorItemUpdated). Reading the same file again changes nothing. Every
 * write goes through the generated Vendor and VendorItem commands, so their
 * role and tenant checks still apply.
 */
import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { api } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { getAuthContext, requireTenant } from "./lib/authContext";
import {
  nameKey,
  readVendorPriceRow,
  vendorPriceRowProblem,
} from "../src/lib/vendorPriceList";

const live = <T extends { deletedAt?: number | null }>(rows: T[]) =>
  rows.filter((row) => row.deletedAt == null);

const sameItem = (
  item: Doc<"vendorItems">,
  itemCode: string,
  itemName: string,
) =>
  itemCode
    ? nameKey(item.itemCode ?? "") === nameKey(itemCode)
    : !item.itemCode && nameKey(item.description) === nameKey(itemName);

export const importVendorPriceRows = mutation({
  args: {
    rows: v.array(v.record(v.string(), v.string())),
    firstRowNumber: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const tenantId = requireTenant(await getAuthContext(ctx));
    const vendors = live(
      await ctx.db
        .query("vendors")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
        .collect(),
    );
    const ingredients = live(
      await ctx.db
        .query("ingredients")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
        .collect(),
    ).filter((row) => row.mergedIntoIngredientId == null);
    const items = live(
      await ctx.db
        .query("vendorItems")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
        .collect(),
    );
    const vendorByName = new Map(
      vendors.map((row) => [nameKey(row.name), row._id as string]),
    );
    const ingredientByName = new Map(
      ingredients.map((row) => [nameKey(row.name), row._id as string]),
    );

    let vendorsAdded = 0;
    let added = 0;
    let updated = 0;
    let unchanged = 0;
    const problems: { row: number; reason: string }[] = [];
    const first = args.firstRowNumber ?? 2;

    for (const [index, raw] of args.rows.entries()) {
      const rowNumber = first + index;
      const row = readVendorPriceRow(raw);
      const problem = vendorPriceRowProblem(row);
      if (problem) {
        problems.push({ row: rowNumber, reason: problem });
        continue;
      }
      const ingredientId = ingredientByName.get(nameKey(row.ingredientName));
      if (!ingredientId) {
        problems.push({
          row: rowNumber,
          reason: `No ingredient named "${row.ingredientName}". Add it to the ingredients list or put its name in the Ingredient column, then read the file again.`,
        });
        continue;
      }
      let vendorId = vendorByName.get(nameKey(row.vendorName));
      if (!vendorId) {
        const created = (await ctx.runMutation(
          api.mutations.Vendor_createViaOnboard,
          { name: row.vendorName.trim() },
        )) as { docId: string };
        vendorId = created.docId;
        vendorByName.set(nameKey(row.vendorName), vendorId);
        vendorsAdded += 1;
      }
      const fields = {
        description: row.itemName,
        packQuantity: row.packQuantity as number,
        packUnit: row.packUnit as string,
        itemCode: row.itemCode || undefined,
        packPrice: row.packPrice ?? undefined,
      };
      const existing = items.find(
        (item) =>
          item.vendorId === vendorId &&
          item.ingredientId === ingredientId &&
          sameItem(item, row.itemCode, row.itemName),
      );
      if (!existing) {
        const created = (await ctx.runMutation(
          api.mutations.VendorItem_createViaAdd,
          { vendorId, ingredientId, ...fields },
        )) as { docId: string };
        const doc = await ctx.db.get(
          created.docId as Doc<"vendorItems">["_id"],
        );
        if (doc) items.push(doc);
        added += 1;
        continue;
      }
      // A blank price cell keeps the price already on file.
      const packPrice = fields.packPrice ?? existing.packPrice ?? undefined;
      if (
        existing.description === fields.description &&
        existing.packQuantity === fields.packQuantity &&
        existing.packUnit === fields.packUnit &&
        (existing.itemCode ?? undefined) === fields.itemCode &&
        (existing.packPrice ?? undefined) === packPrice
      ) {
        unchanged += 1;
        continue;
      }
      await ctx.runMutation(api.mutations.VendorItem_update, {
        docId: existing._id,
        version: existing.version,
        ...fields,
        packPrice,
      });
      const fresh = await ctx.db.get(existing._id);
      if (fresh) items[items.indexOf(existing)] = fresh;
      updated += 1;
    }
    return { vendorsAdded, added, updated, unchanged, problems };
  },
});
