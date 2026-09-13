/**
 * AUTHOR SEAM — run-of-show push alerts (default runtime).
 *
 * Product intent: when a tenant has background alerts on, every crew device
 * with push enabled gets a phone notification for its run-of-show blocks:
 *   1. "In 5 minutes"  (activity starts within the lead window)
 *   2. "Now"           (activity start moment)
 *   3. "Still open"    (activity past its end + grace, not completed)
 *
 * Same posture as convex/smsAlerts.ts: a self-scheduling internalAction that
 * scans domain state, dedupes against the manifestEvents ledger, and hands
 * delivery to convex/runOfShowAlertsSend.ts (Node runtime, web-push). No
 * generated crons.ts edit, which would be drift. Delivery opt-in is the same
 * account preference team chat uses (chatNotifyPreference), so one switch
 * governs phone alerts from Capsule; the loop only runs for tenants that
 * turned the feature on.
 */
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  query,
  type QueryCtx,
} from "./_generated/server";
import { getAuthContext, requireTenant } from "./lib/authContext";
import { RunAlertLoopLedger } from "./lib/runOfShowAlertLoop";
import { live, tenantPerson } from "./lib/teamChatRead";
import type { PushPayload, PushTarget } from "./teamChatPush";

const SENT_ENTITY = "RunAlert";
const SCAN_INTERVAL_MS = 60_000;
const LEAD_MS = 5 * 60_000;
/** Slack after an end time before the tracker calls a block late. */
const OVERDUE_GRACE_MS = 10 * 60_000;
/** How far past a due moment a scan may still fire it. */
const STALE_MS = 5 * 60_000;
/** The fire window itself; the 60s scan always lands inside it once. */
const DUE_WINDOW_MS = 90_000;
/** Events within ±30h of now hold the run of show a scan looks at. */
const EVENT_WINDOW_MS = 30 * 60 * 60_000;
const MAX_JOBS_PER_SCAN = 20;
const DEVICES_PER_PERSON = 20;
const HISTORY_WALK_CAP = 400;

type AlertKind = "lead" | "start" | "overdue";

interface RunAlertJob {
  activityId: string;
  kind: AlertKind;
  targets: PushTarget[];
  payload: PushPayload;
}

function vapidConfigured(): boolean {
  return Boolean(
    process.env.VAPID_PUBLIC_KEY &&
    process.env.VAPID_PRIVATE_KEY &&
    process.env.VAPID_SUBJECT,
  );
}

const loopLedger = new RunAlertLoopLedger();

/** Latest config event wins, mirroring smsAlerts.latestConfigEnabled. */
async function alertsEnabled(
  ctx: QueryCtx,
  tenantId: string,
): Promise<boolean> {
  return loopLedger.enabled(ctx, tenantId);
}

/** The account-level phone-alert switch team chat also obeys. */
async function wantsPush(
  ctx: QueryCtx,
  tenantId: string,
  authSubjectId: string,
): Promise<boolean> {
  const rows = await ctx.db
    .query("chatNotifyPreferences")
    .withIndex("by_ownerId", (q) => q.eq("ownerId", authSubjectId))
    .take(10);
  return rows.find((row) => row.tenantId === tenantId)?.enabled === true;
}

/** Devices for one person, mirroring teamChatPush.buildPushJob's walk. */
async function devicesForPerson(
  ctx: QueryCtx,
  tenantId: string,
  person: Doc<"people">,
): Promise<PushTarget[]> {
  const out: PushTarget[] = [];
  if (!person.authSubjectId || person.status !== "active") return out;
  if (!(await wantsPush(ctx, tenantId, person.authSubjectId))) return out;
  let walked = 0;
  for await (const device of ctx.db
    .query("pushSubscriptions")
    .withIndex("by_personId", (q) => q.eq("personId", person._id))
    .order("desc")) {
    if (++walked > HISTORY_WALK_CAP || out.length >= DEVICES_PER_PERSON) break;
    if (device.tenantId !== tenantId || !live(device)) continue;
    if (device.authSubjectId !== person.authSubjectId) continue;
    out.push({
      id: device._id,
      version: device.version,
      endpoint: device.endpoint,
      p256dh: device.p256dh,
      auth: device.auth,
    });
  }
  return out;
}

export const getStatus = query({
  args: {},
  handler: async (ctx) => {
    const auth = await getAuthContext(ctx);
    const tenantId = requireTenant(auth);
    return {
      enabled: await alertsEnabled(ctx, tenantId),
      providerConfigured: vapidConfigured(),
    };
  },
});

