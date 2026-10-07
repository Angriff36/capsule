/**
 * AUTHOR SEAM - the old system's kitchen tools from its Inventory In-Stock
 * report (PL-SOURCE-DATASETS, AC-057 "equipment references").
 *
 * The page reads the report (src/lib/tppInventoryList.ts) and sends only the
 * tool lines; each becomes one equipment item tagged TPP-<name>. How a later
 * file updates it, and how an item made by hand under the same name is left
 * alone, is in convex/lib/importEquipmentRows.ts. Every write goes through the
 * generated Equipment commands, so their role and tenant checks still apply.
 */
import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { getAuthContext, requireTenant } from "./lib/authContext";
import { importEquipmentRows } from "./lib/importEquipmentRows";
import {
  tppEquipmentCategory,
  tppEquipmentTag,
} from "../src/lib/tppInventoryList";

export const importTppEquipmentItems = mutation({
  args: {
    rows: v.array(
      v.object({
        name: v.string(),
        group: v.string(),
        bin: v.string(),
        vendor: v.string(),
        inStock: v.number(),
        storage: v.string(),
        lastUpdated: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const tenantId = requireTenant(await getAuthContext(ctx));
    const items = args.rows
      .filter((row) => row.name.trim() !== "")
      .map((row) => ({
        tag: tppEquipmentTag(row.name),
        title: row.name.trim(),
        category: tppEquipmentCategory(row.group),
        description: "",
        quantity: Math.max(0, Math.round(row.inStock)),
        customerPrice: null,
        purchaseValue: null,
        homeLocation: row.storage,
        imageUrl: "",
        details: Object.fromEntries(
          Object.entries({
            "Old-system group": row.group,
            "Old-system bin": row.bin,
            "Bought from": row.vendor,
            "Last changed in the old system": row.lastUpdated,
          }).filter(([, value]) => value !== ""),
        ),
      }));
    return await importEquipmentRows(ctx, tenantId, items, "TPP-");
  },
});
