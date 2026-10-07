// AUTHOR SEAM — the notification tray as ONE server query.
//
// Before this seam, NotificationTray held twelve whole-table subscriptions
// (listEvent, listPerson, listShift, …) on every page of the app. Each of
// those generated list queries also projects relations per row (N+1
// db.get). Every auth-token refresh or socket reconnect re-ran all twelve,
// which is how a single open production tab burned ~1.5M query calls on
// 2026-08-19/20 (see Convex usage: 12 queries × ~121K, 421 mutations).
//
// This query reads the same tables once, with no relation projection and no
// decryption (deriveNotifications touches no encrypted field), and returns
// only the derived notification list. Additive READ only — no manifest
// change, no regen, no schema change (docs/architecture/domain-gating-restraint.md).
//
// Access mirrors each entity's generated read policy in convex/queries.ts so
// the seam widens nothing: a source is included only when the caller's role
// passes that entity's read capability. checkRole / ROLE_PERMISSIONS are
// generated as non-exported locals, so the role → capability map is mirrored
// here (same pattern as sourceProvenance.ts / hiringPipeline.ts). Keep in
// sync with src/foundation/base.manifest if a role grant moves.
import type { Doc, Id } from "./_generated/dataModel";
import { query } from "./_generated/server";
import {
  deriveNotifications,
  type NotificationSources,
} from "../src/features/notifications/deriveNotifications";
import { findRosterConflicts } from "../src/features/workforce/rosterConflicts";
import { getAuthContext, type AppAuthContext } from "./lib/authContext";
import { orgCapabilityDeniesAction } from "./lib/orgCapabilityGate";
import { CURSOR_DUPLICATES_CAP } from "./lib/teamChatRead";

const ALL_ACCESS = [
  "eventAccess",
  "eventManageAccess",
  "financeAccess",
  "inventoryAccess",
  "kitchenAccess",
  "logisticsAccess",
  "manageAccess",
  "procurementAccess",
  "salesAccess",
  "staffAccess",
  "workforceAccess",
  "workforceManageAccess",
];

// Only the capabilities the twelve read guards below consult.
const ROLE_CAPABILITIES: Record<string, readonly string[]> = {
  admin: ALL_ACCESS,
  owner: ALL_ACCESS,
  system: ALL_ACCESS,
  manager: ["manageAccess", "staffAccess"],
  staff: ["staffAccess"],
  driver: ["logisticsAccess", "staffAccess"],
  event_manager: [
    "eventAccess",
    "eventManageAccess",
    "manageAccess",
    "staffAccess",
  ],
  event_staff: ["eventAccess", "staffAccess"],
  finance_manager: ["financeAccess", "manageAccess", "staffAccess"],
  finance_staff: ["financeAccess", "staffAccess"],
  inventory_manager: [
    "inventoryAccess",
    "manageAccess",
    "procurementAccess",
    "staffAccess",
  ],
  inventory_staff: ["inventoryAccess", "staffAccess"],
  kitchen_lead: ["kitchenAccess", "staffAccess"],
  kitchen_manager: ["kitchenAccess", "manageAccess", "staffAccess"],
  kitchen_staff: ["kitchenAccess", "staffAccess"],
  logistics_manager: ["logisticsAccess", "manageAccess", "staffAccess"],
  logistics_staff: ["logisticsAccess", "staffAccess"],
  procurement_staff: ["inventoryAccess", "procurementAccess", "staffAccess"],
  sales_manager: ["manageAccess", "salesAccess", "staffAccess"],
  sales_staff: ["salesAccess", "staffAccess"],
  workforce_manager: [
    "manageAccess",
    "staffAccess",
    "workforceAccess",
    "workforceManageAccess",
  ],
  workforce_staff: ["staffAccess", "workforceAccess"],
};

