/**
 * AUTHOR SEAM — "why is this here?" for everything Capsule made by itself on
 * one event (spec BE-18.7, AC-642). One read returns, per record: id and
 * version, value and status, generated / added by hand / changed by a person,
 * the records and rule version it came from, plain words for why, whether it
 * is out of date, when Capsule last brought it up to date, and what blocks it.
 *
 * Each kind follows its own generated read rule (canRead mirror in
 * convex/search.ts): a person sees explanations only for records they could
 * open. The event itself is read through the generated getEvent (tenant,
 * soft delete, read rule, and the calculated timing fields).
 */
import { v } from "convex/values";
import { query, type QueryCtx } from "./_generated/server";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { getAuthContext } from "./lib/authContext";
import { canRead } from "./search";
import { EventReconciliationReceipt } from "./lib/reconciliationReceipt";
import type { ReconciliationReceiptOutput } from "./lib/reconciliationReceipt";
import {
  readEventSources,
  readProposalLines,
} from "./lib/proposalGenerateSources";
import {
  parseGenerationRecord,
  planLines,
} from "../src/lib/proposalGeneration";
import { eventTimingWindows } from "../src/lib/eventTimingMilestones";
import {
  explainPlanningAnswer,
  explainProposalLine,
  explainTimelineMilestone,
  planningRuleId,
  type AutomaticExplanation,
  type AutomaticSource,
} from "../src/lib/automaticExplanation";
import {
  explainContribution,
  explainPackLineAuto,
  explainPrepTask,
  explainStaffNeed,
} from "../src/lib/automaticExplanationOps";

const live = (row: { deletedAt?: unknown }) => row.deletedAt == null;

type Head = { at: number | null; unresolved: Map<string, string> };

/** The newest reconcile of one part of the event: when it ran and which
 * records it could not settle by itself. */
async function readHead(
  ctx: QueryCtx,
  tenantId: string,
  eventId: string,
  domain: string,
): Promise<Head> {
  const receiptKey = `${tenantId}:head:${EventReconciliationReceipt.FAMILY}:${eventId}:${domain}`;
  const row = await ctx.db
    .query("materializationReceipts")
    .withIndex("by_receiptKey", (q) => q.eq("receiptKey", receiptKey))
    .first();
  const unresolved = new Map<string, string>();
  if (!row || row.tenantId !== tenantId) return { at: null, unresolved };
  const output = row.output as ReconciliationReceiptOutput | undefined;
  for (const entry of output?.unresolved ?? [])
    for (const id of entry.recordIds)
      unresolved.set(
        String(id),
        `Capsule could not update this by itself (${entry.code.toLowerCase().replace(/_/g, " ")}). A person needs to check it.`,
      );
  return { at: row.updatedAt ?? row.createdAt ?? null, unresolved };
}

async function byEvent<T extends { tenantId: string; deletedAt?: unknown }>(
  ctx: QueryCtx,
  table: string,
  tenantId: string,
  eventId: Id<"events">,
): Promise<T[]> {
  const rows = await (ctx.db as any)
    .query(table)
    .withIndex("by_eventId", (q: any) => q.eq("eventId", eventId))
    .collect();
  return (rows as T[]).filter((row) => row.tenantId === tenantId && live(row));
}

