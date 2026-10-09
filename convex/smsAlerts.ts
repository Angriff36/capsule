/**
 * AUTHOR SEAM — high-urgency SMS alerts via Twilio.
 *
 * Product intent: when a tenant enables SMS alerts and a Person has opted in
 * (Person.smsAlertsOptIn), send an SMS on three high-urgency triggers:
 *   1. Delivery dispatched   (Delivery.status → in_transit)
 *   2. Event starts in ~2h   (Event.startsAt within the next two hours)
 *   3. Allergen incident      (Incident.category === "allergen", still open)
 *
 * Why a poll-based scan instead of Manifest reactions: reactions dispatch other
 * *commands*, not an outbound provider call, and Capsule's outbox consumers are
 * not wired (webhooks are inbound-only). So this mirrors the Google Calendar /
 * QuickBooks reconcile pattern — a self-scheduling internalAction that scans
 * domain state, dedupes against the manifestEvents ledger, and sends. It is
 * kicked off by an admin enabling alerts and reschedules itself while enabled
 * (no generated crons.ts edit, which would be drift).
 */
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  query,
  type ActionCtx,
} from "./_generated/server";
import { getAuthContext, requireTenant } from "./lib/authContext";
import { decrypt } from "./lib/encryption";
import {
  isSendablePhone,
  phoneKey,
  requireTwilioConfig,
  safeTwilioMessage,
  sendSms,
  twilioConfigured,
  twilioErrorCode,
  TWILIO_UNSUBSCRIBED_CODE,
} from "./lib/twilio";
import { insertStepEvent } from "./lib/commandAudit";
import { quietHoursEnd } from "./lib/clientEmailConsent";
import { statusCallbackUrl } from "./smsAlertDelivery";

const CONFIG_ENTITY = "SmsAlertConfig";
const ALERT_ENTITY = "SmsAlert";
const SCAN_INTERVAL_MS = 5 * 60_000;
const EVENT_LEAD_MS = 2 * 60 * 60_000; // "starts in 2 hours"
const RECENT_TRIGGER_MS = 24 * 60 * 60_000; // ignore stale deliveries/incidents
const MAX_SENDS_PER_SCAN = 100;
const MAX_ATTEMPTS = 3; // same bound as the webhook outbox

type AlertType = "event_soon" | "delivery_dispatched" | "allergen_incident";

interface Trigger {
  triggerKey: string;
  alertType: AlertType;
  body: string;
  /** The event the alert is about; null when it is not tied to one. */
  eventId: string | null;
  /** Urgent alerts go at any hour; the others wait out the night. */
  urgent: boolean;
}

interface Recipient {
  personId: string;
  name: string;
  phone: string;
  phoneKey: string;
  /** Events this person has a shift on - they still get its alerts at night. */
  eventIds: string[];
}

interface ScanContext {
  enabled: boolean;
  recipients: Recipient[];
  triggers: Trigger[];
  alreadySent: string[]; // `${triggerKey}::${personId}`, sent or out of tries
  currentChainId: string | null; // chain id of the newest SmsAlertsEnabled row
  /** When the kitchen's night ends; null = it is daytime (or no time zone). */
  quietUntil: number | null;
  /** People whose phone told the text service to stop (they texted STOP). */
  optedOut: number;
}

