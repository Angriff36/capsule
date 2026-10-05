/**
 * AUTHOR SEAM - Goodshuffle item list from a file (PL-REPLACEMENT-PROOF,
 * Goodshuffle: "no way in yet for Goodshuffle items").
 *
 * Each Product row of the Goodshuffle inventory export becomes one equipment
 * item, tagged GS-<Product ID>. Reading a file again finds the same items by
 * that tag: a changed name, category, description, price or place follows the
 * file, the item's saved details take the file's values, and the count is
 * left alone (after the first file, counts are Capsule's) - a count that
 * differs is sent back so someone can recount. An item someone already made
 * by hand under the same name is left as it is. Service and delivery rows are
 * charges, not items, and come back with the reason. Every write goes through
 * the generated Equipment commands, so their role and tenant checks still
 * apply. Pictures come in after, one call per item (bringInPicture).
 */
import { v } from "convex/values";
import { action, mutation } from "./_generated/server";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { getAuthContext, requireTenant } from "./lib/authContext";
import { orgCapabilityDeniesAction } from "./lib/orgCapabilityGate";
import { fetchCatalogImage } from "./lib/foodDatabaseImage";
import {
  goodshuffleRowProblem,
  goodshuffleTag,
  readGoodshuffleRow,
} from "../src/lib/goodshuffleItems";
import { fieldValuesJson, parseFieldValues } from "../src/lib/equipmentFields";

const nameKey = (name: string) =>
  name.trim().toLowerCase().replace(/\s+/g, " ");

const same = (a: string | null | undefined, b: string | null | undefined) =>
  (a ?? "") === (b ?? "");

export const importGoodshuffleItems = mutation({
  args: {
    rows: v.array(v.record(v.string(), v.string())),
    firstRowNumber: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const tenantId = requireTenant(await getAuthContext(ctx));
    const catalog = (
      await ctx.db
        .query("equipments")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
        .collect()
    ).filter((row) => row.deletedAt == null && row.registeredAt != null);
    const byTag = new Map(catalog.map((row) => [row.assetTag, row]));
    const handMadeByName = new Map(
      catalog
        .filter((row) => !row.assetTag.startsWith("GS-"))
        .map((row) => [nameKey(row.name), row.name]),
    );

    let added = 0;
    let updated = 0;
    let unchanged = 0;
    const sameName: string[] = [];
    const countDiffers: { name: string; inFile: number; inCapsule: number }[] =
      [];
    const pictures: { equipmentId: Id<"equipments">; url: string }[] = [];
    const problems: { row: number; reason: string }[] = [];
    const first = args.firstRowNumber ?? 2;

    for (const [index, raw] of args.rows.entries()) {
      const row = readGoodshuffleRow(raw);
      const problem = goodshuffleRowProblem(row);
      if (problem) {
        problems.push({ row: first + index, reason: problem });
        continue;
      }
      const quantity = row.quantity as number;
      const tag = goodshuffleTag(row.productId);
      const existing = byTag.get(tag);

      if (!existing) {
        const handMade = handMadeByName.get(nameKey(row.title));
        if (handMade) {
          sameName.push(handMade);
          continue;
        }
        const created = (await ctx.runMutation(
          api.mutations.Equipment_createViaRegister,
          {
            name: row.title,
            assetTag: tag,
            category: row.category || "Rentals",
            ownership: "owned",
            // A new item needs a count above zero; a file count of 0 is
            // set right after, so the item keeps its picture and price.
            quantity: Math.max(quantity, 1),
            purchaseValue: row.purchaseValue ?? undefined,
            description: row.description || undefined,
            customerPrice: row.customerPrice ?? undefined,
            homeLocation: row.homeLocation || undefined,
          },
        )) as { docId: string };
        const docId = created.docId as Id<"equipments">;
        if (quantity === 0)
          await ctx.runMutation(api.mutations.Equipment_recount, {
            docId,
            actualQuantity: 0,
          });
        if (Object.keys(row.details).length > 0)
          await ctx.runMutation(api.mutations.Equipment_setCustomFields, {
            docId,
            customFieldsJson: fieldValuesJson({}, row.details),
          });
        const doc = await ctx.db.get(docId);
        if (doc) byTag.set(tag, doc);
        if (row.imageUrl)
          pictures.push({ equipmentId: docId, url: row.imageUrl });
        added += 1;
        continue;
      }

      if (existing.status !== "active") {
        unchanged += 1;
        continue;
      }
      let item: Doc<"equipments"> = existing;
      let changed = false;
      // A blank cell keeps what Capsule has.
      const next = {
        name: row.title,
        category: row.category || item.category,
        description: row.description || item.description,
        customerPrice: row.customerPrice ?? item.customerPrice,
        purchaseValue: row.purchaseValue ?? item.purchaseValue,
        homeLocation: row.homeLocation || item.homeLocation,
      };
      if (
        !same(next.name, item.name) ||
        !same(next.category, item.category) ||
        !same(next.description, item.description) ||
        next.customerPrice !== item.customerPrice ||
        next.purchaseValue !== item.purchaseValue ||
        !same(next.homeLocation, item.homeLocation)
      ) {
        await ctx.runMutation(api.mutations.Equipment_reviseDetails, {
          docId: item._id,
          version: item.version,
          name: next.name,
          category: next.category,
          description: next.description ?? undefined,
          customerPrice: next.customerPrice ?? undefined,
          purchaseValue: next.purchaseValue,
          homeLocation: next.homeLocation ?? undefined,
        });
        item = (await ctx.db.get(item._id)) ?? item;
        changed = true;
      }
      const details = fieldValuesJson(
        parseFieldValues(item.customFieldsJson),
        row.details,
      );
      if (!same(details, item.customFieldsJson)) {
        await ctx.runMutation(api.mutations.Equipment_setCustomFields, {
          docId: item._id,
          version: item.version,
          customFieldsJson: details,
        });
        item = (await ctx.db.get(item._id)) ?? item;
        changed = true;
      }
      byTag.set(tag, item);
      if (item.quantity !== quantity)
        countDiffers.push({
          name: item.name,
          inFile: quantity,
          inCapsule: item.quantity,
        });
      if (row.imageUrl && !item.primaryImageStorageId)
        pictures.push({ equipmentId: item._id, url: row.imageUrl });
      if (changed) updated += 1;
      else unchanged += 1;
    }

    return {
      added,
      updated,
      unchanged,
      sameName,
      countDiffers,
      pictures,
      problems,
    };
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
