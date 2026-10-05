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
 * (VendorItemUpdated). A row may carry a price date: rows run oldest first,
 * and a dated price older than the item's current one goes into its history
 * only (VendorItem.recordPastPrice), so an old price file brings price history
 * in. Reading the same file again changes nothing. Every
 * write goes through the generated Vendor and VendorItem commands, so their
 * role and tenant checks still apply.
 */
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { api } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { getAuthContext, requireTenant } from "./lib/authContext";
import { orgCapabilityDeniesAction } from "./lib/orgCapabilityGate";
import {
  hasPricePoint,
  vendorItemPriceHistory,
} from "./lib/vendorItemPriceHistory";
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
    let pastPrices = 0;
    const problems: { row: number; reason: string }[] = [];
    const first = args.firstRowNumber ?? 2;
    const now = Date.now();

    // Oldest dated rows first, undated rows last (they are today's price), so
    // a file holding several prices for one item ends at the newest one.
    const rows = args.rows
      .map((raw, index) => ({
        rowNumber: first + index,
        row: readVendorPriceRow(raw),
      }))
      .sort(
        (a, b) =>
          (a.row.priceDate ?? Infinity) - (b.row.priceDate ?? Infinity) ||
          a.rowNumber - b.rowNumber,
      );

    for (const { rowNumber, row } of rows) {
      const problem =
        vendorPriceRowProblem(row) ??
        (row.priceDate != null && row.priceDate > now
          ? "The price date is after today."
          : null);
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
        priceDate: row.priceDate ?? undefined,
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
      // A price from before the item's current one goes into its history
      // only; the item keeps its current price and details.
      if (
        row.priceDate != null &&
        row.packPrice != null &&
        existing.priceSetAt != null &&
        row.priceDate < existing.priceSetAt
      ) {
        const history = vendorItemPriceHistory(
          existing,
          await ctx.db
            .query("manifestEvents")
            .withIndex("by_entityId", (q) => q.eq("entityId", existing._id))
            .collect(),
        );
        if (hasPricePoint(history, row.packPrice, row.priceDate)) {
          unchanged += 1;
          continue;
        }
        await ctx.runMutation(api.mutations.VendorItem_recordPastPrice, {
          docId: existing._id,
          packPrice: row.packPrice,
          priceDate: row.priceDate,
        });
        const fresh = await ctx.db.get(existing._id);
        if (fresh) items[items.indexOf(existing)] = fresh;
        pastPrices += 1;
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
    problems.sort((a, b) => a.row - b.row);
    return { vendorsAdded, added, updated, unchanged, pastPrices, problems };
  },
});

// Same readers as VendorItem's read policy: kitchen, purchasing, managers.
const MANAGER_ROLES = new Set([
  "manager",
  "kitchen_manager",
  "sales_manager",
  "event_manager",
  "inventory_manager",
  "logistics_manager",
  "workforce_manager",
  "finance_manager",
  "admin",
  "owner",
  "system",
]);
const KITCHEN_ROLES = new Set(["kitchen_staff", "kitchen_lead"]);

/**
 * Every price each vendor item for one ingredient has had, newest first: the
 * prices set on the item, changes, and older prices read in from a price list.
 */
export const priceHistory = query({
  args: { ingredientId: v.string() },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx);
    const role = String(auth.role ?? "");
    const allowed =
      MANAGER_ROLES.has(role) ||
      (KITCHEN_ROLES.has(role) &&
        !orgCapabilityDeniesAction(
          "kitchenAccess",
          auth.disabledCapabilities,
        )) ||
      (role === "procurement_staff" &&
        !orgCapabilityDeniesAction(
          "procurementAccess",
          auth.disabledCapabilities,
        ));
    const ingredientId = ctx.db.normalizeId("ingredients", args.ingredientId);
    if (!auth.tenantId || !allowed || !ingredientId) return [];
    const tenantId = auth.tenantId;
    const items = live(
      await ctx.db
        .query("vendorItems")
        .withIndex("by_ingredientId", (q) => q.eq("ingredientId", ingredientId))
        .collect(),
    ).filter((item) => item.tenantId === tenantId && item.addedAt != null);
    const history = [];
    for (const item of items) {
      const events = await ctx.db
        .query("manifestEvents")
        .withIndex("by_entityId", (q) => q.eq("entityId", item._id))
        .collect();
      history.push(...vendorItemPriceHistory(item, events));
    }
    return history.sort((a, b) => b.pricedAt - a.pricedAt);
  },
});
