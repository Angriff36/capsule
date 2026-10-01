// AUTHOR-OWNED — what a manager sees and can do about outbound webhook
// deliveries: one row per event per endpoint with its state (delivered, will
// try again at, stopped trying), and "Try again" for a stopped one. The
// sender itself lives in webhookIntegrations.ts.
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { getAuthContext, requireTenant } from "./lib/authContext";
import {
  deliveryErrorLabel,
  summarizeDelivery,
  type DeliveryState,
} from "./lib/deliveryState";
import {
  activeEndpointsFor,
  CLAIM_ENTITY,
  deliveryHistoryFor,
  deliveryKey,
  loadDeliveryRows,
  requireManager,
  SUBSCRIBABLE_EVENTS,
  WEBHOOK_DELIVERY_POLICY,
} from "./webhookIntegrations";
import { insertStepEvent } from "./lib/commandAudit";

export interface DeliveryStateView {
  key: string;
  endpointId: string;
  endpointLabel: string;
  sourceEventId: string;
  eventType: string;
  eventLabel: string;
  state: DeliveryState;
  attemptCount: number;
  maxAttempts: number;
  nextRetryAt: number | null;
  lastHttpStatus: number | null;
  lastAttemptAt: number | null;
  problem: string | null;
}

const EVENT_LABELS = new Map<string, string>(
  SUBSCRIBABLE_EVENTS.map((entry) => [entry.type, entry.label]),
);

export const listDeliveryStates = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args): Promise<DeliveryStateView[]> => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId) return [];
    const tenantId = auth.tenantId;
    const limit = Math.max(1, Math.min(50, args.limit ?? 20));
    const [deliveryRows, claimRows, endpointRows] = await Promise.all([
      ctx.db
        .query("manifestEvents")
        .withIndex("by_entity", (q) => q.eq("entity", "WebhookDelivery"))
        .collect(),
      ctx.db
        .query("manifestEvents")
        .withIndex("by_entity", (q) => q.eq("entity", CLAIM_ENTITY))
        .collect(),
      ctx.db
        .query("manifestEvents")
        .withIndex("by_entity", (q) => q.eq("entity", "WebhookEndpoint"))
        .collect(),
    ]);
    const labels = new Map<string, string>();
    for (const endpoint of activeEndpointsFor(endpointRows, tenantId)) {
      labels.set(endpoint.endpointId, endpoint.label || endpoint.url);
    }
    const now = Date.now();
    const views = deliveryHistoryFor(
      [...deliveryRows, ...claimRows],
      tenantId,
    ).map((entry): DeliveryStateView => {
      const summary = summarizeDelivery(
        entry.rows,
        now,
        WEBHOOK_DELIVERY_POLICY,
      );
      return {
        key: entry.key,
        endpointId: entry.endpointId,
        endpointLabel: labels.get(entry.endpointId) ?? "Removed endpoint",
        sourceEventId: entry.sourceEventId,
        eventType: entry.eventType,
        eventLabel:
          EVENT_LABELS.get(entry.eventType) ??
          (entry.eventType === "WebhookTest" ? "Test" : entry.eventType),
        state: summary.state,
        attemptCount: summary.attemptCount,
        maxAttempts: WEBHOOK_DELIVERY_POLICY.maxAttempts,
        nextRetryAt: summary.nextRetryAt,
        lastHttpStatus: summary.lastHttpStatus,
        lastAttemptAt: summary.lastAttemptAt,
        problem: summary.errorClass
          ? deliveryErrorLabel(summary.errorClass)
          : null,
      };
    });
    views.sort(
      (left, right) => (right.lastAttemptAt ?? 0) - (left.lastAttemptAt ?? 0),
    );
    return views.slice(0, limit);
  },
});

/**
 * A person's "Try again" on a delivery Capsule stopped trying (or one still
 * waiting for its next try): it starts a fresh attempt budget, and the next
 * dispatch tick sends it with the same delivery id.
 */
export const retryDelivery = mutation({
  args: {
    endpointId: v.string(),
    sourceEventId: v.string(),
    eventType: v.string(),
  },
  handler: async (ctx, args): Promise<{ queued: true }> => {
    const auth = await getAuthContext(ctx);
    const tenantId = requireTenant(auth);
    requireManager(auth.role);
    const endpointRows = await ctx.db
      .query("manifestEvents")
      .withIndex("by_entity", (q) => q.eq("entity", "WebhookEndpoint"))
      .collect();
    const endpoint = activeEndpointsFor(endpointRows, tenantId).find(
      (entry) => entry.endpointId === args.endpointId,
    );
    if (!endpoint) {
      throw new ConvexError("That webhook endpoint no longer exists.");
    }
    if (args.eventType === "WebhookTest") {
      throw new ConvexError("Use Send test to send another test.");
    }
    const key = deliveryKey(
      args.endpointId,
      args.sourceEventId,
      args.eventType,
    );
    const rows = await loadDeliveryRows(
      ctx.db,
      args.endpointId,
      args.sourceEventId,
    );
    const history = deliveryHistoryFor(rows, tenantId).find(
      (entry) => entry.key === key,
    );
    if (!history) {
      throw new ConvexError("Capsule has not tried to send this one yet.");
    }
    const summary = summarizeDelivery(
      history.rows,
      Date.now(),
      WEBHOOK_DELIVERY_POLICY,
    );
    if (summary.state === "delivered") {
      throw new ConvexError("This one was already delivered.");
    }
    if (summary.state === "processing") {
      throw new ConvexError("Capsule is sending this one right now.");
    }
    await insertStepEvent(ctx, {
      type: "WebhookDeliveryRetryRequested",
      entity: "WebhookDelivery",
      entityId: `${args.endpointId}:${args.sourceEventId}`,
      payload: {
        tenantId,
        endpointId: args.endpointId,
        sourceEventId: args.sourceEventId,
        eventType: args.eventType,
        status: "retry_requested",
        occurredAt: history.occurredAt,
        requestedBy: auth.id,
      },
      createdAt: Date.now(),
    });
    await ctx.scheduler.runAfter(
      0,
      internal.webhookIntegrations.dispatchPending,
      { tenantId, scheduleNext: false },
    );
    return { queued: true };
  },
});
