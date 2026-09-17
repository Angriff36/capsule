// AUTHOR-OWNED — tenant logo bytes. The Organization entity stores only
// brandLogoStorageId (Manifest command Organization.setBrandLogo); the blob
// itself lives in Convex storage, which only authored functions can reach.
// Upload goes through fileStorage.generateUploadUrl; this seam resolves the
// read URL. Person-first admins without a Clerk organization therefore keep
// their logo (#237); the Clerk org image remains a read fallback in the UI.
import { query } from "./_generated/server";
import { getAuthContext } from "./lib/authContext";

/** Public URL of the tenant's own logo, or null when none is stored. */
export const getBrandLogoUrl = query({
  args: {},
  handler: async (ctx): Promise<string | null> => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId) return null;
    const organizations = await ctx.db
      .query("organizations")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", auth.tenantId))
      .collect();
    const live =
      organizations.find(
        (row) => row.deletedAt == null && String(row.status) === "active",
      ) ?? organizations.find((row) => row.deletedAt == null);
    const storageId = live?.brandLogoStorageId;
    if (typeof storageId !== "string" || !storageId) return null;
    const id = ctx.db.system.normalizeId("_storage", storageId);
    if (!id) return null;
    return await ctx.storage.getUrl(id);
  },
});
