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

async function tenantOf(ctx: QueryCtx): Promise<string | null> {
  const auth = await getAuthContext(ctx);
  if (!auth.tenantId || !canRead(auth, ["importAccess"])) return null;
  return auth.tenantId;
}

/** Live links of one record type, read through its index. */
async function ofRecordType(
  ctx: QueryCtx,
  tenantId: string,
  recordType: string,
): Promise<Link[]> {
  const rows: Link[] = [];
  for await (const row of ctx.db
    .query("externalRecordLinks")
    .withIndex("by_tenantId_and_recordType", (q) =>
      q.eq("tenantId", tenantId).eq("recordType", recordType),
    ))
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
    // Only the asked-for kinds are read, each through its own index. Reading
    // every link of the company timed out /admin/reconcile (2026-10-06).
    const tenantId = await tenantOf(ctx);
    if (tenantId == null) return [];
    const found = new Map<string, Link>();
    const keep = (row: Link) => {
      if (row.deletedAt == null) found.set(String(row._id), row);
    };
    for (const recordType of new Set(args.recordTypes ?? []))
      for (const row of await ofRecordType(ctx, tenantId, recordType))
        keep(row);
    for (const entity of new Set(args.capsuleEntities ?? []))
      for await (const row of ctx.db
        .query("externalRecordLinks")
        .withIndex("by_tenantId_and_capsuleEntity", (q) =>
          q
            .eq("tenantId", tenantId)
            .eq("capsuleEntity", entity as Link["capsuleEntity"]),
        ))
        keep(row);
    if (args.pending === true)
      for await (const row of ctx.db
        .query("externalRecordLinks")
        .withIndex("by_tenantId_and_conflictStatus", (q) =>
          q.eq("tenantId", tenantId).eq("conflictStatus", "pending_conflict"),
        ))
        keep(row);
    return [...found.values()];
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
    const tenantId = await tenantOf(ctx);
    if (tenantId == null) return null;
    const dishIds = new Set<string>();
    for await (const dish of ctx.db
      .query("dishes")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId)))
      if (dish.deletedAt == null) dishIds.add(String(dish._id));
    const menuLinks = (await ofRecordType(ctx, tenantId, "menu")).filter(
      (link) =>
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
