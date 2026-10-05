// AUTHOR-OWNED — PL-AUDIT (AC-636, AC-209, BE-17.4): for managers, the
// story of one record and a check that no step history went missing.
//
// recordHistory answers, for any record id: which step made it and who ran
// it, every later change (who, when, which step, the record's version after,
// the retry key it ran under), and for an event, what each follow-up did:
// which change it ran for, the inputs it used, what it kept because a person
// had already changed or sent it, and what is still waiting on a manager.
// auditCheck finds this company's recent step events that have no history
// row (a history write that failed, see convex/lib/commandAudit.ts), and the
// imports still running or stopped part way.
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import { getAuthContext } from "./lib/authContext";
import {
  EventReconciliationReceipt,
  type ReconciliationReceiptOutput,
} from "./lib/reconciliationReceipt";
import { requireManager } from "./webhookIntegrations";

/** A step transaction runs well under this; its events fall inside it. */
const STEP_WINDOW_MS = 5_000;
const EVENT_FOLLOW_UPS = [
  "cancellation",
  "closeout",
  "demand",
  "invoice",
  "menu",
  "pack",
  "packet",
  "prep",
  "proposal",
  "recipe",
  "rental",
  "staffing",
  "style",
  "venue",
] as const;

async function managerTenant(ctx: QueryCtx): Promise<string | null> {
  const auth = await getAuthContext(ctx);
  if (!auth.tenantId) return null;
  try {
    requireManager(auth.role);
  } catch {
    return null;
  }
  return auth.tenantId;
}

const eventTenant = (row: Doc<"manifestEvents">) => {
  const tenantId = (row.payload as { tenantId?: unknown } | null)?.tenantId;
  return typeof tenantId === "string" ? tenantId : null;
};

/** The history row of the step transaction that wrote this event. */
async function stepFor(
  ctx: QueryCtx,
  tenantId: string,
  row: Doc<"manifestEvents">,
): Promise<Doc<"commandAuditRecords"> | null> {
  const candidates = await ctx.db
    .query("commandAuditRecords")
    .withIndex("by_occurredAt", (q) =>
      q
        .gte("occurredAt", row.createdAt - STEP_WINDOW_MS)
        .lte("occurredAt", row.createdAt),
    )
    .collect();
  const mine = candidates.filter(
    (audit) =>
      audit.tenantId === tenantId &&
      (audit.lastOccurredAt ?? audit.occurredAt ?? 0) >= row.createdAt,
  );
  // Several steps in the same moment: the one whose last event is this one,
  // else the newest that started before it.
  return (
    mine.find((audit) => audit.manifestEventId === String(row._id)) ??
    mine.sort((a, b) => (b.occurredAt ?? 0) - (a.occurredAt ?? 0))[0] ??
    null
  );
}

async function personName(
  ctx: QueryCtx,
  tenantId: string,
  personId: string | null | undefined,
) {
  if (!personId) return null;
  const id = ctx.db.normalizeId("people", personId);
  const person = id ? await ctx.db.get(id) : null;
  if (!person || person.tenantId !== tenantId) return null;
  return `${person.givenName} ${person.familyName}`.trim() || null;
}

export const recordHistory = query({
  args: { recordId: v.string() },
  handler: async (ctx, { recordId }) => {
    const tenantId = await managerTenant(ctx);
    if (!tenantId) return null;
    const rows = (
      await ctx.db
        .query("manifestEvents")
        .withIndex("by_entityId", (q) => q.eq("entityId", recordId))
        .order("desc")
        .take(100)
    ).filter((row) => eventTenant(row) === tenantId);

    const changes = [];
    for (const row of rows) {
      const step = await stepFor(ctx, tenantId, row);
      changes.push({
        eventId: String(row._id),
        at: row.createdAt,
        change: row.type,
        step: step?.stepName ?? null,
        byName: await personName(ctx, tenantId, step?.actorPersonId),
        byRole: step?.actorRole ?? null,
        bySystem: step != null && !step.actorUserId,
        retryKey: step?.idempotencyKey ?? null,
        versionAfter:
          step?.manifestEventId === String(row._id)
            ? (step.versionAfter ?? null)
            : null,
        historyMissing: step == null,
      });
    }

    const followUps = [];
    for (const domain of EVENT_FOLLOW_UPS) {
      const head: Doc<"materializationReceipts"> | null = await ctx.db
        .query("materializationReceipts")
        .withIndex("by_receiptKey", (q) =>
          q.eq(
            "receiptKey",
            `${tenantId}:head:${EventReconciliationReceipt.FAMILY}:${recordId}:${domain}`,
          ),
        )
        .first();
      if (!head || head.tenantId !== tenantId) continue;
      const output = head.output as ReconciliationReceiptOutput;
      followUps.push({
        domain,
        ranFor: output.triggerType,
        ranForEventId: output.triggerEventId,
        at: head.updatedAt ?? head.createdAt ?? null,
        inputCheckpoint: output.inputVersions?.checkpoint ?? null,
        finished: output.checkpoint?.state === "complete",
        created: output.createdCount,
        updated: output.updatedCount,
        retired: output.retiredCount,
        keptAsIs: output.preservedCount,
        waiting: (output.unresolved ?? []).map((item) => ({
          code: item.code,
          records: item.recordIds.length,
          whoCanAct: "Managers",
        })),
      });
    }

    return {
      recordId,
      madeBy: changes.length > 0 ? changes[changes.length - 1] : null,
      changes,
      followUps,
    };
  },
});

export const auditCheck = query({
  args: { since: v.number() },
  handler: async (ctx, { since }) => {
    const tenantId = await managerTenant(ctx);
    if (!tenantId) return null;
    const recent = await ctx.db.query("manifestEvents").order("desc").take(500);
    let checked = 0;
    let missing = 0;
    let oldestMissingAt: number | null = null;
    for (const row of recent) {
      if (row.createdAt < since || eventTenant(row) !== tenantId) continue;
      checked += 1;
      if (await stepFor(ctx, tenantId, row)) continue;
      missing += 1;
      oldestMissingAt = row.createdAt;
    }
    const runs = await ctx.db
      .query("importRuns")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .order("desc")
      .take(200);
    const imports = runs
      .filter(
        (run) =>
          run.deletedAt == null &&
          (run.status === "committing" || run.status === "failed"),
      )
      .map((run) => ({
        importRunId: String(run._id),
        kind: run.datasetType,
        state: run.status === "committing" ? "running" : "stopped part way",
        since: run.startTime ?? run.createdAt ?? null,
        whoCanAct: "Managers",
      }));
    return { checked, missing, oldestMissingAt, imports };
  },
});
