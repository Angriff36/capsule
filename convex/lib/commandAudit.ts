/**
 * PL-AUDIT (AC-635, AC-193, AC-209, BE-17.3): who ran a step, for which
 * company, when, with which retry key, and what it changed.
 *
 * Every generated step writes its event rows and then calls the event
 * callback (convex/lib/operationalEvents.ts) inside the same transaction.
 * This writes ONE audit row per step transaction from that callback: the
 * first event of the transaction inserts it with the caller (sign-in, staff
 * profile, role) and company; later events of the same transaction (the
 * step's follow-ups and its own last event, which is called last) only
 * update the step name, record, event and version, so the row ends on the
 * step the person actually ran. A retry key is added by the retry-key
 * receipt seam (commandIdempotency.ts) when the step saves its answer.
 *
 * The row keeps ids and names only - never a step's values - so no token,
 * secret or card detail can reach it. The step's event rows (same company,
 * created between occurredAt and lastOccurredAt) carry the change itself.
 *
 * An audit failure never undoes the business step: the error is caught and
 * written to the server log, and the missing row shows up in the history
 * check (convex/recordHistory.ts auditCheck) as an event with no audit row.
 */
import type { ConvexCommandEvent } from "@angriff36/manifest/projections/convex";
import type { Auth } from "convex/server";
import type { Id, TableNames } from "../_generated/dataModel";
import type { DatabaseWriter } from "../_generated/server";
import { getAuthContext } from "./authContext";

type OpenAudit = { id: Id<"commandAuditRecords">; count: number };
/** Authored helpers sometimes get only the database; then the step is the system's. */
type AuditCtx = { db: DatabaseWriter; auth?: Auth };

/** One open audit row per step transaction (each transaction has its own db). */
const openAudits = new WeakMap<object, OpenAudit>();

async function versionOf(ctx: AuditCtx, entityId: string) {
  try {
    const doc = (await ctx.db.get(entityId as Id<TableNames>)) as {
      version?: unknown;
    } | null;
    return typeof doc?.version === "number" ? doc.version : null;
  } catch {
    return null;
  }
}

export async function recordCommandAudit(
  ctx: AuditCtx,
  event: ConvexCommandEvent,
): Promise<void> {
  try {
    const step = {
      stepName: `${event.entity}.${event.command}`,
      subjectEntity: event.entity,
      subjectId: String(event.entityId),
      eventType: event.type,
      manifestEventId: String(event.eventId),
      versionAfter: await versionOf(ctx, String(event.entityId)),
      lastOccurredAt: event.createdAt,
      updatedAt: Date.now(),
    };
    const open = openAudits.get(ctx.db);
    if (open) {
      open.count += 1;
      await ctx.db.patch(open.id, { ...step, eventCount: open.count });
      return;
    }
    const auth = ctx.auth
      ? await getAuthContext({ auth: ctx.auth, db: ctx.db })
      : { id: "", tenantId: "", personId: null, role: "system" };
    const payloadTenant = event.payload.tenantId;
    const tenantId =
      auth.tenantId ||
      (typeof payloadTenant === "string" ? payloadTenant : "");
    if (!tenantId) return;
    const id = await ctx.db.insert("commandAuditRecords", {
      tenantId,
      occurredAt: event.createdAt,
      ...step,
      eventCount: 1,
      actorUserId: auth.id || null,
      actorPersonId: auth.personId ?? null,
      actorRole: auth.role,
      idempotencyKey: null,
      createdAt: step.updatedAt,
    });
    openAudits.set(ctx.db, { id, count: 1 });
  } catch (error) {
    console.error(
      "[audit] step history not saved",
      event.entity,
      event.command,
      String(error),
    );
  }
}

/**
 * An authored step's own event row (one that does not go through a generated
 * step): written and given its history row in one go.
 */
export async function insertStepEvent(
  ctx: AuditCtx,
  row: {
    type: string;
    entity: string;
    entityId: string;
    payload: Record<string, unknown>;
    createdAt: number;
  },
): Promise<Id<"manifestEvents">> {
  const eventId = await ctx.db.insert("manifestEvents", row);
  await recordCommandAudit(ctx, {
    ...row,
    eventId: String(eventId),
    command: row.type,
    emitIndex: 0,
  });
  return eventId;
}

/** The retry key the step was sent with, once its answer is saved. */
export async function recordAuditRetryKey(
  ctx: AuditCtx,
  retryKey: string,
): Promise<void> {
  const open = openAudits.get(ctx.db);
  if (!open) return;
  try {
    await ctx.db.patch(open.id, { idempotencyKey: retryKey });
  } catch (error) {
    console.error("[audit] retry key not saved", String(error));
  }
}
