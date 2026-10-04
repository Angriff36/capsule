// AUTHOR SEAM — PL-MONITORING (AC-165): the System health problems that need
// someone to act, in every manager's notification bell, so a stuck message or
// a broken connection reaches a person on whatever screen they are on, not
// only when someone opens Admin > Integrations.
//
// Managers only (the same rule as the System health list); everyone else gets
// an empty list before anything is read. One read of the company's own ledger
// is shared by text alerts, Google Calendar and QuickBooks, so a manager's tab
// carries one extra subscription, not four. Only "act" items: the "check"
// items stay on the Integrations list, where the person who can fix them looks.
//
// Not here: "server not answering" (the server cannot report that itself; the
// Integrations list shows it from the screen's own connection state).
import type { AppNotification } from "../src/features/notifications/deriveNotifications";
import { classifyHealth } from "../src/lib/operationalHealth";
import { query } from "./_generated/server";
import { outsideMessageHealthFor } from "./deliveryHealth";
import {
  CONNECTION_ENTITY as CALENDAR_CONNECTION_ENTITY,
  asRecord,
  canManage,
  latestActiveConnection as latestCalendarConnection,
} from "./googleCalendar";
import { getAuthContext } from "./lib/authContext";
import {
  CONNECTION_ENTITY as QUICKBOOKS_CONNECTION_ENTITY,
  latestActiveConnection as latestQuickBooksConnection,
} from "./qboSync";

const HEALTH_LINK = "/admin/integrations";

export const attention = query({
  args: {},
  handler: async (ctx): Promise<AppNotification[]> => {
    const auth = await getAuthContext(ctx);
    const tenantId = auth.tenantId;
    if (!tenantId || !canManage(auth.role)) return [];
    const now = Date.now();
    const tenantLedger = await ctx.db
      .query("manifestEvents")
      .withIndex("by_entityId", (q) => q.eq("entityId", tenantId))
      .collect();
    const messages = await outsideMessageHealthFor(
      ctx,
      tenantId,
      tenantLedger,
      now,
    );

    const newest = (entity: string, type: string, connectionId?: string) =>
      tenantLedger
        .filter(
          (row) =>
            row.entity === entity &&
            row.type === type &&
            (connectionId == null ||
              asRecord(row.payload).connectionId === connectionId),
        )
        .sort((left, right) => right.createdAt - left.createdAt)[0];

    const calendarConnection = latestCalendarConnection(tenantLedger);
    const calendarRun =
      calendarConnection &&
      newest(
        CALENDAR_CONNECTION_ENTITY,
        "GoogleCalendarReconciled",
        calendarConnection.connectionId,
      );
    const quickBooksRun = newest(
      QUICKBOOKS_CONNECTION_ENTITY,
      "QuickBooksReconciled",
    );
    const quickBooksConnection = latestQuickBooksConnection(tenantLedger);

    const alerts = classifyHealth({
      now,
      pageBuild: null,
      backend: undefined,
      messages,
      calendar: calendarConnection
        ? {
            state:
              asRecord(calendarRun?.payload).status === "needs_reconnect"
                ? "needs_reconnect"
                : "in_step",
            failedCount: 0,
            accessEndsAt: calendarConnection.refreshTokenExpiresAt,
          }
        : null,
      quickBooks: {
        connected: quickBooksConnection != null,
        accessEndsAt: quickBooksConnection?.refreshTokenExpiresAt ?? null,
        lastStatus:
          quickBooksRun == null
            ? null
            : String(asRecord(quickBooksRun.payload).status ?? ""),
        failed: 0,
      },
    });

    const stuckSince = new Map(
      messages.map((channel) => [
        `${channel.channel}-stuck`,
        channel.oldestWaitingSince,
      ]),
    );
    return alerts
      .filter((alert) => alert.level === "act")
      .map((alert) => ({
        id: `system-health:${alert.key}`,
        kind: "system_health" as const,
        message: alert.title,
        link: HEALTH_LINK,
        at: stuckSince.get(alert.key) ?? now,
      }));
  },
});