export const explainEventAutomaticWork = query({
  args: { eventId: v.string() },
  handler: async (
    ctx,
    { eventId },
  ): Promise<{ eventId: string; items: AutomaticExplanation[] } | null> => {
    const auth = await getAuthContext(ctx);
    if (!auth || auth.role === "anonymous" || !auth.tenantId) return null;
    const tenantId = auth.tenantId;
    const id = ctx.db.normalizeId("events", eventId);
    if (id == null) return null;
    // Generated read: tenant, soft delete, event read rule, calculated times.
    const event = (await ctx.runQuery(api.queries.getEvent, { id })) as
      (Doc<"events"> & Record<string, unknown>) | null;
    if (!event) return null;
    const items: AutomaticExplanation[] = [];

    if (canRead(auth, ["salesAccess"])) {
      const head = await readHead(ctx, tenantId, id, "proposal");
      const proposals = await byEvent<Doc<"proposals">>(
        ctx,
        "proposals",
        tenantId,
        id,
      );
      const read =
        proposals.length > 0 ? await readEventSources(ctx, event) : null;
      const sourcesByKey = new Map<string, AutomaticSource[]>(
        (read?.sources ?? []).map((source) => [
          source.sourceKey,
          source.sources,
        ]),
      );
      for (const proposal of proposals) {
        const { rows, existing } = await readProposalLines(ctx, proposal);
        const record = parseGenerationRecord(proposal.generationJson);
        const plan =
          record && read ? planLines(record, read.sources, existing) : null;
        for (const line of rows.filter(
          (row) => live(row) && row.removedAt == null,
        ))
          items.push(
            explainProposalLine({
              line: {
                _id: String(line._id),
                version: line.version,
                proposalId: String(proposal._id),
                description: line.description,
                quantity: Number(line.quantity),
                pricingBasis: String(line.pricingBasis),
                unitPrice: Number(line.unitPrice),
                menuDishId: line.menuDishId ? String(line.menuDishId) : null,
              },
              record,
              plan,
              sourcesByKey,
              lastReconciledAt: head.at,
            }),
          );
      }
    }

    if (canRead(auth, ["staffAccess"])) {
      const head = await readHead(ctx, tenantId, id, "timing");
      const windows = new Map(
        eventTimingWindows(event).map((window) => [
          window.key,
          window.startsAt,
        ]),
      );
      const rows = await byEvent<Doc<"eventTimelineActivities">>(
        ctx,
        "eventTimelineActivities",
        tenantId,
        id,
      );
      for (const row of rows)
        items.push(
          explainTimelineMilestone({
            row: { ...row, _id: String(row._id) },
            eventId: id,
            eventStartsAt: row.timingMilestone
              ? (windows.get(row.timingMilestone) ?? null)
              : null,
            lastReconciledAt: head.at,
            unresolved: head.unresolved.get(String(row._id)) ?? null,
          }),
        );

      const receipts = await byEvent<Doc<"planningReceipts">>(
        ctx,
        "planningReceipts",
        tenantId,
        id,
      );
      for (const receipt of receipts) {
        const ruleKey = planningRuleId(receipt.suggestionKey);
        const ruleId = ruleKey
          ? ctx.db.normalizeId("planningRules", ruleKey)
          : null;
        const ruleRow = ruleId ? await ctx.db.get(ruleId) : null;
        const rule =
          ruleRow && ruleRow.tenantId === tenantId && live(ruleRow)
            ? ruleRow
            : null;
        items.push(
          explainPlanningAnswer({
            receipt: { ...receipt, _id: String(receipt._id) },
            rule: rule
              ? {
                  _id: String(rule._id),
                  version: rule.version,
                  name: rule.name,
                  updatedAt: rule.updatedAt ?? null,
                }
              : null,
            eventId: id,
            guestsNow:
              typeof event.expectedHeadcount === "number"
                ? event.expectedHeadcount
                : null,
          }),
        );
      }

      const packHead = await readHead(ctx, tenantId, id, "pack");
      const lists = await byEvent<Doc<"packLists">>(
        ctx,
        "packLists",
        tenantId,
        id,
      );
      for (const list of lists) {
        const lines = (
          await ctx.db
            .query("packListItems")
            .withIndex("by_packListId", (q) => q.eq("packListId", list._id))
            .collect()
        ).filter((row) => row.tenantId === tenantId && live(row));
        for (const line of lines)
          items.push(
            explainPackLineAuto({
              row: {
                ...(line as any),
                _id: String(line._id),
                packListId: String(list._id),
                requiredQuantity: Number(line.requiredQuantity),
                packedQuantity: Number(line.packedQuantity),
              },
              lastReconciledAt: packHead.at,
            }),
          );
      }
    }

    if (canRead(auth, ["kitchenAccess", "manageAccess"])) {
      const head = await readHead(ctx, tenantId, id, "prep");
      const rows = await byEvent<Doc<"prepTasks">>(
        ctx,
        "prepTasks",
        tenantId,
        id,
      );
      for (const row of rows)
        items.push(
          explainPrepTask({
            row: { ...(row as any), _id: String(row._id) },
            lastReconciledAt: head.at,
            unresolved: head.unresolved.get(String(row._id)) ?? null,
          }),
        );
    }

    if (canRead(auth, ["inventoryAccess", "manageAccess"])) {
      const head = await readHead(ctx, tenantId, id, "demand");
      const rows = await byEvent<Doc<"eventIngredientContributions">>(
        ctx,
        "eventIngredientContributions",
        tenantId,
        id,
      );
      const names = new Map<string, string>();
      for (const row of rows) {
        const key = String(row.ingredientId);
        if (names.has(key)) continue;
        const ingredient = await ctx.db.get(row.ingredientId);
        names.set(
          key,
          ingredient && ingredient.tenantId === tenantId ? ingredient.name : "",
        );
      }
      for (const row of rows)
        items.push(
          explainContribution({
            row: {
              ...(row as any),
              _id: String(row._id),
              ingredientName: names.get(String(row.ingredientId)) || null,
            },
            lastReconciledAt: head.at,
          }),
        );
    }

    if (canRead(auth, ["workforceAccess", "workforceSelfAccess"])) {
      const head = await readHead(ctx, tenantId, id, "staffing");
      const rows = (
        await byEvent<Doc<"eventStaffNeeds">>(
          ctx,
          "eventStaffNeeds",
          tenantId,
          id,
        )
      ).filter((row) => row.status !== "cancelled");
      const crewStartsAt =
        typeof event.timingStaffOnAt === "number"
          ? event.timingStaffOnAt
          : null;
      for (const row of rows) {
        const templateId = row.staffingTemplateId
          ? ctx.db.normalizeId("staffingTemplates", row.staffingTemplateId)
          : null;
        const template = templateId ? await ctx.db.get(templateId) : null;
        items.push(
          explainStaffNeed({
            row: { ...(row as any), _id: String(row._id) },
            eventId: id,
            template:
              template && template.tenantId === tenantId
                ? {
                    _id: String(template._id),
                    version: template.version,
                    name: template.name,
                    retiredAt: (template as any).retiredAt ?? null,
                  }
                : null,
            crewStartsAt,
            lastReconciledAt: head.at,
            unresolved: head.unresolved.get(String(row._id)) ?? null,
          }),
        );
      }
    }

    return { eventId: id, items };
  },
});
