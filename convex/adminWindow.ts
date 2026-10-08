// Import runs for the admin screens, read in pages or from a start date
// through the tenant index, never the company's whole run history at once.
// Same read rule as the generated listImportRun (importAccess); deleted runs
// are left out as that list does.
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { getAuthContext } from "./lib/authContext";
import { canRead } from "./search";

/** Newest runs first, one page per call (the import history list). */
export const importRunsPage = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || !canRead(auth, ["importAccess"])) {
      return {
        page: [] as Doc<"importRuns">[],
        isDone: true,
        continueCursor: "",
      };
    }
    const tenantId = auth.tenantId;
    const result = await ctx.db
      .query("importRuns")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .order("desc")
      .paginate(paginationOpts);
    return {
      ...result,
      page: result.page.filter((run) => run.deletedAt == null),
    };
  },
});

/** Runs created at or after `since` (a dashboard's date window). */
export const importRunsSince = query({
  args: { since: v.number() },
  handler: async (ctx, { since }): Promise<Doc<"importRuns">[]> => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || !canRead(auth, ["importAccess"])) return [];
    const tenantId = auth.tenantId;
    const rows = await ctx.db
      .query("importRuns")
      .withIndex("by_tenantId", (q) =>
        q.eq("tenantId", tenantId).gte("_creationTime", since),
      )
      .collect();
    return rows.filter((run) => run.deletedAt == null);
  },
});
