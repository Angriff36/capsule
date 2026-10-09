// PL-DASHBOARDS: per event, what the owner's Company Scorecard needs for
// "Client Satisfaction Score" (the client's 1-5 score) and "Menu Adoption
// Rate" (how many menu lines are signature dishes). Counted here, one index
// read per event, so the scorecard never loads every menu line and every
// dish of the company.
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import { getAuthContext } from "./lib/authContext";
import { canRead } from "./search";

/** Most events one call counts. */
export const SCORE_EVENTS_CAP = 500;

export interface EventScoreRow {
  eventId: string;
  startsAt: number | null;
  stage: string;
  /**
   * The client's score on 1-5: the event's own score, or else the client's
   * 1-10 venue score from the after-event follow-up, halved. Null: none.
   */
  clientRating: number | null;
  /** Live menu lines; null when this role may not read dishes. */
  menuLines: number | null;
  /** Of those, lines whose dish (or its main dish) is a signature dish. */
  signatureLines: number | null;
}

export const forWindow = query({
  args: { from: v.number(), to: v.number() },
  handler: async (
    ctx,
    { from, to },
  ): Promise<{ rows: EventScoreRow[]; capped: boolean } | null> => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || !canRead(auth, ["staffAccess"])) return null;
    const tenantId = auth.tenantId;
    const readsDishes = canRead(auth, [
      "kitchenAccess",
      "inventoryAccess",
      "salesAccess",
      "manageAccess",
    ]);
    const readsVenueNotes = canRead(auth, ["eventAccess"]);
    const events = await ctx.db
      .query("events")
      .withIndex("by_tenantId_and_startsAt", (q) =>
        q.eq("tenantId", tenantId).gte("startsAt", from).lt("startsAt", to),
      )
      .take(SCORE_EVENTS_CAP + 1);
    const capped = events.length > SCORE_EVENTS_CAP;

    const signature = new Map<string, boolean>();
    const isSignature = async (dishId: Id<"dishes">): Promise<boolean> => {
      const known = signature.get(dishId);
      if (known !== undefined) return known;
      const dish = await ctx.db.get(dishId);
      let marked = dish?.tenantId === tenantId && dish.isSignature === true;
      if (!marked && dish?.tenantId === tenantId && dish.versionOfDishId) {
        const main = await ctx.db.get(dish.versionOfDishId);
        marked = main?.tenantId === tenantId && main.isSignature === true;
      }
      signature.set(dishId, marked);
      return marked;
    };

    const rows: EventScoreRow[] = [];
    for (const event of events.slice(0, SCORE_EVENTS_CAP)) {
      if (event.deletedAt != null) continue;
      let menuLines: number | null = null;
      let signatureLines: number | null = null;
      if (readsDishes) {
        const lines = (
          await ctx.db
            .query("eventDishes")
            .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
            .collect()
        ).filter(
          (line) =>
            line.tenantId === tenantId &&
            line.deletedAt == null &&
            line.removedAt == null,
        );
        menuLines = lines.length;
        signatureLines = 0;
        for (const line of lines)
          if (await isSignature(line.dishId)) signatureLines++;
      }
      rows.push({
        eventId: event._id,
        startsAt: event.startsAt ?? null,
        stage: event.stage,
        clientRating:
          event.clientRating ??
          (readsVenueNotes ? await venueScore(ctx, tenantId, event) : null),
        menuLines,
        signatureLines,
      });
    }
    return { rows, capped };
  },
});

/** The newest client 1-10 venue score for the event, on 1-5. */
async function venueScore(
  ctx: QueryCtx,
  tenantId: string,
  event: Doc<"events">,
): Promise<number | null> {
  const notes = await ctx.db
    .query("venueNotes")
    .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
    .collect();
  const scored = notes
    .filter(
      (note) =>
        note.tenantId === tenantId &&
        note.deletedAt == null &&
        note.postedAt != null &&
        note.category === "client_feedback" &&
        note.rating != null,
    )
    .sort((a, b) => Number(b.postedAt) - Number(a.postedAt));
  return scored.length ? Number(scored[0].rating) / 2 : null;
}