interface ScanResult {
  status: "ok" | "disabled" | "partial" | "superseded";
  sent: number;
  skipped: number;
  failed: number;
  /** Texts held for the morning: night time, and not the person's event. */
  heldForNight: number;
  optedOut: number;
  error?: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

export function canManage(role: string): boolean {
  return (
    role === "manager" ||
    role === "admin" ||
    role === "owner" ||
    role === "system" ||
    role.endsWith("_manager")
  );
}

function requireManager(role: string): void {
  if (!canManage(role)) {
    throw new ConvexError(
      "Only an organization manager can change SMS alerts.",
    );
  }
}

function latestConfigEnabled(
  rows: Array<{ type: string; createdAt: number }>,
): boolean {
  const latest = rows
    .filter(
      (row) =>
        row.type === "SmsAlertsEnabled" || row.type === "SmsAlertsDisabled",
    )
    .sort((left, right) => right.createdAt - left.createdAt)[0];
  return latest?.type === "SmsAlertsEnabled";
}

/** Decrypt a Manifest `encrypted` field envelope; falls back to plaintext. */
/**
 * Phones whose owner texted STOP: the text service refuses them, so the scan
 * stops texting them. A later good text to the same phone (they texted START
 * and a manager used Send again) clears it; a new number is a new phone.
 */
export function optedOutPhones(
  ledger: ReadonlyArray<{ entity: string; type: string; payload: unknown }>,
): Set<string> {
  const refused = new Set<string>();
  for (const row of ledger) {
    if (row.entity !== ALERT_ENTITY) continue;
    const payload = asRecord(row.payload);
    if (typeof payload.phoneKey !== "string") continue;
    if (payload.optedOut === true) refused.add(payload.phoneKey);
    if (row.type === "SmsAlertSent") refused.delete(payload.phoneKey);
  }
  return refused;
}

export async function decryptField(
  ctx: unknown,
  entity: string,
  property: string,
  raw: string | null | undefined,
): Promise<string | null> {
  if (!raw) return null;
  try {
    const envelope = asRecord(JSON.parse(raw));
    if (
      envelope.v === 1 &&
      typeof envelope.kid === "string" &&
      typeof envelope.ct === "string"
    ) {
      return await decrypt(envelope.ct, envelope.kid, {
        ctx,
        entity,
        property,
      });
    }
  } catch {
    // Legacy plaintext rows stay readable.
  }
  return raw;
}

export function personName(
  givenName?: string | null,
  familyName?: string | null,
): string {
  return (
    [givenName, familyName]
      .filter((part): part is string => Boolean(part?.trim()))
      .join(" ")
      .trim() || "Team member"
  );
}

function formatEventTime(startsAt: number): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(startsAt));
}

export const getStatus = query({
  args: {},
  handler: async (ctx) => {
    const auth = await getAuthContext(ctx);
    const tenantId = requireTenant(auth);
    const rows = await ctx.db
      .query("manifestEvents")
      .withIndex("by_entityId", (q) => q.eq("entityId", tenantId))
      .collect();
    const configRows = rows.filter((row) => row.entity === CONFIG_ENTITY);
    const lastScan = configRows
      .filter((row) => row.type === "SmsAlertsScanned")
      .sort((left, right) => right.createdAt - left.createdAt)[0];
    const scan = asRecord(lastScan?.payload);
    return {
      providerConfigured: twilioConfigured(),
      enabled: latestConfigEnabled(configRows),
      canManage: canManage(auth.role),
      lastScan:
        lastScan == null
          ? null
          : {
              at: lastScan.createdAt,
              sent: typeof scan.sent === "number" ? scan.sent : 0,
              failed: typeof scan.failed === "number" ? scan.failed : 0,
              heldForNight:
                typeof scan.heldForNight === "number" ? scan.heldForNight : 0,
              optedOut: typeof scan.optedOut === "number" ? scan.optedOut : 0,
              error: typeof scan.error === "string" ? scan.error : null,
            },
    };
  },
});

export const enableAlerts = action({
  args: {},
  handler: async (ctx): Promise<{ enabled: true }> => {
    const auth = await getAuthContext(ctx);
    const tenantId = requireTenant(auth);
    requireManager(auth.role);
    requireTwilioConfig(); // fail early with a clear message if unconfigured
    // The newest enable owns the tenant's scan chain; older chains end at
    // their next scan, so enabling twice never leaves two chains running.
    const chainId = crypto.randomUUID();
    await ctx.runMutation(internal.smsAlerts.recordConfigEvent, {
      tenantId,
      type: "SmsAlertsEnabled",
      actorId: auth.id,
      payload: { chainId },
    });
    await ctx.scheduler.runAfter(0, internal.smsAlerts.scanTenant, {
      tenantId,
      scheduleNext: true,
      chainId,
    });
    return { enabled: true };
  },
});

