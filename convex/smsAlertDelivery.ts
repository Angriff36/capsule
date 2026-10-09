/**
 * AUTHOR SEAM — did a staff alert text reach the phone? (PL-SMS-SOCIAL, AC-353;
 * issue #439) Twilio reports each text to POST /twilio/status (signed with
 * X-Twilio-Signature; the company is named in the signed callback address).
 * The scan chain also asks Twilio about each recent text that has no answer
 * yet, so a lost report still settles. The first final answer (delivered /
 * not delivered) is kept; later reports never change it, so a delivered text
 * never goes back to "sent" and a repeated report adds nothing.
 */
import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  httpAction,
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { insertStepEvent } from "./lib/commandAudit";
import {
  fetchSmsStatus,
  requireTwilioConfig,
  TWILIO_UNSUBSCRIBED_CODE,
} from "./lib/twilio";
import { twilioRequestSigned } from "./lib/twilioSignature";

export const STATUS_ROUTE_PATH = "/twilio/status";

/** Where Twilio reports this company's texts; none when the site is unknown. */
export function statusCallbackUrl(tenantId: string): string | undefined {
  const site = process.env.CONVEX_SITE_URL?.trim().replace(/\/$/, "");
  return site
    ? `${site}${STATUS_ROUTE_PATH}?tenant=${encodeURIComponent(tenantId)}`
    : undefined;
}

const ALERT_ENTITY = "SmsAlert";
export const DELIVERY_ENTITY = "SmsAlertDelivery";
/** Texts older than this are not checked again (Twilio settles within hours). */
const CHECK_WINDOW_MS = 3 * 24 * 60 * 60_000;
const MAX_CHECKS_PER_RUN = 25;

export type DeliveryOutcome = "delivered" | "not_delivered";

/** Twilio status → Capsule outcome; null while the text is still on its way. */
export function deliveryOutcome(status: string): DeliveryOutcome | null {
  if (status === "delivered" || status === "read") return "delivered";
  if (status === "undelivered" || status === "failed") return "not_delivered";
  return null;
}

