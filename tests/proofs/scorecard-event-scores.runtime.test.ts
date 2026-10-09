/**
 * Runtime proof (PL-DASHBOARDS): the Company Scorecard's "Client Satisfaction
 * Score" and "Menu Adoption Rate" (convex/scorecardEventScores.ts). Staff
 * write down the client's 1-5 score on the event and mark signature dishes;
 * the read gives, per event in the window, the score (or the client's 1-10
 * venue follow-up score, halved) and how many menu lines are signature
 * dishes (a version of a signature dish counts), for this company only.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const TENANT = "tenant-event-scores";
const OTHER = "tenant-event-scores-other";
const DAY = 86_400_000;
const START = Date.UTC(2026, 9, 1);

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

type Row = {
  eventId: string;
  clientRating: number | null;
  menuLines: number | null;
  signatureLines: number | null;
};

describe("runtime proof: client scores and signature dishes for the scorecard", () => {
  it("records the score and the signature mark, and counts them per event", async () => {
    const proof = createManifestTestContext({
      convexTest: convexTest as never,
      schema,
      modules,
    });
    const owner = proof.asRole({
      subject: "event-scores-owner",
      role: "owner",
      tenantId: TENANT,
    });
    const outsider = proof.asRole({
      subject: "event-scores-outsider",
      role: "owner",
      tenantId: OTHER,
    });

    const ids = await owner.run(async (ctx) => {
      const dish = async (name: string, versionOfDishId?: Id<"dishes">) =>
        (await ctx.db.insert("dishes", {
          tenantId: TENANT,
          name,
          portionSize: 1,
          portionUnit: "each",
          status: "active",
          versionOfDishId,
          version: 1,
        })) as Id<"dishes">;
      const event = async (
        title: string,
        startsAt: number,
        tenantId = TENANT,
      ) =>
        (await ctx.db.insert("events", {
          tenantId,
          title,
          eventType: "dinner",
          stage: "completed",
          startsAt,
          version: 1,
        })) as Id<"events">;
      const line = async (
        eventId: Id<"events">,
        dishId: Id<"dishes">,
        removed = false,
      ) =>
        ctx.db.insert("eventDishes", {
          tenantId: TENANT,
          eventId,
          dishId,
          quantityServings: 50,
          removedAt: removed ? START : null,
          deletedAt: null,
          version: 1,
        });
      const lasagna = await dish("Lasagna");
      const lasagnaDropOff = await dish("Lasagna", lasagna);
      const salad = await dish("Salad");
      const gala = await event("Gala", START + DAY);
      const lunch = await event("Lunch", START + 2 * DAY);
      const later = await event("Next month", START + 40 * DAY);
      const theirs = await event("Theirs", START + DAY, OTHER);
      await line(gala, lasagna);
      await line(gala, lasagnaDropOff);
      await line(gala, salad);
      await line(gala, salad, true);
      await line(lunch, salad);
      const venueId = await ctx.db.insert("venues", {
        tenantId: TENANT,
        name: "Pier Hall",
        venueType: "banquet_hall",
        capacity: 200,
        status: "active",
        version: 1,
      });
      const personId = await ctx.db.insert("people", {
        tenantId: TENANT,
        givenName: "Sam",
        familyName: "Rep",
        email: "sam@example.com",
        role: "sales_staff",
        employmentType: "full_time",
        status: "active",
        version: 1,
      });
      // The lunch has no score of its own: the client gave the venue 8/10.
      await ctx.db.insert("venueNotes", {
        tenantId: TENANT,
        venueId,
        eventId: lunch,
        authorPersonId: personId,
        authorName: "Sam Rep",
        category: "client_feedback",
        content: "Loved it",
        visibility: "internal",
        rating: 8,
        postedAt: START + 3 * DAY,
        deletedAt: null,
        version: 1,
      });
      return { lasagna, gala, lunch, later, theirs };
    });

    await owner.mutation(api.mutations.Dish_markSignature, {
      docId: ids.lasagna,
      version: 1,
      isSignatureDish: true,
    });
    await expect(
      owner.mutation(api.mutations.Event_recordClientRating, {
        docId: ids.gala,
        version: 1,
        rating: 6,
      }),
    ).rejects.toThrow(/1 to 5/);
    await owner.mutation(api.mutations.Event_recordClientRating, {
      docId: ids.gala,
      version: 1,
      rating: 5,
      note: "Best wedding food we have had",
    });
    const gala = await owner.run((ctx) => ctx.db.get(ids.gala));
    expect(gala?.clientRating).toBe(5);
    expect(gala?.clientRatingNote).toBe("Best wedding food we have had");
    expect(gala?.clientRatedAt).toEqual(expect.any(Number));

    const window = { from: START, to: START + 30 * DAY };
    const result = (await owner.query(
      api.scorecardEventScores.forWindow,
      window,
    )) as { rows: Row[]; capped: boolean };
    const byId = new Map(result.rows.map((row) => [row.eventId, row]));
    expect(result.rows).toHaveLength(2);
    // Lasagna and its drop-off version are signature; the removed line is not counted.
    expect(byId.get(ids.gala)).toMatchObject({
      clientRating: 5,
      menuLines: 3,
      signatureLines: 2,
    });
    expect(byId.get(ids.lunch)).toMatchObject({
      clientRating: 4,
      menuLines: 1,
      signatureLines: 0,
    });

    // Clearing the score leaves the event with none.
    await owner.mutation(api.mutations.Event_recordClientRating, {
      docId: ids.gala,
      version: 2,
    });
    const cleared = await owner.run((ctx) => ctx.db.get(ids.gala));
    expect(cleared?.clientRating ?? null).toBeNull();
    expect(cleared?.clientRatedAt ?? null).toBeNull();

    // Another company sees only its own event, with nothing on it.
    const theirs = (await outsider.query(
      api.scorecardEventScores.forWindow,
      window,
    )) as { rows: Row[] };
    expect(theirs.rows.map((row) => row.eventId)).toEqual([ids.theirs]);
    expect(theirs.rows[0]).toMatchObject({
      clientRating: null,
      menuLines: 0,
      signatureLines: 0,
    });
  });
});