export const enableAlerts = action({
  args: {},
  handler: async (ctx): Promise<{ enabled: true }> => {
    const auth = await getAuthContext(ctx);
    const tenantId = requireTenant(auth);
    if (!vapidConfigured()) {
      throw new Error(
        "Push is not configured on this deployment yet, so background alerts cannot run.",
      );
    }
    // One mutation decides whether a new loop may start, so two concurrent
    // enables (or a disable/enable inside one scan) cannot fork a second
    // scanner (#298). A null generation means a loop already owns the tenant.
    const generation = await ctx.runMutation(
      internal.runOfShowAlerts.claimLoop,
      { tenantId, actorId: auth.id },
    );
    if (generation == null) return { enabled: true };
    await ctx.scheduler.runAfter(0, internal.runOfShowAlerts.tick, {
      tenantId,
      scheduleNext: true,
      generation,
    });
    return { enabled: true };
  },
});

export const claimLoop = internalMutation({
  args: { tenantId: v.string(), actorId: v.optional(v.string()) },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) =>
    loopLedger.claim(ctx, args.tenantId, args.actorId),
});

export const disableAlerts = action({
  args: {},
  handler: async (ctx): Promise<{ disabled: true }> => {
    const auth = await getAuthContext(ctx);
    const tenantId = requireTenant(auth);
    await ctx.runMutation(internal.runOfShowAlerts.recordDisabled, {
      tenantId,
      actorId: auth.id,
    });
    return { disabled: true };
  },
});

export const recordDisabled = internalMutation({
  args: { tenantId: v.string(), actorId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await loopLedger.disable(ctx, args.tenantId, args.actorId);
  },
});

export const isEnabled = internalQuery({
  args: { tenantId: v.string() },
  handler: async (ctx, args) => alertsEnabled(ctx, args.tenantId),
});

/** Whether the tick that carries `generation` still owns the scanner loop. */
export const mayScan = internalQuery({
  args: { tenantId: v.string(), generation: v.optional(v.string()) },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const owner = await loopLedger.owner(ctx, args.tenantId);
    const latest = await loopLedger.latestConfig(ctx, args.tenantId);
    return RunAlertLoopLedger.mayScan(owner, latest, args.generation);
  },
});

/** One alert moment per kind per activity, kept only when due right now. */
function dueWindows(
  activity: Doc<"eventTimelineActivities">,
  now: number,
): { kind: AlertKind; at: number }[] {
  const start =
    typeof activity.startsAt === "number"
      ? activity.startsAt
      : typeof activity.scheduledAt === "number"
        ? activity.scheduledAt
        : null;
  if (start == null) return [];
  const windows: { kind: AlertKind; at: number }[] = [
    { kind: "lead", at: start - LEAD_MS },
    { kind: "start", at: start },
  ];
  if (typeof activity.endsAt === "number") {
    windows.push({ kind: "overdue", at: activity.endsAt + OVERDUE_GRACE_MS });
  }
  return windows.filter(
    (window) => now >= window.at && now < window.at + DUE_WINDOW_MS,
  );
}

