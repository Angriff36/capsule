// PL-SCALE (AC-172): the calendar home reads the six weeks it draws, not the
// company's whole event, invoice, delivery, client and event-number tables.
// It returns the same rows buildCalendarFacts (src/features/home/
// homeCalendar.ts) already takes, limited to events that touch the grid
// (events up to two weeks long that start before it still show) plus events
// with no date. Each related list follows its own read rule, as the old
// page did by reading the generated lists.
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { getAuthContext } from "./lib/authContext";
import { canRead } from "./search";

const DAY = 86_400_000;
/** A busy month for a large caterer is a few hundred events. */
export const CALENDAR_EVENT_CAP = 2000;
const UNDATED_CAP = 200;

export interface CalendarMonth {
  events: Doc<"events">[];
  clients: Doc<"clients">[];
  deliveries: Doc<"deliveries">[];
  invoices: Pick<Doc<"invoices">, "deletedAt" | "eventId" | "invoiceNumber">[];
  numberAssignments: Doc<"eventNumberAssignments">[];
  /** More events touch the grid than the read returns. */
  capped: boolean;
}

export const month = query({
  args: { from: v.number(), to: v.number() },
  handler: async (ctx, { from, to }): Promise<CalendarMonth | null> => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || !canRead(auth, ["staffAccess"])) return null;
    const tenantId = auth.tenantId;
    const live = (e: Doc<"events">) => e.deletedAt == null;

    const [dated, none, missing] = await Promise.all([
      ctx.db
        .query("events")
        .withIndex("by_tenantId_and_startsAt", (q) =>
          q
            .eq("tenantId", tenantId)
            .gte("startsAt", from - 14 * DAY)
            .lt("startsAt", to),
        )
        .take(CALENDAR_EVENT_CAP + 1),
      ctx.db
        .query("events")
        .withIndex("by_tenantId_and_startsAt", (q) =>
          q.eq("tenantId", tenantId).eq("startsAt", null),
        )
        .take(UNDATED_CAP),
      ctx.db
        .query("events")
        .withIndex("by_tenantId_and_startsAt", (q) =>
          q.eq("tenantId", tenantId).eq("startsAt", undefined),
        )
        .take(UNDATED_CAP),
    ]);
    const capped = dated.length > CALENDAR_EVENT_CAP;
    const events = [
      ...dated
        .slice(0, CALENDAR_EVENT_CAP)
        .filter(
          (e) => e.startsAt! >= from || (e.endsAt != null && e.endsAt > from),
        ),
      ...none,
      ...missing,
    ]
      .filter(live)
      // The calendar never shows the import draft or the (encrypted) contact
      // fields; leave them out of the read.
      .map((e) => ({
        ...e,
        importDraftJson: null,
        primaryContactName: null,
        primaryContactEmail: null,
        primaryContactPhone: null,
      }));

    const seesClients = canRead(auth, ["salesAccess", "financeAccess"]);
    const seesDeliveries = canRead(auth, ["logisticsAccess", "manageAccess"]);
    const seesInvoices = canRead(auth, ["financeAccess", "manageAccess"]);

    const clientIds = new Set(
      events.map((e) => e.clientId).filter((id) => id != null),
    );
    const [clients, deliveries, invoices, numberAssignments] =
      await Promise.all([
        seesClients
          ? Promise.all([...clientIds].map((id) => ctx.db.get(id)))
          : Promise.resolve([]),
        seesDeliveries
          ? Promise.all(
              events.map((e) =>
                ctx.db
                  .query("deliveries")
                  .withIndex("by_eventId", (q) => q.eq("eventId", e._id))
                  .take(20),
              ),
            )
          : Promise.resolve([]),
        seesInvoices
          ? Promise.all(
              events.map((e) =>
                ctx.db
                  .query("invoices")
                  .withIndex("by_eventId", (q) => q.eq("eventId", e._id))
                  .take(5),
              ),
            )
          : Promise.resolve([]),
        Promise.all(
          events.map((e) =>
            ctx.db
              .query("eventNumberAssignments")
              .withIndex("by_eventId", (q) => q.eq("eventId", e._id))
              .first(),
          ),
        ),
      ]);
    const mine = <T extends { tenantId: string }>(rows: (T | null)[]) =>
      rows.filter((row): row is T => row != null && row.tenantId === tenantId);

    return {
      events,
      clients: mine(clients),
      // Delivery notes are encrypted and not shown on the calendar.
      deliveries: mine(deliveries.flat())
        .filter((d) => d.deletedAt == null)
        .map((d) => ({ ...d, notes: null })),
      invoices: mine(invoices.flat())
        .filter((i) => i.deletedAt == null)
        .map((i) => ({
          deletedAt: i.deletedAt,
          eventId: i.eventId,
          invoiceNumber: i.invoiceNumber,
        })),
      numberAssignments: mine(numberAssignments),
      capped,
    };
  },
});
