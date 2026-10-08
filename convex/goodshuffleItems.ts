/**
 * AUTHOR SEAM - Goodshuffle item list from a file (PL-REPLACEMENT-PROOF,
 * Goodshuffle: "no way in yet for Goodshuffle items").
 *
 * Each Product row of the Goodshuffle inventory export becomes one equipment
 * item, tagged GS-<Product ID>; how a later file updates it is in
 * convex/lib/importEquipmentRows.ts. Service and delivery rows are charges,
 * not items, and come back with the reason. Pictures come in after, one call
 * per item (bringInPicture).
 */
import { v } from "convex/values";
import { action, mutation } from "./_generated/server";
import { api } from "./_generated/api";
import { getAuthContext, requireTenant } from "./lib/authContext";
import { orgCapabilityDeniesAction } from "./lib/orgCapabilityGate";
import { fetchCatalogImage } from "./lib/foodDatabaseImage";
import {
  goodshuffleRowProblem,
  goodshuffleTag,
  readGoodshuffleRow,
} from "../src/lib/goodshuffleItems";
import {
  importEquipmentRows,
  type EquipmentRowIn,
} from "./lib/importEquipmentRows";

export const importGoodshuffleItems = mutation({
  args: {
    rows: v.array(v.record(v.string(), v.string())),
    firstRowNumber: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const tenantId = requireTenant(await getAuthContext(ctx));
    const items: EquipmentRowIn[] = [];
    const problems: { row: number; reason: string }[] = [];
    const first = args.firstRowNumber ?? 2;

    for (const [index, raw] of args.rows.entries()) {
      const row = readGoodshuffleRow(raw);
      const problem = goodshuffleRowProblem(row);
      if (problem) {
        problems.push({ row: first + index, reason: problem });
        continue;
      }
      items.push({
        tag: goodshuffleTag(row.productId),
        title: row.title,
        category: row.category,
        description: row.description,
        quantity: row.quantity as number,
        customerPrice: row.customerPrice,
        purchaseValue: row.purchaseValue,
        homeLocation: row.homeLocation,
        imageUrl: row.imageUrl,
        details: row.details,
      });
    }

    const result = await importEquipmentRows(ctx, tenantId, items, "GS-");
    return { ...result, problems };
  },
});

// Same people who may change equipment (Equipment write policy).
const INVENTORY_ROLES = new Set([
  "admin",
  "inventory_manager",
  "inventory_staff",
  "owner",
  "procurement_staff",
  "system",
]);
const LOGISTICS_ROLES = new Set([
  "admin",
  "driver",
  "logistics_manager",
  "logistics_staff",
  "owner",
  "system",
]);

/** Goodshuffle keeps item pictures on Amazon's picture service. */
const GOODSHUFFLE_PICTURE_HOSTS = [".cloudfront.net", ".goodshuffle.com"];

/**
 * Copy one Goodshuffle picture into Capsule and make it the item's main
 * picture. Only Goodshuffle's picture addresses are read, and only for an
 * item that has no main picture yet.
 */
export const bringInPicture = action({
  args: { equipmentId: v.id("equipments"), url: v.string() },
  handler: async (ctx, args): Promise<{ pictureAdded: boolean }> => {
    const auth = await getAuthContext(ctx);
    const allowed =
      (INVENTORY_ROLES.has(auth.role) &&
        !orgCapabilityDeniesAction(
          "inventoryAccess",
          auth.disabledCapabilities,
        )) ||
      (LOGISTICS_ROLES.has(auth.role) &&
        !orgCapabilityDeniesAction(
          "logisticsAccess",
          auth.disabledCapabilities,
        ));
    if (!auth.tenantId || !allowed)
      throw new Error("Inventory or logistics staff may change equipment");
    const item = await ctx.runQuery(api.queries.getEquipment, {
      id: args.equipmentId,
    });
    if (!item || item.primaryImageStorageId) return { pictureAdded: false };
    const fetched = await fetchCatalogImage(
      args.url,
      GOODSHUFFLE_PICTURE_HOSTS,
    );
    if (!fetched) return { pictureAdded: false };
    const storageId = await ctx.storage.store(
      new Blob([fetched.bytes], { type: fetched.contentType }),
    );
    // Same as a hand upload: the picture is on the item's picture list too.
    await ctx.runMutation(api.mutations.Attachment_createViaAttach, {
      parentType: "equipment",
      parentId: args.equipmentId,
      fileName: fetched.fileName,
      contentType: fetched.contentType,
      fileSize: fetched.bytes.byteLength,
      storageId,
    });
    await ctx.runMutation(api.mutations.Equipment_setPrimaryImage, {
      docId: args.equipmentId,
      version: item.version,
      storageId,
      fileName: fetched.fileName,
    });
    return { pictureAdded: true };
  },
});
