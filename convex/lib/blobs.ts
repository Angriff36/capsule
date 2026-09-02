/**
 * AUTHOR SEAM helper — delete an uploaded blob only when nothing references
 * it: no live Attachment row (the whole exact index range is read, not a
 * page) and no Dish or Ingredient whose primary image it is (those rows hold
 * the storage id directly; any such row, live or removed, keeps the blob).
 * One reference keeps the blob, so a caller can never remove a file that is
 * in use — an event document, another message's photo, a dish image — by
 * naming its storage id.
 */
import type { MutationCtx } from "../_generated/server";

export async function blobReferenced(
  ctx: MutationCtx,
  storageId: string,
): Promise<boolean> {
  for await (const row of ctx.db
    .query("attachments")
    .withIndex("by_storageId", (q) => q.eq("storageId", storageId))) {
    if (row.deletedAt == null) return true;
  }
  const dish = await ctx.db
    .query("dishes")
    .withIndex("by_primaryImageStorageId", (q) =>
      q.eq("primaryImageStorageId", storageId),
    )
    .first();
  if (dish) return true;
  const ingredient = await ctx.db
    .query("ingredients")
    .withIndex("by_primaryImageStorageId", (q) =>
      q.eq("primaryImageStorageId", storageId),
    )
    .first();
  return ingredient !== null;
}

/** True when the blob was deleted; false when a live row keeps it or it is already gone. */
export async function deleteBlobIfOrphan(
  ctx: MutationCtx,
  storageId: string,
): Promise<boolean> {
  const id = ctx.db.system.normalizeId("_storage", storageId);
  if (!id) return false;
  if (await blobReferenced(ctx, storageId)) return false;
  const blob = await ctx.db.system.get(id);
  if (!blob) return false;
  await ctx.storage.delete(id);
  return true;
}
