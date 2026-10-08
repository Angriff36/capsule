/**
 * Shared by the equipment list imports (convex/goodshuffleItems.ts,
 * convex/tppEquipmentItems.ts). Each row carries its tag; reading a file
 * again finds the same item by that tag: a changed name, category,
 * description, price or place follows the file, the item's saved details take
 * the file's values, and the count is left alone (after the first file,
 * counts are Capsule's) - a count that differs is sent back so someone can
 * recount. An item someone already made under the same name (any item not
 * carrying this file's tag prefix) is left as it is. Every write goes through
 * the generated Equipment commands, so their role and tenant checks still
 * apply.
 */
import type { MutationCtx } from "../_generated/server";
import { api } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { fieldValuesJson, parseFieldValues } from "../../src/lib/equipmentFields";

export type EquipmentRowIn = {
  tag: string;
  title: string;
  category: string;
  description: string;
  quantity: number;
  customerPrice: number | null;
  purchaseValue: number | null;
  homeLocation: string;
  imageUrl: string;
  details: Record<string, string>;
};

const nameKey = (name: string) =>
  name.trim().toLowerCase().replace(/\s+/g, " ");

const same = (a: string | null | undefined, b: string | null | undefined) =>
  (a ?? "") === (b ?? "");

export async function importEquipmentRows(
  ctx: MutationCtx,
  tenantId: string,
  rows: ReadonlyArray<EquipmentRowIn>,
  tagPrefix: string,
) {
  const catalog = (
    await ctx.db
      .query("equipments")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .collect()
  ).filter((row) => row.deletedAt == null && row.registeredAt != null);
  const byTag = new Map(catalog.map((row) => [row.assetTag, row]));
  const handMadeByName = new Map(
    catalog
      .filter((row) => !row.assetTag.startsWith(tagPrefix))
      .map((row) => [nameKey(row.name), row.name]),
  );

  let added = 0;
  let updated = 0;
  let unchanged = 0;
  const sameName: string[] = [];
  const countDiffers: { name: string; inFile: number; inCapsule: number }[] =
    [];
  const pictures: { equipmentId: Id<"equipments">; url: string }[] = [];

  for (const row of rows) {
    const quantity = row.quantity;
    const tag = row.tag;
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
      if (row.imageUrl) pictures.push({ equipmentId: docId, url: row.imageUrl });
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

  return { added, updated, unchanged, sameName, countDiffers, pictures };
}
