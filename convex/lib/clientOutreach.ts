import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { api } from "../_generated/api";
import { getAuthContext, requireTenant } from "./authContext";
import type { Id } from "../_generated/dataModel";

/** Atomically returns the current open reminder or creates one via its generated command. */
export const ensureOpen = mutation({
  args: { clientId: v.id("clients"), reason: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{ taskId: Id<"clientOutreachTasks">; created: boolean }> => {
    const auth = await getAuthContext(ctx);
    const tenantId = requireTenant(auth);
    // The generated read and create commands use the same salesAccess policy.
    // Run the generated read before the reuse path so a cached/open result never
    // bypasses current authentication, role, or org-capability enforcement.
    const visible = await ctx.runQuery(
      api.queries.listClientOutreachTask,
      {},
    );
    const existing = visible.find(
      (row) =>
        row.tenantId === tenantId &&
        row.clientId === args.clientId &&
        row.status === "open",
    );
    if (existing) return { taskId: existing._id, created: false };
    const created = await ctx.runMutation(
      api.mutations.ClientOutreachTask_createViaOpen,
      args,
    );
    return { taskId: created.docId, created: true };
  },
});
