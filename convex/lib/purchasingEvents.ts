import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { api } from "../_generated/api";
import { getAuthContext, requireTenant } from "./authContext";
import { recipeUnitRatio } from "../../src/lib/recipeUnitConversion";

export async function retireUnusedAutomaticDraft(
  ctx: MutationCtx,
  lineId: Id<"vendorOrderLines">,
) {
  const tenantId = requireTenant(await getAuthContext(ctx));
  const line = await ctx.db.get(lineId);
  if (
    !line ||
    line.tenantId !== tenantId ||
    line.deletedAt != null ||
    line.status !== "added" ||
    line.quantityIsManual !== false ||
    line.plannedQuantity !== 0 ||
    line.orderedQuantity !== 0 ||
    line.receivedQuantity !== 0
  )
    return;
  const order = await ctx.db.get(line.vendorOrderId);
  if (
    !order ||
    order.tenantId !== tenantId ||
    order.deletedAt != null ||
    order.status !== "draft"
  )
    return;
  const links = await ctx.db
    .query("vendorOrderLineDemands")
    .withIndex("by_vendorOrderLineId", (q) =>
      q.eq("vendorOrderLineId", line._id),
    )
    .collect();
  if (
    links.some(
      (link) =>
        link.tenantId === tenantId &&
        link.deletedAt == null &&
        link.removedAt == null,
    )
  )
    return;
  await ctx.runMutation(api.mutations.VendorOrderLine_retireEmptyDraft, {
    docId: line._id,
    version: line.version,
  });
  const remaining = await ctx.db
    .query("vendorOrderLines")
    .withIndex("by_vendorOrderId", (q) => q.eq("vendorOrderId", order._id))
    .collect();
  if (
    order.sourceRangeStart != null &&
    !remaining.some(
      (item) =>
        item.tenantId === tenantId &&
        item.deletedAt == null &&
        item.status !== "cancelled",
    )
  ) {
    const current = await ctx.db.get(order._id);
    await ctx.runMutation(api.mutations.VendorOrder_retireEmptyDraft, {
      docId: order._id,
      version: current!.version,
    });
  }
}

async function draftQuantityProvenance(
  ctx: MutationCtx,
  line: Doc<"vendorOrderLines">,
  excludedEventId?: string,
) {
  if (line.quantityIsManual != null)
    return { manual: line.quantityIsManual, planned: line.plannedQuantity };
  const history = await ctx.db
    .query("manifestEvents")
    .withIndex("by_entityId", (q) => q.eq("entityId", line._id))
    .order("desc")
    .collect();
  const quantityEvents = history.filter(
    (event) =>
      event._id !== excludedEventId &&
      event.entity === "VendorOrderLine" &&
      event.payload?.tenantId === line.tenantId &&
      [
        "VendorOrderLineWeeklyEnsured",
        "VendorOrderLineQuantityRevised",
        "VendorOrderLineAdded",
      ].includes(event.type),
  );
  const latest = quantityEvents[0];
  const automatic = quantityEvents.find(
    (event) => event.type === "VendorOrderLineWeeklyEnsured",
  );
  const hasRecordedPlan = automatic?.payload?.plannedQuantity != null;
  const planned =
    line.plannedQuantity ??
    (hasRecordedPlan
      ? automatic?.payload?.plannedQuantity
      : automatic?.payload?.orderedQuantity);
  return {
    manual:
      latest?.type === "VendorOrderLineWeeklyEnsured"
        ? latest.payload?.plannedQuantity != null
          ? (latest.payload?.quantityIsManual ?? undefined)
          : latest.payload?.orderedQuantity !== line.orderedQuantity
        : latest
          ? true
          : undefined,
    planned:
      typeof planned === "number" && Number.isFinite(planned) && planned >= 0
        ? planned
        : undefined,
  };
}

/** First refresh of an older line reads its actual history before changing quantity. */
export async function adoptLegacyDraftQuantity(
  ctx: MutationCtx,
  lineId: Id<"vendorOrderLines">,
  currentEventId: string,
) {
  const tenantId = requireTenant(await getAuthContext(ctx));
  const line = await ctx.db.get(lineId);
  if (!line || line.tenantId !== tenantId || line.deletedAt != null)
    throw new Error("Draft order line not found");
  if (line.quantityIsManual != null) return;
  const provenance = await draftQuantityProvenance(ctx, line, currentEventId);
  await ctx.runMutation(
    api.mutations.VendorOrderLine_reconcileDraftRequirement,
    {
      docId: line._id,
      version: line.version,

      ...(line.plannedQuantity != null
        ? { plannedQuantity: line.plannedQuantity }
        : {}),
      ...(provenance.manual != null
        ? { quantityIsManual: provenance.manual }
        : {
            quantityReviewReason:
              "Check the order quantity: its earlier calculation could not be verified.",
          }),
      ...(line.ingredientDemandId
        ? { ingredientDemandId: line.ingredientDemandId }
        : {}),
    },
  );
}