export const disableAlerts = action({
  args: {},
  handler: async (ctx): Promise<{ disabled: true }> => {
    const auth = await getAuthContext(ctx);
    const tenantId = requireTenant(auth);
    requireManager(auth.role);
    await ctx.runMutation(internal.smsAlerts.recordConfigEvent, {
      tenantId,
      type: "SmsAlertsDisabled",
      actorId: auth.id,
    });
    return { disabled: true };
  },
});

export const recordConfigEvent = internalMutation({
  args: {
    tenantId: v.string(),
    type: v.union(
      v.literal("SmsAlertsEnabled"),
      v.literal("SmsAlertsDisabled"),
      v.literal("SmsAlertsScanned"),
    ),
    actorId: v.optional(v.string()),
    payload: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await insertStepEvent(ctx, {
      type: args.type,
      entity: CONFIG_ENTITY,
      entityId: args.tenantId,
      payload: {
        tenantId: args.tenantId,
        actorId: args.actorId,
        ...asRecord(args.payload),
      },
      createdAt: Date.now(),
    });
  },
});

export const recordAlert = internalMutation({
  args: {
    tenantId: v.string(),
    triggerKey: v.string(),
    personId: v.string(),
    alertType: v.string(),
    status: v.union(v.literal("sent"), v.literal("failed")),
    messageSid: v.optional(v.string()),
    error: v.optional(v.string()),
    body: v.optional(v.string()),
    phoneKey: v.optional(v.string()),
    optedOut: v.optional(v.boolean()),
    sentAgainBy: v.optional(v.string()),
    requestId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await insertStepEvent(ctx, {
      type: args.status === "sent" ? "SmsAlertSent" : "SmsAlertFailed",
      entity: ALERT_ENTITY,
      entityId: args.tenantId,
      payload: {
        tenantId: args.tenantId,
        triggerKey: args.triggerKey,
        personId: args.personId,
        alertType: args.alertType,
        messageSid: args.messageSid ?? null,
        error: args.error ?? null,
        body: args.body ?? null,
        phoneKey: args.phoneKey ?? null,
        optedOut: args.optedOut === true,
        sentAgainBy: args.sentAgainBy ?? null,
        requestId: args.requestId ?? null,
      },
      createdAt: Date.now(),
    });
  },
});