/** Plain words for the carrier error codes a caterer will actually see. */
export function notDeliveredReason(errorCode: number | null): string {
  switch (errorCode) {
    case 30003:
      return "the phone was off or out of service";
    case 30004:
      return "the phone blocks texts from this number";
    case 30005:
      return "the phone number does not exist";
    case 30006:
      return "the number is a landline or cannot get texts";
    case 30007:
      return "the phone company stopped it as possible spam";
    case TWILIO_UNSUBSCRIBED_CODE:
      return "this person texted STOP to the Capsule number";
    default:
      return errorCode == null
        ? "the phone company gave no reason"
        : `the phone company did not deliver it (code ${errorCode})`;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

/** Accepted texts of the last few days that have no final answer yet. */
export const pendingChecks = internalQuery({
  args: { tenantId: v.string(), now: v.number() },
  handler: async (ctx, args): Promise<string[]> => {
    const ledger = await ctx.db
      .query("manifestEvents")
      .withIndex("by_entityId", (q) => q.eq("entityId", args.tenantId))
      .collect();
    const settled = new Set<string>();
    for (const row of ledger) {
      const payload = asRecord(row.payload);
      if (
        row.entity === DELIVERY_ENTITY &&
        payload.tenantId === args.tenantId &&
        typeof payload.messageSid === "string"
      ) {
        settled.add(payload.messageSid);
      }
    }
    return ledger
      .filter((row) => {
        const payload = asRecord(row.payload);
        return (
          row.entity === ALERT_ENTITY &&
          row.type === "SmsAlertSent" &&
          payload.tenantId === args.tenantId &&
          typeof payload.messageSid === "string" &&
          !settled.has(payload.messageSid) &&
          row.createdAt >= args.now - CHECK_WINDOW_MS
        );
      })
      .sort((left, right) => right.createdAt - left.createdAt)
      .slice(0, MAX_CHECKS_PER_RUN)
      .map((row) => String(asRecord(row.payload).messageSid));
  },
});

/** Keeps the first final answer for a text; a repeat changes nothing. */
export const recordDelivery = internalMutation({
  args: {
    tenantId: v.string(),
    messageSid: v.string(),
    outcome: v.union(v.literal("delivered"), v.literal("not_delivered")),
    errorCode: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{ recorded: boolean }> => {
    const ledger = await ctx.db
      .query("manifestEvents")
      .withIndex("by_entityId", (q) => q.eq("entityId", args.tenantId))
      .collect();
    const ofText = ledger.filter((row) => {
      const payload = asRecord(row.payload);
      return (
        payload.tenantId === args.tenantId &&
        payload.messageSid === args.messageSid
      );
    });
    // Only this company's own sent alert texts get an answer, and only once.
    const sent = ofText.some(
      (row) => row.entity === ALERT_ENTITY && row.type === "SmsAlertSent",
    );
    const known = ofText.some((row) => row.entity === DELIVERY_ENTITY);
    if (!sent || known) return { recorded: false };
    await insertStepEvent(ctx, {
      type:
        args.outcome === "delivered"
          ? "SmsAlertDelivered"
          : "SmsAlertNotDelivered",
      entity: DELIVERY_ENTITY,
      entityId: args.tenantId,
      payload: {
        tenantId: args.tenantId,
        messageSid: args.messageSid,
        outcome: args.outcome,
        errorCode: args.errorCode ?? null,
      },
      createdAt: Date.now(),
    });
    return { recorded: true };
  },
});

/** Asks Twilio about each recent text that has no final answer yet. */
export const checkDeliveries = internalAction({
  args: { tenantId: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{ checked: number; recorded: number; errors: number }> => {
    const result = { checked: 0, recorded: 0, errors: 0 };
    let config;
    try {
      config = requireTwilioConfig();
    } catch {
      return result;
    }
    const sids: string[] = await ctx.runQuery(
      internal.smsAlertDelivery.pendingChecks,
      { tenantId: args.tenantId, now: Date.now() },
    );
    for (const messageSid of sids) {
      result.checked += 1;
      try {
        const status = await fetchSmsStatus({ config, messageSid });
        const outcome = deliveryOutcome(status.status);
        if (!outcome) continue;
        const saved = await ctx.runMutation(
          internal.smsAlertDelivery.recordDelivery,
          {
            tenantId: args.tenantId,
            messageSid,
            outcome,
            ...(status.errorCode == null
              ? {}
              : { errorCode: status.errorCode }),
          },
        );
        if (saved.recorded) result.recorded += 1;
      } catch {
        // Twilio unreachable for this one: the next scan asks again.
        result.errors += 1;
      }
    }
    return result;
  },
});

/** POST /twilio/status?tenant=… — Twilio's delivery report for one text. */
export const receiveStatus = httpAction(async (ctx, request) => {
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!authToken) return new Response("Texts are not set up.", { status: 503 });
  const params = [...new URLSearchParams(await request.text())] as Array<
    [string, string]
  >;
  if (!(await twilioRequestSigned({ authToken, request, params })))
    return new Response("Signature does not match.", { status: 403 });

  const form = new Map(params);
  const tenantId = new URL(request.url).searchParams.get("tenant") ?? "";
  const messageSid = form.get("MessageSid") ?? form.get("SmsSid") ?? "";
  const outcome = deliveryOutcome(
    form.get("MessageStatus") ?? form.get("SmsStatus") ?? "",
  );
  // "queued" / "sent" reports come first; only a final answer is kept.
  if (tenantId && messageSid && outcome) {
    const code = Number(form.get("ErrorCode"));
    await ctx.runMutation(internal.smsAlertDelivery.recordDelivery, {
      tenantId,
      messageSid,
      outcome,
      ...(outcome === "not_delivered" && Number.isFinite(code) && code > 0
        ? { errorCode: code }
        : {}),
    });
  }
  return new Response(null, { status: 204 });
});
