/**
 * AUTHOR SEAM — the record of staff alert texts and "Send again" (PL-SMS-SOCIAL,
 * AC-353). The scan in smsAlerts.ts sends each alert to each person once, even
 * when a tick runs twice. A manager can still send one text again on purpose;
 * one click (one request id) sends at most once, even when the call repeats.
 * Whether an accepted text reached the phone comes from smsAlertDelivery.ts.
 */
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import {
  action,
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { getAuthContext, requireTenant } from "./lib/authContext";
import { insertStepEvent } from "./lib/commandAudit";
import {
  isSendablePhone,
  phoneKey,
  requireTwilioConfig,
  safeTwilioMessage,
  sendSms,
  twilioErrorCode,
  TWILIO_UNSUBSCRIBED_CODE,
} from "./lib/twilio";
import { canManage, decryptField, personName } from "./smsAlerts";
import {
  DELIVERY_ENTITY,
  notDeliveredReason,
  statusCallbackUrl,
} from "./smsAlertDelivery";

const ALERT_ENTITY = "SmsAlert";
const SEND_AGAIN_ENTITY = "SmsAlertSendAgain";
const RECENT_LIMIT = 25;

const ALERT_LABELS: Record<string, string> = {
  event_soon: "Event starts soon",
  delivery_dispatched: "Delivery on its way",
  allergen_incident: "Allergen incident",
};

const OPTED_OUT_NOTE =
  "This person texted STOP to the Capsule number, so texts to this phone stopped. If they text START, use Send again.";

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

export interface RecentText {
  at: number;
  triggerKey: string;
  personId: string;
  personName: string;
  alertLabel: string;
  sent: boolean;
  sentAgain: boolean;
  /** The text service's id for this text (shown short, for support calls). */
  providerId: string | null;
  /** Did the accepted text reach the phone? null = no answer yet. */
  delivered: boolean | null;
  /** Plain words: why it did not go or did not arrive; null when fine. */
  problem: string | null;
}

/** The newest staff alert texts of the tenant, for managers. */
export const recentTexts = query({
  args: {},
  handler: async (ctx): Promise<RecentText[]> => {
    const auth = await getAuthContext(ctx);
    const tenantId = requireTenant(auth);
    if (!canManage(auth.role)) return [];
    const ledger = await ctx.db
      .query("manifestEvents")
      .withIndex("by_entityId", (q) => q.eq("entityId", tenantId))
      .collect();
    const deliveries = new Map<string, Record<string, unknown>>();
    for (const row of ledger) {
      const payload = asRecord(row.payload);
      if (
        row.entity === DELIVERY_ENTITY &&
        payload.tenantId === tenantId &&
        typeof payload.messageSid === "string"
      ) {
        deliveries.set(payload.messageSid, payload);
      }
    }
    const rows = ledger
      .filter(
        (row) =>
          row.entity === ALERT_ENTITY &&
          asRecord(row.payload).tenantId === tenantId,
      )
      .sort((left, right) => right.createdAt - left.createdAt)
      .slice(0, RECENT_LIMIT);
    const names = new Map<string, string>();
    for (const row of rows) {
      const personId = String(asRecord(row.payload).personId);
      if (names.has(personId)) continue;
      const person = await ctx.db
        .get(personId as Id<"people">)
        .catch(() => null);
      names.set(
        personId,
        person && person.tenantId === tenantId
          ? personName(person.givenName, person.familyName)
          : "Former team member",
      );
    }
    return rows.map((row) => {
      const payload = asRecord(row.payload);
      const personId = String(payload.personId);
      const sent = row.type === "SmsAlertSent";
      const delivery =
        sent && typeof payload.messageSid === "string"
          ? deliveries.get(payload.messageSid)
          : undefined;
      const delivered = delivery ? delivery.outcome === "delivered" : null;
      return {
        at: row.createdAt,
        triggerKey: String(payload.triggerKey),
        personId,
        personName: names.get(personId) ?? "Team member",
        alertLabel: ALERT_LABELS[String(payload.alertType)] ?? "Alert",
        sent,
        sentAgain: typeof payload.sentAgainBy === "string",
        providerId:
          typeof payload.messageSid === "string" ? payload.messageSid : null,
        delivered,
        problem: sent
          ? delivered === false
            ? `The text did not reach the phone: ${notDeliveredReason(
                typeof delivery?.errorCode === "number"
                  ? delivery.errorCode
                  : null,
              )}.`
            : null
          : payload.optedOut === true
            ? OPTED_OUT_NOTE
            : `The text service did not take it: ${String(payload.error ?? "no reason given")}`,
      };
    });
  },
});

export const loadSendAgain = internalQuery({
  args: { tenantId: v.string(), triggerKey: v.string(), personId: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<
    | { ok: true; phone: string; body: string; alertType: string }
    | { ok: false; message: string }
  > => {
    const ledger = await ctx.db
      .query("manifestEvents")
      .withIndex("by_entityId", (q) => q.eq("entityId", args.tenantId))
      .collect();
    const last = ledger
      .filter((row) => {
        const payload = asRecord(row.payload);
        return (
          row.entity === ALERT_ENTITY &&
          payload.tenantId === args.tenantId &&
          payload.triggerKey === args.triggerKey &&
          payload.personId === args.personId
        );
      })
      .sort((left, right) => right.createdAt - left.createdAt)[0];
    const body = asRecord(last?.payload).body;
    if (!last || typeof body !== "string") {
      return {
        ok: false,
        message:
          "Capsule has no copy of this text to send again. Only texts sent since this list started can go again.",
      };
    }
    const person = await ctx.db
      .get(args.personId as Id<"people">)
      .catch(() => null);
    if (!person || person.tenantId !== args.tenantId || person.deletedAt) {
      return {
        ok: false,
        message: "This team member is no longer on the team.",
      };
    }
    const phone = await decryptField(ctx, "Person", "phone", person.phone);
    if (!isSendablePhone(phone)) {
      return {
        ok: false,
        message:
          "This team member has no phone number Capsule can text. Add one on their profile first.",
      };
    }
    return {
      ok: true,
      phone: phone!.trim(),
      body,
      alertType: String(asRecord(last.payload).alertType),
    };
  },
});

/** One click = one request id = at most one text, even if the call repeats. */
export const claimSendAgain = internalMutation({
  args: {
    tenantId: v.string(),
    triggerKey: v.string(),
    personId: v.string(),
    requestId: v.string(),
    actorId: v.string(),
  },
  handler: async (ctx, args): Promise<{ claimed: boolean }> => {
    const ledger = await ctx.db
      .query("manifestEvents")
      .withIndex("by_entityId", (q) => q.eq("entityId", args.tenantId))
      .collect();
    const seen = ledger.some(
      (row) =>
        row.entity === SEND_AGAIN_ENTITY &&
        asRecord(row.payload).requestId === args.requestId,
    );
    if (seen) return { claimed: false };
    await insertStepEvent(ctx, {
      type: "SmsAlertSendAgainStarted",
      entity: SEND_AGAIN_ENTITY,
      entityId: args.tenantId,
      payload: {
        tenantId: args.tenantId,
        triggerKey: args.triggerKey,
        personId: args.personId,
        requestId: args.requestId,
        actorId: args.actorId,
      },
      createdAt: Date.now(),
    });
    return { claimed: true };
  },
});

export const sendAgain = action({
  args: { triggerKey: v.string(), personId: v.string(), requestId: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{
    status: "sent" | "already_sent" | "not_sent";
    message: string;
  }> => {
    const auth = await getAuthContext(ctx);
    const tenantId = requireTenant(auth);
    if (!canManage(auth.role)) {
      throw new ConvexError("Only a manager can send an alert text again.");
    }
    const loaded = await ctx.runQuery(internal.smsAlertTexts.loadSendAgain, {
      tenantId,
      triggerKey: args.triggerKey,
      personId: args.personId,
    });
    if (!loaded.ok) return { status: "not_sent", message: loaded.message };
    let config;
    try {
      config = requireTwilioConfig();
    } catch {
      return {
        status: "not_sent",
        message:
          "Texting is not set up for this company yet, so nothing was sent.",
      };
    }
    const claim = await ctx.runMutation(internal.smsAlertTexts.claimSendAgain, {
      tenantId,
      triggerKey: args.triggerKey,
      personId: args.personId,
      requestId: args.requestId,
      actorId: auth.id,
    });
    if (!claim.claimed) {
      return {
        status: "already_sent",
        message: "This text was already sent again. Nothing more was sent.",
      };
    }
    const key = await phoneKey(loaded.phone);
    try {
      const messageSid = await sendSms({
        config,
        to: loaded.phone,
        body: loaded.body,
        idempotencyKey: `sms-alert-again/${args.requestId}`,
        statusCallback: statusCallbackUrl(tenantId),
      });
      await ctx.runMutation(internal.smsAlerts.recordAlert, {
        tenantId,
        triggerKey: args.triggerKey,
        personId: args.personId,
        alertType: loaded.alertType,
        status: "sent",
        messageSid,
        body: loaded.body,
        phoneKey: key,
        sentAgainBy: auth.id,
        requestId: args.requestId,
      });
      return {
        status: "sent",
        message: "The text service accepted the text.",
      };
    } catch (cause) {
      const optedOut = twilioErrorCode(cause) === TWILIO_UNSUBSCRIBED_CODE;
      await ctx.runMutation(internal.smsAlerts.recordAlert, {
        tenantId,
        triggerKey: args.triggerKey,
        personId: args.personId,
        alertType: loaded.alertType,
        status: "failed",
        error: safeTwilioMessage(cause),
        body: loaded.body,
        phoneKey: key,
        optedOut,
        sentAgainBy: auth.id,
        requestId: args.requestId,
      });
      return {
        status: "not_sent",
        message: optedOut
          ? OPTED_OUT_NOTE
          : "The text service did not take the text. Try again in a few minutes.",
      };
    }
  },
});
