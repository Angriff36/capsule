// AUTHOR-OWNED — one text per alert per person, even when two scans run at
// the same moment. A scan claims each text inside a mutation before it calls
// the text provider; Convex runs those claims one at a time, so only one scan
// gets it. A claim whose answer never came back is "not sure it went": it
// counts as a try and is never re-sent on its own (the provider has no
// repeat key we can rely on, and a second text is worse than a missed one).
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import {
  isDue,
  summarizeDelivery,
  type DeliveryAttemptRow,
} from "./lib/deliveryState";

const ALERT_ENTITY = "SmsAlert";
const CLAIM_ENTITY = "SmsAlertClaim";

/** Same bound as before: three tries, each scan may try again at once. */
const SMS_POLICY = {
  maxAttempts: 3,
  baseDelayMs: 0,
  maxDelayMs: 0,
  leaseMs: 5 * 60_000,
};

export const claimAlert = internalMutation({
  args: {
    tenantId: v.string(),
    triggerKey: v.string(),
    personId: v.string(),
  },
  handler: async (ctx, args): Promise<{ claimed: boolean }> => {
    const ledger = await ctx.db
      .query("manifestEvents")
      .withIndex("by_entityId", (q) => q.eq("entityId", args.tenantId))
      .collect();
    const rows: DeliveryAttemptRow[] = [];
    for (const row of ledger) {
      if (row.entity !== ALERT_ENTITY && row.entity !== CLAIM_ENTITY) continue;
      const payload = row.payload as Record<string, unknown>;
      if (
        payload?.tenantId !== args.tenantId ||
        payload.triggerKey !== args.triggerKey ||
        payload.personId !== args.personId
      ) {
        continue;
      }
      rows.push({
        outcome:
          row.type === "SmsAlertSent"
            ? "succeeded"
            : row.type === "SmsAlertFailed"
              ? "failed"
              : "started",
        at: row.createdAt,
        // Each failed text may be tried again on the next scan, as before.
        errorClass: row.type === "SmsAlertFailed" ? "unknown" : null,
      });
    }
    const now = Date.now();
    if (!isDue(summarizeDelivery(rows, now, SMS_POLICY), now)) {
      return { claimed: false };
    }
    await ctx.db.insert("manifestEvents", {
      type: "SmsAlertStarted",
      entity: CLAIM_ENTITY,
      entityId: args.tenantId,
      payload: {
        tenantId: args.tenantId,
        triggerKey: args.triggerKey,
        personId: args.personId,
      },
      createdAt: now,
    });
    return { claimed: true };
  },
});
