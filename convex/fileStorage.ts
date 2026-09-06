// AUTHOR-OWNED — not generated. Convex file-storage seam for the Attachment
// entity. The Manifest entity owns metadata + governance; binary content
// lives in Convex storage, which only authored functions can reach.
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { getAuthContext } from "./lib/authContext";
import { deleteBlobIfOrphan } from "./lib/blobs";

/** Short-lived URL the browser POSTs the file bytes to. Staff only. */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || auth.role === "anonymous") {
      throw new Error("Sign in to upload files");
    }
    return await ctx.storage.generateUploadUrl();
  },
});

/** Uploads a client may discard in one call (a chat message holds at most 20). */
const DISCARD_CAP = 25;

/**
 * Delete uploaded blobs that no live Attachment row references — the files a
 * client uploaded for a send that then failed or was rolled back. A blob some
 * live row still references is left alone, so this can never remove a file
 * that is in use. Staff only; ids are only known to the uploader.
 */
export const discardOrphanUploads = mutation({
  args: { storageIds: v.array(v.string()) },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || auth.role === "anonymous") {
      throw new Error("Sign in to manage uploads");
    }
    let discarded = 0;
    for (const storageId of [...new Set(args.storageIds)].slice(
      0,
      DISCARD_CAP,
    )) {
      if (await deleteBlobIfOrphan(ctx, storageId)) discarded += 1;
    }
    return { discarded };
  },
});

/** Live attachments for one parent record, with download URLs resolved. */
export const listForParent = query({
  args: {
    parentType: v.union(
      v.literal("eventRecord"),
      v.literal("client"),
      v.literal("contract"),
      v.literal("vendor"),
      v.literal("delivery"),
      v.literal("closeout"),
      v.literal("dish"),
      v.literal("ingredient"),
      // No "staffMessage": chat files are private to the message's readers
      // and are hydrated only by convex/teamChat.ts.
    ),
    parentId: v.string(),
  },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId) return [];
    const rows = await ctx.db
      .query("attachments")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", auth.tenantId))
      .collect();
    const live = rows.filter(
      (r) =>
        r.parentType === args.parentType &&
        r.parentId === args.parentId &&
        r.deletedAt == null,
    );
    return Promise.all(
      live.map(async (r) => ({
        ...r,
        url: await ctx.storage.getUrl(r.storageId as Id<"_storage">),
      })),
    );
  },
});

/**
 * True when a live row in this tenant references the blob: an Attachment
 * row (any parent type) or a Dish/Ingredient whose primary image it is —
 * the same reference walk as convex/lib/blobs.ts, tenant-scoped and
 * live-only. URL retrieval needs an authorized parent record (PR12-05);
 * a bare storage id, or one only another tenant references, is not enough.
 */
async function storageReferencedByTenant(
  ctx: QueryCtx,
  tenantId: string,
  storageId: string,
): Promise<boolean> {
  for await (const row of ctx.db
    .query("attachments")
    .withIndex("by_storageId", (q) => q.eq("storageId", storageId))) {
    if (row.tenantId === tenantId && row.deletedAt == null) return true;
  }
  for await (const dish of ctx.db
    .query("dishes")
    .withIndex("by_primaryImageStorageId", (q) =>
      q.eq("primaryImageStorageId", storageId),
    )) {
    if (dish.tenantId === tenantId && dish.deletedAt == null) return true;
  }
  for await (const ingredient of ctx.db
    .query("ingredients")
    .withIndex("by_primaryImageStorageId", (q) =>
      q.eq("primaryImageStorageId", storageId),
    )) {
    if (ingredient.tenantId === tenantId && ingredient.deletedAt == null) {
      return true;
    }
  }
  return false;
}

/**
 * Resolve download URLs for dish/ingredient primary image storage ids. A
 * storage id resolves only when a live row in the caller's tenant
 * references it (see storageReferencedByTenant); anything else maps to
 * null — knowing a storage id grants nothing.
 */
export const urlsForStorageIds = query({
  args: {
    storageIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId) return {} as Record<string, string | null>;
    const unique = [...new Set(args.storageIds.filter((id) => id.length > 0))];
    const entries = await Promise.all(
      unique.map(async (storageId) => {
        const url = (await storageReferencedByTenant(
          ctx,
          auth.tenantId,
          storageId,
        ))
          ? await ctx.storage.getUrl(storageId as Id<"_storage">)
          : null;
        return [storageId, url] as const;
      }),
    );
    return Object.fromEntries(entries) as Record<string, string | null>;
  },
});