export const loadScanContext = internalQuery({
  args: { tenantId: v.string() },
  handler: async (ctx, args): Promise<ScanContext> => {
    const ledger = await ctx.db
      .query("manifestEvents")
      .withIndex("by_entityId", (q) => q.eq("entityId", args.tenantId))
      .collect();
    const configRows = ledger.filter((row) => row.entity === CONFIG_ENTITY);
    const enabled = latestConfigEnabled(configRows);
    if (!enabled) {
      return {
        enabled: false,
        recipients: [],
        triggers: [],
        alreadySent: [],
        currentChainId: null,
        quietUntil: null,
        optedOut: 0,
      };
    }
    let currentChainId: string | null = null;
    let chainAt = -Infinity;
    for (const row of configRows) {
      const chainId = asRecord(row.payload).chainId;
      // Rows come in insertion order, so a same-time later row is newer.
      if (
        row.type === "SmsAlertsEnabled" &&
        typeof chainId === "string" &&
        row.createdAt >= chainAt
      ) {
        currentChainId = chainId;
        chainAt = row.createdAt;
      }
    }

    const now = Date.now();
    const [people, events, deliveries, incidents, locations] =
      await Promise.all([
        ctx.db
          .query("people")
          .withIndex("by_tenantId", (q) => q.eq("tenantId", args.tenantId))
          .collect(),
        // Only what can trigger a text, never whole histories: events that
        // start inside the lead window, deliveries in transit, and open or
        // investigating incidents.
        ctx.db
          .query("events")
          .withIndex("by_tenantId_and_startsAt", (q) =>
            q
              .eq("tenantId", args.tenantId)
              .gt("startsAt", now)
              .lte("startsAt", now + EVENT_LEAD_MS),
          )
          .collect(),
        ctx.db
          .query("deliveries")
          .withIndex("by_tenantId_and_status", (q) =>
            q.eq("tenantId", args.tenantId).eq("status", "in_transit"),
          )
          .collect(),
        Promise.all(
          (["open", "investigating"] as const).map((status) =>
            ctx.db
              .query("incidents")
              .withIndex("by_tenantId_and_status", (q) =>
                q.eq("tenantId", args.tenantId).eq("status", status),
              )
              .collect(),
          ),
        ).then((lists) => lists.flat()),
        ctx.db
          .query("operatingLocations")
          .withIndex("by_tenantId", (q) => q.eq("tenantId", args.tenantId))
          .take(50),
      ]);
    const kitchenTimeZone =
      locations.find(
        (row) =>
          row.deletedAt == null && row.status === "active" && row.timeZone,
      )?.timeZone ?? null;

    const refusedPhones = optedOutPhones(ledger);

    const recipients: Recipient[] = [];
    let optedOut = 0;
    for (const person of people) {
      if (
        person.deletedAt != null ||
        person.status !== "active" ||
        person.smsAlertsOptIn !== true
      ) {
        continue;
      }
      const phone = await decryptField(ctx, "Person", "phone", person.phone);
      if (!isSendablePhone(phone)) continue;
      const key = await phoneKey(phone!);
      if (refusedPhones.has(key)) {
        optedOut += 1;
        continue;
      }
      recipients.push({
        personId: String(person._id),
        name: personName(person.givenName, person.familyName),
        phone: phone!.trim(),
        phoneKey: key,
        eventIds: [],
      });
    }

    // Titles of the events the incidents name, read by id.
    const eventTitle = new Map<string, string>();
    for (const incident of incidents) {
      if (incident.eventId == null) continue;
      const event = await ctx.db.get(incident.eventId);
      if (event && event.tenantId === args.tenantId)
        eventTitle.set(String(event._id), event.title);
    }
    const triggers: Trigger[] = [];

    for (const event of events) {
      if (
        event.deletedAt == null &&
        typeof event.startsAt === "number" &&
        event.startsAt > now &&
        event.startsAt <= now + EVENT_LEAD_MS
      ) {
        triggers.push({
          triggerKey: `event:${String(event._id)}:t2h`,
          alertType: "event_soon",
          eventId: String(event._id),
          urgent: false,
          body: `⏰ ${event.title} starts around ${formatEventTime(event.startsAt)} (about 2 hours). — Capsule`,
        });
      }
    }

    for (const delivery of deliveries) {
      if (
        delivery.deletedAt == null &&
        delivery.status === "in_transit" &&
        typeof delivery.departedAt === "number" &&
        delivery.departedAt >= now - RECENT_TRIGGER_MS
      ) {
        triggers.push({
          triggerKey: `delivery:${String(delivery._id)}:dispatched`,
          alertType: "delivery_dispatched",
          eventId: String(delivery.eventId),
          urgent: false,
          body: `🚚 Delivery to ${delivery.destination || "the event"} is now in transit. — Capsule`,
        });
      }
    }

    for (const incident of incidents) {
      if (
        incident.deletedAt == null &&
        incident.category === "allergen" &&
        (incident.status === "open" || incident.status === "investigating") &&
        typeof incident.reportedAt === "number" &&
        incident.reportedAt >= now - RECENT_TRIGGER_MS
      ) {
        const title = eventTitle.get(String(incident.eventId)) ?? "an event";
        triggers.push({
          triggerKey: `incident:${String(incident._id)}:allergen`,
          alertType: "allergen_incident",
          eventId: incident.eventId == null ? null : String(incident.eventId),
          urgent: true,
          body: `⚠️ Critical allergen incident reported for ${title}. Immediate attention required. — Capsule`,
        });
      }
    }

    // Who works each alerted event: they still get its texts at night.
    const recipientById = new Map(
      recipients.map((recipient) => [recipient.personId, recipient] as const),
    );
    const alertedEvents: Doc<"events">[] = [];
    for (const id of new Set(triggers.map((trigger) => trigger.eventId))) {
      const eventId = id ? ctx.db.normalizeId("events", id) : null;
      const event = eventId ? await ctx.db.get(eventId) : null;
      if (event && event.tenantId === args.tenantId) alertedEvents.push(event);
    }
    alertedEvents.sort((a, b) => a._creationTime - b._creationTime);
    for (const event of alertedEvents) {
      const eventId = String(event._id);
      const shifts = await ctx.db
        .query("shifts")
        .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
        .collect();
      for (const shift of shifts) {
        if (
          shift.tenantId !== args.tenantId ||
          shift.deletedAt != null ||
          shift.status === "cancelled"
        ) {
          continue;
        }
        recipientById.get(String(shift.personId))?.eventIds.push(eventId);
      }
    }

    // A key is done once it was sent, or after MAX_ATTEMPTS failed tries.
    const alreadySent: string[] = [];
    const failures = new Map<string, number>();
    for (const row of ledger) {
      if (row.entity !== ALERT_ENTITY) continue;
      const payload = asRecord(row.payload);
      const key = `${String(payload.triggerKey)}::${String(payload.personId)}`;
      if (row.type === "SmsAlertSent") alreadySent.push(key);
      if (row.type === "SmsAlertFailed") {
        const count = (failures.get(key) ?? 0) + 1;
        failures.set(key, count);
        if (count === MAX_ATTEMPTS) alreadySent.push(key);
      }
    }

    return {
      enabled: true,
      recipients,
      triggers,
      alreadySent,
      currentChainId,
      quietUntil: quietHoursEnd(now, kitchenTimeZone),
      optedOut,
    };
  },
});