/** Newest channel rows read for @mentions (the mention window is 7 days). */
const MESSAGE_TAKE = 400;
/** Same window deriveNotifications uses for mentions (RECENT_WINDOW_MS). */
const MENTION_WINDOW_MS = 7 * 86_400_000;
/** Same window deriveNotifications uses for stage changes (RECENT_WINDOW_MS). */
const STAGE_WINDOW_MS = 7 * 86_400_000;
/** Same retention window deriveNotifications uses for unread DMs. */
const MESSAGE_RETENTION_MS = 90 * 86_400_000;
/** Hard ceiling on the caller's received-DM walk (it stops at retention first). */
const RECEIVED_CAP = 4000;

function can(auth: AppAuthContext, ...capabilities: string[]): boolean {
  const granted = ROLE_CAPABILITIES[auth.role] ?? [];
  return capabilities.some(
    (capability) =>
      granted.includes(capability) &&
      !orgCapabilityDeniesAction(capability, auth.disabledCapabilities),
  );
}

/**
 * The newest rows read per source. A whole table read every time the bell
 * loads timed out on production after a large import and stalled every other
 * screen; the bell is about recent and open items, so the newest rows do.
 */
const SOURCE_CAP = 500;
/** People are read for names, so more of them. */
const PEOPLE_CAP = 2000;

