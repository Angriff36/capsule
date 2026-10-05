/**
 * AUTHOR SEAM — the parts of the imported-record links each screen needs.
 *
 * The generated listExternalRecordLink returns every link of the company in
 * one list. After the archive imports there were 9,385 links, and a list
 * from the server can hold at most 8,192 items, so /admin/reconcile, the
 * parallel-run dashboard and finance reconciliation failed to load
 * (2026-10-02). Each read here returns only the rows its screen works with.
 * Access is the same as the generated read: importAccess.
 */
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import { getAuthContext } from "./lib/authContext";
import { canRead } from "./search";

type Link = Doc<"externalRecordLinks">;

async function readable(ctx: QueryCtx): Promise<Link[] | null> {
  const auth = await getAuthContext(ctx);
  if (!auth.tenantId || !canRead(auth, ["importAccess"])) return null;
  const rows: Link[] = [];
  // Read in pages so no single read holds the whole table in one list.
  for await (const row of ctx.db
    .query("externalRecordLinks")
    .withIndex("by_tenantId", (q) => q.eq("tenantId", auth.tenantId!)))
    if (row.deletedAt == null) rows.push(row);
  return rows;
}

/**
 * Links of the given record types (for example payment, invoice, menu), or
 * the ones still waiting for a person (conflictStatus pending_conflict), or
 * links to one kind of Capsule record. Filters combine with "or".
 */
export const listFor = query({
  args: {
    recordTypes: v.optional(v.array(v.string())),
    pending: v.optional(v.boolean()),
    capsuleEntities: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const rows = await readable(ctx);
    if (rows == null) return [];
    const types = new Set(args.recordTypes ?? []);
    const entities = new Set(args.capsuleEntities ?? []);
    return rows.filter(
      (row) =>
        types.has(row.recordType) ||
        entities.has(String(row.capsuleEntity ?? "")) ||
        (args.pending === true && row.conflictStatus === "pending_conflict"),
    );
  },
});

/**
 * The parallel-run menu check: how many TPP menu links there are, how many
 * point at no live Capsule dish, and which dishes are linked. Counted here so
 * the screen does not need every menu link (5,513 on 2026-10-02).
 */
export const menuLinkStats = query({
  args: {},
  handler: async (ctx) => {
    const rows = await readable(ctx);
    if (rows == null) return null;
    const auth = await getAuthContext(ctx);
    const dishIds = new Set<string>();
    for await (const dish of ctx.db
      .query("dishes")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", auth.tenantId!)))
      if (dish.deletedAt == null) dishIds.add(String(dish._id));
    const menuLinks = rows.filter(
      (link) =>
        link.recordType === "menu" &&
        link.sourceSystem === "tpp_legacy" &&
        link.conflictStatus !== "superseded",
    );
    const linkedDishIds = [
      ...new Set(
        menuLinks
          .map((link) => String(link.capsuleId ?? ""))
          .filter((id) => id !== ""),
      ),
    ];
    return {
      tppTotal: menuLinks.length,
      unresolvedLinks: menuLinks.filter(
        (link) => !link.capsuleId || !dishIds.has(String(link.capsuleId)),
      ).length,
      linkedDishIds,
    };
  },
});
