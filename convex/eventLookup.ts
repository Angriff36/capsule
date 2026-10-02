// PL-SCALE (AC-172): screens that only need an event's name, date or stage
// for rows they already hold (prep tasks, pack lists, deliveries, shifts,
// closeouts...) read those events by id here, not the generated listEvent,
// which loads every event of the company with its whole menu tree. One point
// read per id; at most LOOKUP_CAP ids per call. Deleted events are returned
// with deletedAt so callers can say "removed" as before.
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { getAuthContext } from "./lib/authContext";
import { canRead } from "./search";

export const LOOKUP_CAP = 1000;

export type EventLookupRow = Pick<
  Doc<"events">,
  | "_id"
  | "title"
  | "stage"
  | "eventType"
  | "startsAt"
  | "endsAt"
  | "venueId"
  | "venueName"
  | "clientId"
  | "expectedHeadcount"
  | "serviceStyleId"
  | "occasionId"
  | "eventNumber"
  | "deletedAt"
>;

export const byIds = query({
  args: { ids: v.array(v.string()) },
  handler: async (ctx, { ids }): Promise<EventLookupRow[] | null> => {
    const auth = await getAuthContext(ctx);
    // Same read rule as the generated listEvent.
    if (!auth.tenantId || !canRead(auth, ["staffAccess"])) return null;
    const tenantId = auth.tenantId;
    const wanted = [...new Set(ids)].slice(0, LOOKUP_CAP);
    const rows: EventLookupRow[] = [];
    for (const raw of wanted) {
      const id = ctx.db.normalizeId("events", raw);
      if (!id) continue;
      const e = await ctx.db.get(id);
      if (!e || e.tenantId !== tenantId) continue;
      rows.push({
        _id: e._id,
        title: e.title,
        stage: e.stage,
        eventType: e.eventType,
        startsAt: e.startsAt ?? null,
        endsAt: e.endsAt ?? null,
        venueId: e.venueId ?? null,
        venueName: e.venueName ?? null,
        clientId: e.clientId ?? null,
        expectedHeadcount: e.expectedHeadcount ?? null,
        serviceStyleId: e.serviceStyleId ?? null,
        occasionId: e.occasionId ?? null,
        eventNumber: e.eventNumber ?? null,
        deletedAt: e.deletedAt ?? null,
      });
    }
    return rows;
  },
});
