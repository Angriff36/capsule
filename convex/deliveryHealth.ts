// AUTHOR-OWNED — one look at every kind of outside message Capsule sends
// (webhooks, text alerts, sign-in emails, phone alerts): how many wait for a try, how long
// the oldest has waited, how many Capsule stopped trying, and how many it is
// not sure about. Counts only one workspace, for its managers.
import type { Doc } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import { getAuthContext } from "./lib/authContext";
import {
  summarizeDelivery,
  type DeliveryAttemptRow,
  type DeliveryPolicy,
  type DeliverySummary,
} from "./lib/deliveryState";
import { phoneAlertHealthFor } from "./pushDeviceHealth";
import { SMS_POLICY, smsAlertHistories } from "./smsAlertClaims";
import { signInEmailStates } from "./staffSignInEmail";
import {
  CLAIM_ENTITY,
  deliveryHistoryFor,
  requireManager,
  WEBHOOK_DELIVERY_POLICY,
} from "./webhookIntegrations";

export interface ChannelHealth {
  channel: "webhooks" | "texts" | "signInEmails" | "phoneAlerts";
  label: string;
  waiting: number;
  oldestWaitingSince: number | null;
  stopped: number;
  notSure: number;
  delivered: number;
  /** Phone alerts only: who owns the phones that missed the last alert. */
  missedBy?: string[];
}

function tally(
  channel: ChannelHealth["channel"],
  label: string,
  items: Array<{ state: DeliverySummary["state"]; firstAt: number | null }>,
): ChannelHealth {
  const health: ChannelHealth = {
    channel,
    label,
    waiting: 0,
    oldestWaitingSince: null,
    stopped: 0,
    notSure: 0,
    delivered: 0,
  };
  for (const item of items) {
    if (item.state === "delivered") health.delivered += 1;
    else if (item.state === "terminal_failed") health.stopped += 1;
    else if (item.state === "uncertain") health.notSure += 1;
    else {
      health.waiting += 1;
      if (
        item.firstAt != null &&
        (health.oldestWaitingSince == null ||
          item.firstAt < health.oldestWaitingSince)
      ) {
        health.oldestWaitingSince = item.firstAt;
      }
    }
  }
  return health;
}

function summarized(
  histories: Iterable<DeliveryAttemptRow[]>,
  now: number,
  policy: DeliveryPolicy,
) {
  return [...histories].map((rows) => ({
    state: summarizeDelivery(rows, now, policy).state,
    firstAt: rows.reduce<number | null>(
      (first, row) => (first == null || row.at < first ? row.at : first),
      null,
    ),
  }));
}

/**
 * The three channel tallies for one company. `tenantLedger` is the company's
 * own ledger rows (by_entityId = tenantId); the caller reads it once and can
 * share it with other checks (the notification bell does).
 */
export async function outsideMessageHealthFor(
  ctx: QueryCtx,
  tenantId: string,
  tenantLedger: Doc<"manifestEvents">[],
  now: number,
): Promise<ChannelHealth[]> {
  const [webhookRows, claimRows, signInRows, phones] = await Promise.all([
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
      .withIndex("by_entity", (q) => q.eq("entity", "StaffSignInEmail"))
      .collect(),
    phoneAlertHealthFor(ctx, tenantId),
  ]);

  const webhooks = deliveryHistoryFor(
    [...webhookRows, ...claimRows],
    tenantId,
  ).map((entry) => entry.rows);
  const texts = smsAlertHistories(tenantLedger, tenantId).values();
  const signIns = signInEmailStates(signInRows, tenantId, now).map((entry) => ({
    state: entry.state,
    firstAt: entry.lastAttemptAt,
  }));
  return [
    tally(
      "webhooks",
      "Webhooks",
      summarized(webhooks, now, WEBHOOK_DELIVERY_POLICY),
    ),
    tally("texts", "Text alerts", summarized(texts, now, SMS_POLICY)),
    tally("signInEmails", "Sign-in emails", signIns),
    // Counted per phone, not per alert: did the phone's last alert arrive?
    {
      channel: "phoneAlerts",
      label: "Phone alerts",
      waiting: 0,
      oldestWaitingSince: null,
      stopped: phones.missed,
      notSure: 0,
      delivered: phones.reached,
      missedBy: phones.missedBy,
    },
  ];
}

export const outsideMessageHealth = query({
  args: {},
  handler: async (ctx): Promise<ChannelHealth[] | null> => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId) return null;
    try {
      requireManager(auth.role);
    } catch {
      return null;
    }
    const tenantId = auth.tenantId;
    const tenantLedger = await ctx.db
      .query("manifestEvents")
      .withIndex("by_entityId", (q) => q.eq("entityId", tenantId))
      .collect();
    return outsideMessageHealthFor(ctx, tenantId, tenantLedger, Date.now());
  },
});
