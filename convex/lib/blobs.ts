/**
 * AUTHOR SEAM helper — delete an uploaded blob only when no live Attachment
 * row anywhere references it. The whole exact index range is read, not a
 * page: one live reference keeps the blob, so a caller can never remove a
 * file that is in use (an event document, another message's photo) by naming
 * its storage id.
 */
import type { Id } from "../_generated/dataModel";
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
  return false;
}

/** True when the blob was deleted; false when a live row keeps it or it is already gone. */
export async function deleteBlobIfOrphan(
  ctx: MutationCtx,
  storageId: string,
): Promise<boolean> {
  if (await blobReferenced(ctx, storageId)) return false;
  const blob = await ctx.db.system.get(storageId as Id<"_storage">);
  if (!blob) return false;
  await ctx.storage.delete(storageId as Id<"_storage">);
  return true;
}