export const listNotifications = query({
  args: {},
  handler: async (ctx) => {
    const auth = await getAuthContext(ctx);
    const tenantId = auth.tenantId;
    if (!tenantId) return [];

    const byTenant = <T>(q: { eq: (field: "tenantId", value: string) => T }) =>
      q.eq("tenantId", tenantId);
    const when = <T>(allowed: boolean, read: () => Promise<T>) =>
      allowed ? read() : Promise.resolve(undefined);
    // Rows in the given states only, through each table's (tenant, status)
    // index, so newer closed rows never push an open one out.
    type StatusTable =
      | "incidents"
      | "invoices"
      | "timeOffRequests"
      | "vendorOrders"
      | "reviewFlags"
      | "equipmentIssues"
      | "quoteSubmissions"
      | "shiftSwapRequests"
      | "deliveries";
    const inStates = async <N extends StatusTable>(
      table: N,
      states: string[],
    ): Promise<Doc<N>[]> =>
      (
        await Promise.all(
          states.map((status) =>
            ctx.db
              .query(table)
              .withIndex("by_tenantId_and_status", (q: any) =>
                q.eq("tenantId", tenantId).eq("status", status),
              )
              .take(SOURCE_CAP),
          ),
        )
      ).flat() as Doc<N>[];

    // One guard per source, each the same capability test as the generated
    // list<Entity> query in convex/queries.ts.
    const [
      events,
      incidents,
      invoices,
      inventoryItems,
      ,
      shifts,
      people,
      qualifications,
      timeOffRequests,
      vendorOrders,
      staffMessages,
      prepTaskComments,
      dateHolds,
      dateWaitlistEntries,
      reviewFlags,
      equipmentIssues,
      quoteSubmissions,
      swapsForMe,
      myTimeOff,
      swapsToApprove,
      failedDeliveries,
    ] = await Promise.all([
      // Not every event (13 s at 10,000 events, and the socket holds every
      // other read of the screen until this one answers): only the events
      // waiting for approval and those whose stage changed inside the
      // seven-day window deriveNotifications shows.
      when(can(auth, "eventAccess", "salesAccess"), async () => {
        const since = Date.now() - STAGE_WINDOW_MS;
        const lists = await Promise.all([
          ctx.db
            .query("events")
            .withIndex("by_tenantId_and_stage_and_startsAt", (q) =>
              q.eq("tenantId", tenantId).eq("stage", "pending_approval"),
            )
            .take(SOURCE_CAP),
          ctx.db
            .query("events")
            .withIndex("by_tenantId_and_approvedAt", (q) =>
              q.eq("tenantId", tenantId).gte("approvedAt", since),
            )
            .take(SOURCE_CAP),
          ctx.db
            .query("events")
            .withIndex("by_tenantId_and_executionStartedAt", (q) =>
              q.eq("tenantId", tenantId).gte("executionStartedAt", since),
            )
            .take(SOURCE_CAP),
          ctx.db
            .query("events")
            .withIndex("by_tenantId_and_completedAt", (q) =>
              q.eq("tenantId", tenantId).gte("completedAt", since),
            )
            .take(SOURCE_CAP),
          ctx.db
            .query("events")
            .withIndex("by_tenantId_and_cancelledAt", (q) =>
              q.eq("tenantId", tenantId).gte("cancelledAt", since),
            )
            .take(SOURCE_CAP),
          ctx.db
            .query("events")
            .withIndex("by_tenantId_and_closedOutAt", (q) =>
              q.eq("tenantId", tenantId).gte("closedOutAt", since),
            )
            .take(SOURCE_CAP),
        ]);
        const byId = new Map<string, Doc<"events">>();
        for (const row of lists.flat()) byId.set(String(row._id), row);
        return [...byId.values()];
      }),
      when(can(auth, "eventAccess", "kitchenAccess"), () =>
        inStates("incidents", ["open", "investigating"]),
      ),
      when(can(auth, "financeAccess", "manageAccess"), () =>
        inStates("invoices", ["overdue", "sent", "viewed", "partial"]),
      ),
      // Only tracked lines (a reorder point above zero) can be low.
      when(can(auth, "inventoryAccess"), () =>
        ctx.db
          .query("inventoryItems")
          .withIndex("by_tenantId_and_reorderThreshold", (q) =>
            q.eq("tenantId", tenantId).gt("reorderThreshold", 0),
          )
          .take(PEOPLE_CAP),
      ),
      // Names for the stock lines, read by id below.
      Promise.resolve(undefined),
      // Shifts not yet over: double bookings and swaps are about these.
      when(can(auth, "workforceAccess"), () =>
        ctx.db
          .query("shifts")
          .withIndex("by_tenantId_and_endsAt", (q) =>
            q.eq("tenantId", tenantId).gte("endsAt", Date.now()),
          )
          .take(PEOPLE_CAP),
      ),
      when(can(auth, "staffAccess"), () =>
        ctx.db
          .query("people")
          .withIndex("by_tenantId", byTenant)
          .order("desc")
          .take(PEOPLE_CAP),
      ),
      // Active certificates that expire inside the 30-day window, and any
      // renewals for the same person and name (a renewal ends later).
      when(can(auth, "workforceAccess"), async () => {
        const expiring = await ctx.db
          .query("qualifications")
          .withIndex("by_tenantId_and_status_and_expiresAt", (q) =>
            q
              .eq("tenantId", tenantId)
              .eq("status", "active")
              .lte("expiresAt", Date.now() + 30 * 86_400_000),
          )
          .take(SOURCE_CAP);
        const renewals = await Promise.all(
          expiring.map((row) =>
            ctx.db
              .query("qualifications")
              .withIndex("by_staff_certification_expiry", (q) =>
                q
                  .eq("tenantId", tenantId)
                  .eq("personId", row.personId)
                  .eq("status", "active")
                  .eq("name", row.name)
                  .gt("expiresAt", row.expiresAt ?? 0),
              )
              .take(5),
          ),
        );
        const byId = new Map<string, Doc<"qualifications">>();
        for (const row of [...expiring, ...renewals.flat()])
          byId.set(String(row._id), row);
        return [...byId.values()];
      }),
      // Row policy: workforceManageAccess, or the requester's own row. Own
      // rows never notify, so only the manage capability matters here.
      when(can(auth, "workforceManageAccess"), () =>
        inStates("timeOffRequests", ["pending"]),
      ),
      when(can(auth, "procurementAccess", "manageAccess"), () =>
        inStates("vendorOrders", ["pending_approval"]),
      ),
      // Team chat made staffMessages a high-volume table, so this is no
      // longer a tenant-wide collect: the caller's direct messages — received
      // AND sent, so the tray sees the same newest-400-per-pair window the
      // thread shows — come from the caller's own person indexes walked back
      // through the 90-day retention window; @mentions from the newest
      // channel traffic (the mention window is seven days). Merged and
      // de-duplicated below.
      when(can(auth, "staffAccess"), async () => {
        const since = Date.now() - MESSAGE_RETENTION_MS;
        // Bounded by rows VISITED, not rows kept: a sender's index range also
        // holds their channel messages, and this runs on every page.
        const walk = async (
          range: AsyncIterable<Doc<"staffMessages">>,
          keep: (row: Doc<"staffMessages">) => boolean,
        ) => {
          const out: Doc<"staffMessages">[] = [];
          let visited = 0;
          for await (const row of range) {
            if (++visited > RECEIVED_CAP) break;
            if ((row.createdAt ?? row._creationTime) < since) break;
            if (keep(row)) out.push(row);
          }
          return out;
        };
        const me = auth.personId as Id<"people"> | null;
        const [received, sent, recent] = await Promise.all([
          me
            ? walk(
                ctx.db
                  .query("staffMessages")
                  .withIndex("by_recipientPersonId", (q) =>
                    q.eq("recipientPersonId", me),
                  )
                  .order("desc"),
                () => true,
              )
            : [],
          me
            ? walk(
                ctx.db
                  .query("staffMessages")
                  .withIndex("by_senderPersonId", (q) =>
                    q.eq("senderPersonId", me),
                  )
                  .order("desc"),
                (row) => row.recipientPersonId != null,
              )
            : [],
          ctx.db
            .query("staffMessages")
            .withIndex("by_tenantId", byTenant)
            .order("desc")
            .take(MESSAGE_TAKE),
        ]);
        const seen = new Set<string>();
        // The tenant-wide sample serves @mentions only, so it carries channel
        // rows alone: the caller's direct messages come from their own person
        // walks, never from a sample that could hold someone else's DM.
        const channelRecent = recent.filter((row) => row.eventId != null);
        return [...received, ...sent, ...channelRecent].filter((row) => {
          if (row.tenantId !== tenantId || seen.has(String(row._id))) {
            return false;
          }
          seen.add(String(row._id));
          return true;
        });
      }),
      when(can(auth, "kitchenAccess", "manageAccess"), () =>
        ctx.db
          .query("prepTaskComments")
          .withIndex("by_tenantId", byTenant)
          .order("desc")
          .take(SOURCE_CAP),
      ),
      // Date holds and their waitlist: low-volume sales rows (listDateHold /
      // listDateWaitlistEntry read guard; the tray prompt is for sales).
      when(can(auth, "salesAccess"), () =>
        ctx.db
          .query("dateHolds")
          .withIndex("by_tenantId", byTenant)
          .order("desc")
          .take(SOURCE_CAP),
      ),
      when(can(auth, "salesAccess"), () =>
        ctx.db
          .query("dateWaitlistEntries")
          .withIndex("by_tenantId", byTenant)
          .order("desc")
          .take(SOURCE_CAP),
      ),
      // Open flags and crew questions: the kitchen and the event team are
      // told, not only whoever opens the event next.
      when(can(auth, "eventAccess", "kitchenAccess", "manageAccess"), () =>
        inStates("reviewFlags", ["open"]),
      ),
      // Open equipment problems (listEquipmentIssue read guard).
      when(
        can(
          auth,
          "inventoryAccess",
          "logisticsAccess",
          "eventManageAccess",
          "financeAccess",
        ),
        () =>
          inStates("equipmentIssues", ["open"]).then((rows) =>
            rows.filter(
              (row) => row.status === "open" && row.deletedAt == null,
            ),
          ),
      ),
      // Unanswered website quote requests (sales reads them).
      when(can(auth, "salesAccess"), () =>
        inStates("quoteSubmissions", ["pending"]),
      ),
      // Swaps a coworker asked this person to take.
      auth.personId
        ? ctx.db
            .query("shiftSwapRequests")
            .withIndex("by_recipientPersonId", (q) =>
              q.eq("recipientPersonId", auth.personId as Id<"people">),
            )
            .collect()
            .then((rows) =>
              rows.filter(
                (row) =>
                  row.tenantId === tenantId &&
                  row.status === "pending_recipient" &&
                  row.deletedAt == null,
              ),
            )
        : [],
      // This person's own time-off requests, for the answer.
      auth.personId
        ? ctx.db
            .query("timeOffRequests")
            .withIndex("by_personId", (q) =>
              q.eq("personId", auth.personId as Id<"people">),
            )
            .collect()
            .then((rows) =>
              rows.filter(
                (row) =>
                  row.tenantId === tenantId &&
                  row.deletedAt == null &&
                  row.status !== "pending",
              ),
            )
        : [],
      // Swaps both staff agreed to, waiting for a manager.
      when(can(auth, "workforceManageAccess"), () =>
        inStates("shiftSwapRequests", ["awaiting_manager"]).then((rows) =>
          rows.filter(
            (row) => row.status === "awaiting_manager" && row.deletedAt == null,
          ),
        ),
      ),
      // Deliveries that failed this past week.
      when(can(auth, "logisticsAccess", "eventManageAccess"), () =>
        inStates("deliveries", ["failed"]).then((rows) =>
          rows.filter(
            (row) =>
              row.status === "failed" &&
              row.deletedAt == null &&
              Number(row.failedAt ?? 0) > Date.now() - 7 * 86_400_000,
          ),
        ),
      ),
    ]);

    // Service that is past due: trucks (by date or by miles) and equipment.
    const maintenanceDue: NonNullable<NotificationSources["maintenanceDue"]> =
      [];
    const now = Date.now();
    if (can(auth, "logisticsAccess", "manageAccess")) {
      const [schedules, vehicles, fuel, service] = await Promise.all([
        // A fleet and its service plans are small: read whole, so no due
        // service is cut off. Odometers come from the newest logs.
        ctx.db
          .query("vehicleMaintenanceSchedules")
          .withIndex("by_tenantId", byTenant)
          .collect(),
        ctx.db.query("vehicles").withIndex("by_tenantId", byTenant).collect(),
        ctx.db
          .query("vehicleFuelLogs")
          .withIndex("by_tenantId", byTenant)
          .order("desc")
          .take(SOURCE_CAP),
        ctx.db
          .query("vehicleServiceEntries")
          .withIndex("by_tenantId", byTenant)
          .order("desc")
          .take(SOURCE_CAP),
      ]);
      const odometer = new Map<string, number>();
      for (const row of [...fuel, ...service]) {
        if (row.deletedAt != null) continue;
        const id = String(row.vehicleId);
        odometer.set(id, Math.max(odometer.get(id) ?? 0, row.odometer));
      }
      for (const schedule of schedules) {
        if (schedule.deletedAt != null) continue;
        const vehicle = vehicles.find((row) => row._id === schedule.vehicleId);
        if (!vehicle || vehicle.deletedAt != null) continue;
        const overdue =
          schedule.intervalType === "mileage"
            ? schedule.nextDueMileage != null &&
              (odometer.get(String(schedule.vehicleId)) ?? 0) >=
                schedule.nextDueMileage
            : schedule.nextDueAt != null && schedule.nextDueAt < now;
        if (!overdue) continue;
        maintenanceDue.push({
          id: `vehicle:${schedule._id}:${schedule.nextDueAt ?? schedule.nextDueMileage}`,
          name: `${vehicle.registration} ${vehicle.make} ${vehicle.model}`.trim(),
          task: schedule.taskName,
          link: "/logistics/maintenance",
          at: schedule.nextDueAt ?? schedule.updatedAt ?? now,
        });
      }
    }
    if (can(auth, "inventoryAccess", "logisticsAccess")) {
      const tasks = await ctx.db
        .query("equipmentMaintenanceTasks")
        .withIndex("by_tenantId_and_nextDueAt", (q) =>
          q.eq("tenantId", tenantId).gt("nextDueAt", 0).lt("nextDueAt", now),
        )
        .take(SOURCE_CAP);
      for (const task of tasks) {
        if (task.deletedAt != null || task.nextDueAt == null) continue;
        if (task.nextDueAt >= now) continue;
        const item = await ctx.db.get(task.equipmentId);
        if (!item || item.tenantId !== tenantId || item.deletedAt != null)
          continue;
        maintenanceDue.push({
          id: `equipment:${task._id}:${task.nextDueAt}`,
          name: item.name,
          task: task.taskName,
          link: "/facilities/equipment",
          at: task.nextDueAt,
        });
      }
    }

    // Names of the equipment those problems are about, tenant-checked.
    const equipmentNames: Record<string, string> = {};
    await Promise.all(
      [
        ...new Set(
          (equipmentIssues ?? [])
            .filter((row) => row.equipmentId)
            .map((row) => String(row.equipmentId)),
        ),
      ].map(async (id) => {
        const equipmentId = ctx.db.normalizeId("equipments", id);
        const row = equipmentId ? await ctx.db.get(equipmentId) : null;
        if (row && row.tenantId === tenantId) equipmentNames[id] = row.name;
      }),
    );

    // Names of waiting clients, tenant-checked, for the date-opened prompt.
    const clientNames: Record<string, string> = {};
    await Promise.all(
      [
        ...new Set(
          (dateWaitlistEntries ?? [])
            .filter((row) => row.status === "waiting" && row.clientId)
            .map((row) => String(row.clientId)),
        ),
      ].map(async (id) => {
        const clientId = ctx.db.normalizeId("clients", id);
        const client = clientId ? await ctx.db.get(clientId) : null;
        if (client && client.tenantId === tenantId) {
          const person = [client.givenName, client.familyName]
            .filter(Boolean)
            .join(" ");
          clientNames[id] =
            client.clientType === "company"
              ? (client.companyName ?? person)
              : person || (client.companyName ?? "");
        }
      }),
    );

    // A mention hides once its channel has been read. The caller's cursor is
    // read per mention channel through the (channel, account) index, never
    // the account's whole cursor history.
    const mentionChannelKeys = new Set<string>();
    if (staffMessages && auth.personId) {
      const now = Date.now();
      for (const message of staffMessages) {
        if (
          message.eventId &&
          message.deletedAt == null &&
          message.createdAt != null &&
          now - message.createdAt <= MENTION_WINDOW_MS &&
          (message.mentionedPersonIds ?? "")
            .split(",")
            .some((id) => id.trim() === auth.personId)
        ) {
          mentionChannelKeys.add(`event:${String(message.eventId)}`);
        }
      }
    }
    const staffChatReadCursors = (
      await Promise.all(
        [...mentionChannelKeys].map((channelKey) =>
          ctx.db
            .query("staffChatReadCursors")
            .withIndex("by_channelKey_and_authSubjectId", (q) =>
              q.eq("channelKey", channelKey).eq("authSubjectId", auth.id),
            )
            .take(CURSOR_DUPLICATES_CAP),
        ),
      )
    )
      .flat()
      .filter((row) => row.tenantId === tenantId);

    // Titles the tray names beside an open allergen incident or a double
    // booking, read by id for callers that list events (as before, when the
    // whole event list supplied them).
    const eventTitles: Record<string, string> = {};
    if (events) {
      const ids = new Set<string>();
      for (const incident of incidents ?? []) {
        if (
          incident.eventId &&
          incident.deletedAt == null &&
          incident.category === "allergen" &&
          (incident.status === "open" || incident.status === "investigating")
        ) {
          ids.add(String(incident.eventId));
        }
      }
      findRosterConflicts({
        shifts: shifts ?? [],
        timeOff: [],
        qualifications: [],
        eventTitle: (id) => {
          if (id) ids.add(String(id));
          return "";
        },
        personName: () => "",
      });
      for (const flag of reviewFlags ?? []) ids.add(String(flag.eventId));
      for (const event of events) ids.delete(String(event._id));
      await Promise.all(
        [...ids].map(async (id) => {
          const eventId = ctx.db.normalizeId("events", id);
          const event = eventId ? await ctx.db.get(eventId) : null;
          if (event && event.tenantId === tenantId) {
            eventTitles[id] = String(event.title ?? "Untitled event");
          }
        }),
      );
    }

    // The events those failed deliveries were for.
    const deliveryEventTitles: Record<string, string> = {};
    await Promise.all(
      [
        ...new Set((failedDeliveries ?? []).map((row) => String(row.eventId))),
      ].map(async (id) => {
        const eventId = ctx.db.normalizeId("events", id);
        const event = eventId ? await ctx.db.get(eventId) : null;
        if (event && event.tenantId === tenantId)
          deliveryEventTitles[id] = String(event.title ?? "Untitled event");
      }),
    );

    // A mention needs its channel's title: hydrate only the events of the
    // caller's own mentions inside the mention window, tenant-checked, title
    // only (same narrow projection as eventDayBriefing).
    const mentionEventTitles: Record<string, string> = {};
    if (staffMessages && auth.personId) {
      const now = Date.now();
      const ids = new Set<string>();
      for (const message of staffMessages) {
        if (
          message.eventId &&
          message.deletedAt == null &&
          message.createdAt != null &&
          now - message.createdAt <= MENTION_WINDOW_MS &&
          (message.mentionedPersonIds ?? "")
            .split(",")
            .some((id) => id.trim() === auth.personId)
        ) {
          ids.add(String(message.eventId));
        }
      }
      await Promise.all(
        [...ids].map(async (id) => {
          const eventId = ctx.db.normalizeId("events", id);
          const event = eventId ? await ctx.db.get(eventId) : null;
          if (event && event.tenantId === tenantId && event.deletedAt == null) {
            mentionEventTitles[id] = String(event.title ?? "Untitled event");
          }
        }),
      );
    }

    // Names of the ingredients the stock lines hold, tenant-checked.
    // Only lines at or below their reorder point are named in the bell.
    const ingredients = (
      await Promise.all(
        [
          ...new Set(
            (inventoryItems ?? [])
              .filter((row) => row.quantityOnHand <= row.reorderThreshold)
              .map((row) => String(row.ingredientId)),
          ),
        ].map(async (id) => {
          const ingredientId = ctx.db.normalizeId("ingredients", id);
          const row = ingredientId ? await ctx.db.get(ingredientId) : null;
          return row && row.tenantId === tenantId ? row : null;
        }),
      )
    ).filter((row): row is Doc<"ingredients"> => row != null);

    return deriveNotifications({
      now: Date.now(),
      currentAuthSubjectId: auth.id || undefined,
      currentPersonId: auth.personId ?? null,
      events,
      incidents,
      invoices,
      inventoryItems,
      ingredients,
      shifts,
      people,
      qualifications,
      timeOffRequests,
      vendorOrders,
      staffMessages,
      prepTaskComments,
      staffChatReadCursors,
      mentionEventTitles,
      eventTitles,
      dateHolds,
      dateWaitlistEntries,
      clientNames,
      reviewFlags,
      equipmentIssues,
      equipmentNames,
      maintenanceDue,
      quoteSubmissions,
      shiftSwaps: [...(swapsForMe ?? []), ...(swapsToApprove ?? [])],
      myTimeOff,
      failedDeliveries: (failedDeliveries ?? []).map((row) => ({
        id: String(row._id),
        eventId: String(row.eventId),
        eventTitle: deliveryEventTitles[String(row.eventId)] ?? "an event",
        reason: row.failureReason ?? null,
        at: Number(row.failedAt ?? row._creationTime),
      })),
    });
  },
});
