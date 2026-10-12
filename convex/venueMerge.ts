// Authored seam: merge a duplicate venue into the one to keep (2026-10-12).
//
// Imports and typing left the same place in the book more than once
// ("Riverfront Park", "Riverfront Park Pavilion"). Every record that points at
// the duplicate is moved to the kept venue, the duplicate is removed, and the
// move is written to the audit trail. A commission term is money: when both
// venues hold an active term for overlapping dates the merge is refused, so
// no rate is chosen without a person; retire one of them, then merge.

import { ConvexError, v } from "convex/values";
import type { Doc, Id, TableNames } from "./_generated/dataModel";
import { mutation, type MutationCtx } from "./_generated/server";
import { getAuthContext, requireTenant } from "./lib/authContext";
import { insertStepEvent } from "./lib/commandAudit";
import { orgCapabilityDeniesAction } from "./lib/orgCapabilityGate";

const MERGE_ROLES = new Set([
  "admin",
  "owner",
  "system",
  "manager",
  "event_manager",
]);

/** The tables that point at a venue, and the field that holds it. */
const VENUE_REFERENCES = [
  ["events", "venueId", "by_venueId"],
  ["dateHolds", "venueId", "by_venueId"],
  ["referralSources", "venueId", "by_venueId"],
  ["revenueAttributions", "venueId", "by_venueId"],
  ["venueCommissionTerms", "venueId", "by_venueId"],
  ["venueLayoutTemplates", "venueId", "by_venueId"],
  ["venueNotes", "venueId", "by_venueId"],
  ["venueRooms", "venueId", "by_venueId"],
  ["venueVendorRelationships", "venueId", "by_venueId"],
  ["dishes", "exclusiveVenueId", "by_exclusiveVenueId"],
] as const;

type Term = Doc<"venueCommissionTerms">;

const termEnd = (term: Term) =>
  term.effectiveEndDate == null ? Infinity : Number(term.effectiveEndDate);
const overlaps = (a: Term, b: Term) =>
  Number(a.effectiveStartDate) <= termEnd(b) &&
  Number(b.effectiveStartDate) <= termEnd(a);

async function rowsFor(
  ctx: MutationCtx,
  table: TableNames,
  index: string,
  field: string,
  venueId: Id<"venues">,
) {
  // The index is named for the field; each table above declares it.
  return (await (ctx.db.query(table) as any)
    .withIndex(index, (q: any) => q.eq(field, venueId))
    .collect()) as Array<{
    _id: Id<any>;
    tenantId: string;
    version?: number;
  }>;
}

export const mergeInto = mutation({
  args: {
    duplicateVenueId: v.id("venues"),
    targetVenueId: v.id("venues"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx);
    const tenantId = requireTenant(auth);
    if (
      !MERGE_ROLES.has(auth.role) ||
      orgCapabilityDeniesAction("eventAccess", auth.disabledCapabilities)
    ) {
      throw new ConvexError("A manager merges venues.");
    }
    const reason = args.reason.trim();
    if (!reason) throw new ConvexError("Say why these are the same venue.");
    if (args.duplicateVenueId === args.targetVenueId) {
      throw new ConvexError("Pick a different venue to merge into.");
    }
    const [duplicate, target] = await Promise.all([
      ctx.db.get(args.duplicateVenueId),
      ctx.db.get(args.targetVenueId),
    ]);
    for (const venue of [duplicate, target]) {
      if (!venue || venue.tenantId !== tenantId || venue.deletedAt != null) {
        throw new ConvexError("That venue is not available any more.");
      }
    }
    const keep = target!;
    const drop = duplicate!;

    const activeTerms = async (venueId: Id<"venues">) =>
      (
        await ctx.db
          .query("venueCommissionTerms")
          .withIndex("by_venueId", (q) => q.eq("venueId", venueId))
          .collect()
      ).filter(
        (term) =>
          term.tenantId === tenantId &&
          term.deletedAt == null &&
          term.status === "active",
      );
    const [dropTerms, keepTerms] = await Promise.all([
      activeTerms(drop._id),
      activeTerms(keep._id),
    ]);
    const clash = dropTerms.find((a) => keepTerms.some((b) => overlaps(a, b)));
    if (clash) {
      throw new ConvexError(
        `Both venues have an active commission term for the same dates (${drop.name} ${clash.commissionPercent}%). Retire one of them on Commission terms, then merge.`,
      );
    }

    const now = Date.now();
    const moved: Record<string, number> = {};
    for (const [table, field, index] of VENUE_REFERENCES) {
      const rows = (await rowsFor(ctx, table, index, field, drop._id)).filter(
        (row) => row.tenantId === tenantId,
      );
      for (const row of rows) {
        await ctx.db.patch(row._id, {
          [field]: keep._id,
          // Events keep a copy of the venue's name for lists and documents.
          ...(table === "events" ? { venueName: keep.name } : {}),
          ...(row.version != null ? { version: row.version + 1 } : {}),
          updatedAt: now,
        } as never);
      }
      if (rows.length) moved[table] = rows.length;
    }
    // A later import of the same source row finds the kept venue.
    const links = (
      await ctx.db
        .query("externalRecordLinks")
        .withIndex("by_tenantId_and_capsuleId", (q) =>
          q.eq("tenantId", tenantId).eq("capsuleId", String(drop._id)),
        )
        .collect()
    ).filter((link) => link.capsuleEntity === "venue");
    for (const link of links) {
      await ctx.db.patch(link._id, {
        capsuleId: String(keep._id),
        version: (link.version ?? 0) + 1,
        updatedAt: now,
      });
    }

    await ctx.db.patch(drop._id, {
      deletedAt: now,
      updatedAt: now,
      version: (drop.version ?? 0) + 1,
    });
    await insertStepEvent(ctx, {
      type: "VenueMerged",
      entity: "Venue",
      entityId: drop._id,
      payload: {
        tenantId,
        venueId: drop._id,
        targetVenueId: keep._id,
        reason,
        moved,
        links: links.length,
      },
      createdAt: now,
    });
    return { moved, links: links.length, keptName: keep.name };
  },
});