/** Remove cancelled contributions from editable drafts; committed orders stay historical. */
export async function reconcileCancelledPurchaseDrafts(
  ctx: MutationCtx,
  needId: Id<"purchaseNeeds">,
) {
  const tenantId = requireTenant(await getAuthContext(ctx));
  const need = await ctx.db.get(needId);
  if (!need || need.tenantId !== tenantId || need.deletedAt != null) return;
  if (need.status !== "cancelled") return;
  const links = await ctx.db
    .query("vendorOrderLineDemands")
    .withIndex("by_ingredientDemandId", (q) =>
      q.eq("ingredientDemandId", need.ingredientDemandId),
    )
    .collect();
  const groups = new Map<Id<"vendorOrderLines">, typeof links>();
  for (const link of links) {
    if (
      link.tenantId !== tenantId ||
      link.deletedAt != null ||
      link.removedAt != null
    )
      continue;
    const group = groups.get(link.vendorOrderLineId) ?? [];
    group.push(link);
    groups.set(link.vendorOrderLineId, group);
  }
  for (const [lineId, contributions] of groups) {
    const line = await ctx.db.get(lineId);
    if (!line || line.tenantId !== tenantId || line.deletedAt != null) continue;
    const order = await ctx.db.get(line.vendorOrderId);
    if (
      !order ||
      order.tenantId !== tenantId ||
      order.deletedAt != null ||
      order.status !== "draft"
    )
      continue;
    const provenance = await draftQuantityProvenance(ctx, line);
    for (const link of contributions) {
      if (link.vendorOrderId !== order._id)
        throw new Error("Draft contribution does not match its order");
      await ctx.runMutation(api.mutations.VendorOrderLineDemand_retire, {
        docId: link._id,
        version: link.version,

        reason: need.cancellationReason ?? "Purchase need cancelled",
      });
    }
    const remaining = await ctx.db
      .query("vendorOrderLineDemands")
      .withIndex("by_vendorOrderLineId", (q) =>
        q.eq("vendorOrderLineId", line._id),
      )
      .collect();
    const nextDemand = remaining.find(
      (link) =>
        link.tenantId === tenantId &&
        link.deletedAt == null &&
        link.removedAt == null,
    )?.ingredientDemandId;
    // Demand links record a full requirement, not a share of purchased stock.
    // Removing it reduces the prior plan; existing stock coverage stays counted once.
    // Duplicate links for the same demand do not multiply that requirement.
    const quantities = contributions.map((link) => {
      const ratio = recipeUnitRatio(link.unit, line.unit);
      return ratio == null ? null : link.contributionQuantity * ratio;
    });
    const removed = quantities.every((quantity) => quantity != null)
      ? Math.max(...(quantities as number[]))
      : null;
    const planned =
      provenance.planned != null && removed != null
        ? Math.max(0, provenance.planned - removed)
        : undefined;
    if (line.status === "added" && line.receivedQuantity === 0)
      await ctx.runMutation(
        api.mutations.VendorOrderLine_reconcileDraftRequirement,
        {
          docId: line._id,
          version: line.version,

          ...(planned != null ? { plannedQuantity: planned } : {}),
          ...(planned != null && provenance.manual != null
            ? { quantityIsManual: provenance.manual }
            : {}),
          ...(removed == null
            ? {
                quantityReviewReason:
                  "Check the order quantity: the removed requirement uses a different measurement.",
              }
            : provenance.manual == null
              ? {
                  quantityReviewReason:
                    "Check the order quantity: its earlier calculation could not be verified.",
                }
              : {}),
          ...(nextDemand ? { ingredientDemandId: nextDemand } : {}),
        },
      );
  }
  if (need.vendorOrderId) {
    const order = await ctx.db.get(need.vendorOrderId);
    if (
      order?.tenantId === tenantId &&
      (order.status === "draft" ||
        (order.status === "cancelled" && order.submittedAt == null))
    )
      await ctx.runMutation(api.mutations.PurchaseNeed_releaseCancelledDraft, {
        docId: need._id,
        version: need.version,
      });
  }
}

/** Runs inside the authorized event cancellation; settled purchasing stays intact. */
export async function standDownEventPurchasing(
  ctx: MutationCtx,
  eventId: Id<"events">,
) {
  const tenantId = requireTenant(await getAuthContext(ctx));
  const event = await ctx.db.get(eventId);
  if (!event || event.tenantId !== tenantId || event.stage !== "cancelled")
    throw new Error("Purchasing stand-down requires a cancelled event");
  const needs = await ctx.db
    .query("purchaseNeeds")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .collect();
  for (const need of needs) {
    if (need.tenantId === tenantId && need.status === "cancelled") {
      await reconcileCancelledPurchaseDrafts(ctx, need._id);
      continue;
    }
    if (
      need.tenantId !== tenantId ||
      need.deletedAt != null ||
      !["open", "ordered"].includes(need.status)
    )
      continue;
    await ctx.runMutation(api.mutations.PurchaseNeed_standDownWithEvent, {
      docId: need._id,
    });
  }
}