export const scanTenant = internalAction({
  args: {
    tenantId: v.string(),
    scheduleNext: v.boolean(),
    chainId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<ScanResult> => {
    const context: ScanContext = await ctx.runQuery(
      internal.smsAlerts.loadScanContext,
      { tenantId: args.tenantId },
    );
    const empty = { sent: 0, skipped: 0, failed: 0, heldForNight: 0 };
    if (!context.enabled) {
      return { status: "disabled", ...empty, optedOut: 0 };
    }
    // A newer chain owns this tenant: end this one without sends or reschedule.
    if (
      args.scheduleNext &&
      context.currentChainId != null &&
      args.chainId !== context.currentChainId
    ) {
      return { status: "superseded", ...empty, optedOut: 0 };
    }

    const sentKeys = new Set(context.alreadySent);
    const result: ScanResult = {
      status: "ok",
      ...empty,
      optedOut: context.optedOut,
    };

    let config;
    try {
      config = requireTwilioConfig();
    } catch (cause) {
      const error = safeTwilioMessage(cause);
      await ctx.runMutation(internal.smsAlerts.recordConfigEvent, {
        tenantId: args.tenantId,
        type: "SmsAlertsScanned",
        payload: { sent: 0, failed: 0, error },
      });
      return { status: "partial", ...empty, optedOut: 0, error };
    }

    const stopped = new Set<string>(); // texted STOP during this scan
    outer: for (const trigger of context.triggers) {
      for (const recipient of context.recipients) {
        if (stopped.has(recipient.personId)) continue;
        const dedupKey = `${trigger.triggerKey}::${recipient.personId}`;
        if (sentKeys.has(dedupKey)) {
          result.skipped += 1;
          continue;
        }
        // At night only the people working the event get its texts; the
        // rest get it in the morning if it still applies.
        if (
          context.quietUntil != null &&
          !trigger.urgent &&
          !(trigger.eventId && recipient.eventIds.includes(trigger.eventId))
        ) {
          result.heldForNight += 1;
          continue;
        }
        if (result.sent >= MAX_SENDS_PER_SCAN) break outer;
        // A scan running at the same moment may have claimed this text.
        const claim = await ctx.runMutation(
          internal.smsAlertClaims.claimAlert,
          {
            tenantId: args.tenantId,
            triggerKey: trigger.triggerKey,
            personId: recipient.personId,
          },
        );
        if (!claim.claimed) {
          result.skipped += 1;
          continue;
        }
        try {
          const messageSid = await sendSms({
            config,
            to: recipient.phone,
            body: trigger.body,
            idempotencyKey: `sms-alert/${dedupKey}`,
            statusCallback: statusCallbackUrl(args.tenantId),
          });
          sentKeys.add(dedupKey);
          await ctx.runMutation(internal.smsAlerts.recordAlert, {
            tenantId: args.tenantId,
            triggerKey: trigger.triggerKey,
            personId: recipient.personId,
            alertType: trigger.alertType,
            status: "sent",
            messageSid,
            body: trigger.body,
            phoneKey: recipient.phoneKey,
          });
          result.sent += 1;
        } catch (cause) {
          const error = safeTwilioMessage(cause);
          const optedOutNow =
            twilioErrorCode(cause) === TWILIO_UNSUBSCRIBED_CODE;
          await ctx.runMutation(internal.smsAlerts.recordAlert, {
            tenantId: args.tenantId,
            triggerKey: trigger.triggerKey,
            personId: recipient.personId,
            alertType: trigger.alertType,
            status: "failed",
            error,
            body: trigger.body,
            phoneKey: recipient.phoneKey,
            optedOut: optedOutNow,
          });
          if (optedOutNow) {
            stopped.add(recipient.personId);
            result.optedOut += 1;
          }
          result.failed += 1;
          result.status = "partial";
          result.error ??= error;
        }
      }
    }

    await ctx.runMutation(internal.smsAlerts.recordConfigEvent, {
      tenantId: args.tenantId,
      type: "SmsAlertsScanned",
      payload: {
        sent: result.sent,
        failed: result.failed,
        heldForNight: result.heldForNight,
        optedOut: result.optedOut,
        error: result.error ?? null,
      },
    });

    if (args.scheduleNext) {
      // Ask the text service which earlier texts reached the phone.
      await ctx.scheduler.runAfter(
        0,
        internal.smsAlertDelivery.checkDeliveries,
        { tenantId: args.tenantId },
      );
      await scheduleNextScan(ctx, args.tenantId, args.chainId);
    }
    return result;
  },
});

async function scheduleNextScan(
  ctx: ActionCtx,
  tenantId: string,
  chainId: string | undefined,
): Promise<void> {
  const stillEnabled: boolean = await ctx.runQuery(
    internal.smsAlerts.isEnabled,
    { tenantId },
  );
  if (stillEnabled) {
    await ctx.scheduler.runAfter(
      SCAN_INTERVAL_MS,
      internal.smsAlerts.scanTenant,
      {
        tenantId,
        scheduleNext: true,
        chainId,
      },
    );
  }
}

export const isEnabled = internalQuery({
  args: { tenantId: v.string() },
  handler: async (ctx, args): Promise<boolean> => {
    const rows = await ctx.db
      .query("manifestEvents")
      .withIndex("by_entityId", (q) => q.eq("entityId", args.tenantId))
      .collect();
    return latestConfigEnabled(
      rows.filter((row) => row.entity === CONFIG_ENTITY),
    );
  },
});
