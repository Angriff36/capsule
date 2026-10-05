/**
 * AUTHOR SEAM — travel & delivery fee for an event.
 *
 * The fee is the company rule (Organization.travelFee*) applied to the
 * one-way distance from the kitchen to the venue: a distance typed on the
 * event, else the stored drive-time route distance (convex/eventRoutes.ts).
 * An event override amount wins over the rule (zero waives it). The pure
 * calculation is src/lib/travelFee.ts.
 *
 * applyProposalTravelFee keeps ONE travel line (ProposalLineItem.travelFee)
 * on a draft proposal at the event's fee, writing only through the governed
 * proposal line seams (convex/lib/proposalPricing.ts), so totals recompute in
 * the same transaction. This module never writes a document directly.
 */
import { v } from "convex/values";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { getAuthContext } from "./lib/authContext";
import { readEventRouteStatus } from "./eventRoutes";
import {
  readTravelFeeRule,
  resolveEventTravelFee,
  TRAVEL_FEE_LINE_DESCRIPTION,
  travelFeeNote,
  type EventTravelFee,
} from "../src/lib/travelFee";

export type EventTravelFeeView = EventTravelFee & {
  eventId: string;
  eventVersion: number;
};

/** The event's travel fee, or null for a missing or other-workspace event. */
export async function readEventTravelFee(
  ctx: QueryCtx,
  tenantId: string,
  eventId: Id<"events">,
): Promise<EventTravelFeeView | null> {
  const event = await ctx.db.get(eventId);
  if (!event || event.tenantId !== tenantId || event.deletedAt != null)
    return null;
  const organization =
    (
      await ctx.db
        .query("organizations")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
        .collect()
    ).find((row) => row.deletedAt == null) ?? null;
  const rule = readTravelFeeRule(organization);
  let routeMeters: number | null = null;
  if (rule.mode !== "off" && event.travelDistanceMiles == null) {
    const route = await readEventRouteStatus(
      ctx,
      tenantId,
      eventId,
      Date.now(),
    );
    const outbound = route?.legs.find((leg) => leg.leg === "outbound");
    if (outbound?.fact?.status === "ok")
      routeMeters = outbound.fact.distanceMeters;
  }
  return {
    ...resolveEventTravelFee({
      rule,
      typedMiles: event.travelDistanceMiles ?? null,
      routeMeters,
      overrideFee: event.travelFeeOverride ?? null,
      overrideReason: event.travelFeeOverrideReason ?? null,
    }),
    eventId: String(eventId),
    eventVersion: Number(event.version ?? 0),
  };
}

/** The flat travel line for a proposal or invoice, or null when no fee applies. */
export function travelFeeLine(fee: EventTravelFee) {
  if (!(fee.fee > 0)) return null;
  return {
    description: TRAVEL_FEE_LINE_DESCRIPTION,
    pricingBasis: "flat" as const,
    unitPrice: fee.fee,
    quantity: 1,
    notes: travelFeeNote(fee),
  };
}

/** The travel fee panel and invoice form: any signed-in staff member. */
export const getEventTravelFee = query({
  args: { eventId: v.string() },
  handler: async (ctx, { eventId }): Promise<EventTravelFeeView | null> => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || auth.role === "anonymous") return null;
    const id = ctx.db.normalizeId("events", eventId);
    if (!id) return null;
    return readEventTravelFee(ctx, auth.tenantId, id);
  },
});

/** The travel line on a proposal and the fee its event now gives. */
export const getProposalTravelFee = query({
  args: { proposalId: v.string() },
  handler: async (ctx, { proposalId }) => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || auth.role === "anonymous") return null;
    const id = ctx.db.normalizeId("proposals", proposalId);
    const proposal = id ? await ctx.db.get(id) : null;
    if (!proposal || proposal.tenantId !== auth.tenantId || !proposal.eventId)
      return null;
    const eventId = ctx.db.normalizeId("events", String(proposal.eventId));
    const fee = eventId
      ? await readEventTravelFee(ctx, auth.tenantId, eventId)
      : null;
    if (!fee) return null;
    const line = await activeTravelLine(ctx, proposal._id);
    return {
      fee,
      lineAmount: line ? Number(line.unitPrice) : null,
      editable: proposal.status === "draft",
    };
  },
});

async function activeTravelLine(ctx: QueryCtx, proposalId: Id<"proposals">) {
  const lines = await ctx.db
    .query("proposalLineItems")
    .withIndex("by_proposalId", (q) => q.eq("proposalId", proposalId))
    .collect();
  return (
    lines.find((row) => row.deletedAt == null && row.travelFee === true) ?? null
  );
}

/**
 * Brings a draft proposal's travel line in line with its event's fee: adds
 * it, reprices it, or removes it when the fee is zero. Sent proposals are
 * left alone (a new revision carries the change).
 */
export const applyProposalTravelFee = mutation({
  args: { proposalId: v.id("proposals") },
  handler: async (
    ctx,
    { proposalId },
  ): Promise<{
    outcome: "added" | "updated" | "removed" | "unchanged";
    fee: number;
  }> => {
    const auth = await getAuthContext(ctx);
    const proposal = await ctx.db.get(proposalId);
    if (!proposal || !auth.tenantId || proposal.tenantId !== auth.tenantId) {
      throw new Error("Proposal not found");
    }
    if (proposal.status !== "draft") {
      throw new Error(
        "This proposal was already sent. Make a new revision to change its travel fee.",
      );
    }
    const eventId = proposal.eventId
      ? ctx.db.normalizeId("events", String(proposal.eventId))
      : null;
    if (!eventId)
      throw new Error(
        "Link this proposal to an event to work out its travel fee.",
      );
    const fee = await readEventTravelFee(ctx, auth.tenantId, eventId);
    if (!fee) throw new Error("The event for this proposal was not found.");
    const wanted = travelFeeLine(fee);
    const line = await activeTravelLine(ctx, proposalId);
    if (!wanted) {
      if (!line) return { outcome: "unchanged", fee: 0 };
      await ctx.runMutation(
        api.lib.proposalPricing.removeProposalLineAndRecompute,
        {
          docId: line._id,
          version: line.version,
        },
      );
      return { outcome: "removed", fee: 0 };
    }
    if (!line) {
      await ctx.runMutation(
        api.lib.proposalPricing.addProposalLineAndRecompute,
        {
          proposalId,
          ...wanted,
          sortOrder: 1000,
          travelFee: true,
        },
      );
      return { outcome: "added", fee: wanted.unitPrice };
    }
    if (
      Number(line.unitPrice) === wanted.unitPrice &&
      line.notes === wanted.notes
    ) {
      return { outcome: "unchanged", fee: wanted.unitPrice };
    }
    await ctx.runMutation(
      api.lib.proposalPricing.reviseProposalLineAndRecompute,
      {
        docId: line._id,
        version: line.version,
        description: line.description || wanted.description,
        pricingBasis: wanted.pricingBasis,
        unitPrice: wanted.unitPrice,
        quantity: 1,
        unit: line.unit ?? undefined,
        sortOrder: line.sortOrder,
        notes: wanted.notes,
      },
    );
    return { outcome: "updated", fee: wanted.unitPrice };
  },
});
