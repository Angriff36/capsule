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
  requireTwilioConfig,
  safeTwilioMessage,
  sendSms,
  twilioConfigured,
} from "./lib/twilio";

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
}

interface Recipient {
  personId: string;
  name: string;
  phone: string;
}

interface ScanContext {
  enabled: boolean;
  recipients: Recipient[];
  triggers: Trigger[];
  alreadySent: string[]; // `${triggerKey}::${personId}`, sent or out of tries
  currentChainId: string | null; // chain id of the newest SmsAlertsEnabled row
}

interface ScanResult {
  status: "ok" | "disabled" | "partial" | "superseded";
  sent: number;
  skipped: number;
  failed: number;
  error?: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function canManage(role: string): boolean {
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
async function decryptField(
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

function personName(
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
    await ctx.db.insert("manifestEvents", {
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
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("manifestEvents", {
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
    const [people, events, deliveries, incidents] = await Promise.all([
      ctx.db
        .query("people")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", args.tenantId))
        .collect(),
      ctx.db
        .query("events")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", args.tenantId))
        .collect(),
      ctx.db
        .query("deliveries")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", args.tenantId))
        .collect(),
      ctx.db
        .query("incidents")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", args.tenantId))
        .collect(),
    ]);

    const recipients: Recipient[] = [];
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
      recipients.push({
        personId: String(person._id),
        name: personName(person.givenName, person.familyName),
        phone: phone!.trim(),
      });
    }

    const eventTitle = new Map(
      events.map((event) => [String(event._id), event.title] as const),
    );
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
          body: `⚠️ Critical allergen incident reported for ${title}. Immediate attention required. — Capsule`,
        });
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

    return { enabled: true, recipients, triggers, alreadySent, currentChainId };
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
    if (!context.enabled) {
      return { status: "disabled", sent: 0, skipped: 0, failed: 0 };
    }
    // A newer chain owns this tenant: end this one without sends or reschedule.
    if (
      args.scheduleNext &&
      context.currentChainId != null &&
      args.chainId !== context.currentChainId
    ) {
      return { status: "superseded", sent: 0, skipped: 0, failed: 0 };
    }

    const sentKeys = new Set(context.alreadySent);
    const result: ScanResult = { status: "ok", sent: 0, skipped: 0, failed: 0 };

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
      return { status: "partial", sent: 0, skipped: 0, failed: 0, error };
    }

    outer: for (const trigger of context.triggers) {
      for (const recipient of context.recipients) {
        const dedupKey = `${trigger.triggerKey}::${recipient.personId}`;
        if (sentKeys.has(dedupKey)) {
          result.skipped += 1;
          continue;
        }
        if (result.sent >= MAX_SENDS_PER_SCAN) break outer;
        try {
          const messageSid = await sendSms({
            config,
            to: recipient.phone,
            body: trigger.body,
            idempotencyKey: `sms-alert/${dedupKey}`,
          });
          sentKeys.add(dedupKey);
          await ctx.runMutation(internal.smsAlerts.recordAlert, {
            tenantId: args.tenantId,
            triggerKey: trigger.triggerKey,
            personId: recipient.personId,
            alertType: trigger.alertType,
            status: "sent",
            messageSid,
          });
          result.sent += 1;
        } catch (cause) {
          const error = safeTwilioMessage(cause);
          await ctx.runMutation(internal.smsAlerts.recordAlert, {
            tenantId: args.tenantId,
            triggerKey: trigger.triggerKey,
            personId: recipient.personId,
            alertType: trigger.alertType,
            status: "failed",
            error,
          });
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
        error: result.error ?? null,
      },
    });

    if (args.scheduleNext) {
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