export const collectDueAlerts = internalQuery({
  args: { tenantId: v.string(), now: v.number() },
  handler: async (ctx, args): Promise<RunAlertJob[]> => {
    const events = await ctx.db
      .query("events")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", args.tenantId))
      .collect();
    const inWindow = events.filter(
      (event) =>
        event.deletedAt == null &&
        event.startsAt != null &&
        Math.abs(event.startsAt - args.now) <= EVENT_WINDOW_MS,
    );

    const jobs: RunAlertJob[] = [];
    for (const event of inWindow) {
      const activities = await ctx.db
        .query("eventTimelineActivities")
        .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
        .collect();
      const assignments = await ctx.db
        .query("eventAssignments")
        .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
        .collect();
      const crewPersonIds = [
        ...new Set(
          assignments
            .filter(
              (row) =>
                row.tenantId === args.tenantId &&
                live(row) &&
                row.status !== "unassigned" &&
                row.personId != null,
            )
            .map((row) => String(row.personId)),
        ),
      ];

      for (const activity of activities) {
        if (
          activity.tenantId !== args.tenantId ||
          !live(activity) ||
          activity.completedAt != null
        ) {
          continue;
        }
        const sentRows = await ctx.db
          .query("manifestEvents")
          .withIndex("by_entityId", (q) => q.eq("entityId", activity._id))
          .collect();
        const sentKinds = new Set(
          sentRows
            .filter(
              (row) =>
                row.entity === SENT_ENTITY && row.type === "RunAlertSent",
            )
            .map((row) => String((row.payload as { kind?: string }).kind)),
        );

        for (const window of dueWindows(activity, args.now)) {
          if (sentKinds.has(window.kind)) continue;
          if (args.now - window.at > STALE_MS + DUE_WINDOW_MS) continue;
          const explicit = (activity.assigneePersonIds ?? [])
            .map((id) => String(id))
            .filter((id) => id.trim().length > 0);
          const recipientIds = explicit.length > 0 ? explicit : crewPersonIds;
          const targets: PushTarget[] = [];
          const seen = new Set<string>();
          for (const personId of recipientIds) {
            const person = await tenantPerson(ctx, args.tenantId, personId);
            if (!person) continue;
            for (const device of await devicesForPerson(
              ctx,
              args.tenantId,
              person,
            )) {
              if (seen.has(device.endpoint)) continue;
              seen.add(device.endpoint);
              targets.push(device);
            }
          }
          if (targets.length === 0) continue;
          const name = activity.name?.trim() || "Next task";
          const teams = (activity.assigneeTeams ?? [])
            .map((team) => team.trim())
            .filter((team) => team.length > 0)
            .join(" and ");
          const eventTitle = event.title?.trim() || "Event";
          const prefix =
            window.kind === "lead"
              ? `In 5 minutes: ${name}`
              : window.kind === "overdue"
                ? `Still open: ${name}`
                : `Now: ${name}`;
          jobs.push({
            activityId: String(activity._id),
            kind: window.kind,
            targets,
            payload: {
              title: prefix,
              body: teams.length > 0 ? `${eventTitle} · ${teams}` : eventTitle,
              url: `/event-day/${String(event._id)}/run`,
              tag: `${String(activity._id)}:${window.kind}`,
            },
          });
          if (jobs.length >= MAX_JOBS_PER_SCAN) return jobs;
        }
      }
    }
    return jobs;
  },
});

export const recordRunPushResults = internalMutation({
  args: {
    alertKey: v.object({ activityId: v.string(), kind: v.string() }),
    used: v.array(v.id("pushSubscriptions")),
    gone: v.array(
      v.object({ id: v.id("pushSubscriptions"), version: v.number() }),
    ),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    for (const id of args.used) {
      const row = await ctx.db.get(id);
      if (row && live(row)) await ctx.db.patch(id, { lastUsedAt: args.now });
    }
    // 404/410 from the push service: the browser dropped the subscription.
    // Prune only the exact row version the delivery held.
    for (const { id, version } of args.gone) {
      const row = await ctx.db.get(id);
      if (row && live(row) && row.version === version) {
        await ctx.db.patch(id, {
          deletedAt: args.now,
          updatedAt: args.now,
          version: row.version + 1,
        });
      }
    }
    // Mark the alert sent ONLY when at least one device took the push: a
    // full soft failure (network, 5xx on every target) must stay unsent so
    // the next scan retries it inside the fire window.
    if (args.used.length > 0) {
      await ctx.db.insert("manifestEvents", {
        type: "RunAlertSent",
        entity: SENT_ENTITY,
        entityId: args.alertKey.activityId,
        payload: {
          activityId: args.alertKey.activityId,
          kind: args.alertKey.kind,
        },
        createdAt: args.now,
      });
    }
  },
});

export const tick = internalAction({
  args: {
    tenantId: v.string(),
    scheduleNext: v.optional(v.boolean()),
    generation: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<void> => {
    // Disabled, or a newer enable owns the loop: this scanner retires
    // without rescheduling, so duplicate loops die within one interval.
    const owns = await ctx.runQuery(internal.runOfShowAlerts.mayScan, {
      tenantId: args.tenantId,
      generation: args.generation,
    });
    if (!owns) return;
    const now = Date.now();
    try {
      const jobs = await ctx.runQuery(
        internal.runOfShowAlerts.collectDueAlerts,
        { tenantId: args.tenantId, now },
      );
      for (const job of jobs) {
        await ctx.runAction(internal.runOfShowAlertsSend.deliver, {
          activityId: job.activityId,
          kind: job.kind,
          targets: job.targets,
          payload: job.payload,
        });
      }
    } finally {
      // The scanner must always reschedule itself: a thrown delivery or a
      // query error may never kill the crew's alert loop.
      if (args.scheduleNext) {
        await ctx.scheduler.runAfter(
          SCAN_INTERVAL_MS,
          internal.runOfShowAlerts.tick,
          {
            tenantId: args.tenantId,
            scheduleNext: true,
            generation: args.generation,
          },
        );
      }
    }
  },
});
