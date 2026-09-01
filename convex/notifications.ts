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
import type { Id } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { deriveNotifications } from "../src/features/notifications/deriveNotifications";
import { getAuthContext, type AppAuthContext } from "./lib/authContext";
import { orgCapabilityDeniesAction } from "./lib/orgCapabilityGate";

const ALL_ACCESS = [
  "eventAccess",
  "financeAccess",
  "inventoryAccess",
  "kitchenAccess",
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
  driver: ["staffAccess"],
  event_manager: ["eventAccess", "manageAccess", "staffAccess"],
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
  logistics_manager: ["manageAccess", "staffAccess"],
  logistics_staff: ["staffAccess"],
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

    // One guard per source, each the same capability test as the generated
    // list<Entity> query in convex/queries.ts.
    const [
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
    ] = await Promise.all([
      when(can(auth, "eventAccess", "salesAccess"), () =>
        ctx.db.query("events").withIndex("by_tenantId", byTenant).collect(),
      ),
      when(can(auth, "eventAccess", "kitchenAccess"), () =>
        ctx.db.query("incidents").withIndex("by_tenantId", byTenant).collect(),
      ),
      when(can(auth, "financeAccess", "manageAccess"), () =>
        ctx.db.query("invoices").withIndex("by_tenantId", byTenant).collect(),
      ),
      when(can(auth, "inventoryAccess"), () =>
        ctx.db
          .query("inventoryItems")
          .withIndex("by_tenantId", byTenant)
          .collect(),
      ),
      when(can(auth, "kitchenAccess"), () =>
        ctx.db
          .query("ingredients")
          .withIndex("by_tenantId", byTenant)
          .collect(),
      ),
      when(can(auth, "workforceAccess"), () =>
        ctx.db.query("shifts").withIndex("by_tenantId", byTenant).collect(),
      ),
      when(can(auth, "staffAccess"), () =>
        ctx.db.query("people").withIndex("by_tenantId", byTenant).collect(),
      ),
      when(can(auth, "workforceAccess"), () =>
        ctx.db
          .query("qualifications")
          .withIndex("by_tenantId", byTenant)
          .collect(),
      ),
      // Row policy: workforceManageAccess, or the requester's own row. Own
      // rows never notify, so only the manage capability matters here.
      when(can(auth, "workforceManageAccess"), () =>
        ctx.db
          .query("timeOffRequests")
          .withIndex("by_tenantId", byTenant)
          .collect(),
      ),
      when(can(auth, "procurementAccess", "manageAccess"), () =>
        ctx.db
          .query("vendorOrders")
          .withIndex("by_tenantId", byTenant)
          .collect(),
      ),
      // Team chat made staffMessages a high-volume table, so this is no
      // longer a tenant-wide collect: unread DMs come from the caller's own
      // recipient index walked back through the 90-day retention window,
      // @mentions from the newest channel traffic (the mention window is
      // seven days). Merged and de-duplicated below.
      when(can(auth, "staffAccess"), async () => {
        const receivedInWindow = async () => {
          if (!auth.personId) return [];
          const since = Date.now() - MESSAGE_RETENTION_MS;
          const out = [];
          const range = ctx.db
            .query("staffMessages")
            .withIndex("by_recipientPersonId", (q) =>
              q.eq("recipientPersonId", auth.personId as Id<"people">),
            )
            .order("desc");
          for await (const row of range) {
            if ((row.createdAt ?? row._creationTime) < since) break;
            out.push(row);
            if (out.length >= RECEIVED_CAP) break;
          }
          return out;
        };
        const [received, recent] = await Promise.all([
          receivedInWindow(),
          ctx.db
            .query("staffMessages")
            .withIndex("by_tenantId", byTenant)
            .order("desc")
            .take(MESSAGE_TAKE),
        ]);
        const seen = new Set<string>();
        return [...received, ...recent].filter((row) => {
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
          .collect(),
      ),
      // Only the caller's own cursors (by_authSubjectId) — a mention hides
      // once its channel has been read.
      when(can(auth, "staffAccess") && auth.id !== "", () =>
        ctx.db
          .query("staffChatReadCursors")
          .withIndex("by_authSubjectId", (q) => q.eq("authSubjectId", auth.id))
          .collect(),
      ),
    ]);

    // Roles without eventAccess cannot list events, but a mention still
    // needs its channel's title: hydrate only the events of the caller's own
    // mentions inside the mention window, tenant-checked, title only (same
    // narrow projection as eventDayBriefing).
    const mentionEventTitles: Record<string, string> = {};
    if (!events && staffMessages && auth.personId) {
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
          const event = await ctx.db.get(id as Id<"events">);
          if (event && event.tenantId === tenantId && event.deletedAt == null) {
            mentionEventTitles[id] = String(event.title ?? "Untitled event");
          }
        }),
      );
    }

    return deriveNotifications({
      now: Date.now(),
      currentAuthSubjectId: auth.id || undefined,
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
      staffChatReadCursors: staffChatReadCursors?.filter(
        (row) => row.tenantId === tenantId,
      ),
      mentionEventTitles,
    });
  },
});
