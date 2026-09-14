import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import { getAuthContext, requireTenant } from "./lib/authContext";
import {
  canMaterializeBuiltInServiceStyle,
  ensureBuiltInServiceStyleRow,
  isBuiltInServiceStyleCode,
} from "./lib/eventCreateServiceStyleEnsure";

/**
 * Event create may pick a built-in catalog code before the tenant has a
 * ServiceStyle row. Generated register requires eventManageAccess; booking
 * roles (sales/event staff) must still be able to save the pick.
 */
export const ensureBuiltInServiceStyle = mutation({
  args: {
    name: v.string(),
    code: v.string(),
    sortOrder: v.optional(v.number()),
    description: v.optional(v.string()),
  },
  returns: v.object({ docId: v.string() }),
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx);
    const tenantId = requireTenant(auth);
    if (!canMaterializeBuiltInServiceStyle(auth.role)) {
      throw new ConvexError(
        "Sales or event access is required to add a service style while booking.",
      );
    }
    if (!isBuiltInServiceStyleCode(args.code)) {
      throw new ConvexError("That is not a built-in service style.");
    }
    const docId = await ensureBuiltInServiceStyleRow(ctx, {
      tenantId,
      name: args.name.trim(),
      code: args.code,
      sortOrder: args.sortOrder ?? 0,
      description: args.description,
    });
    return { docId };
  },
});
