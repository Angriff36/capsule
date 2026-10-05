/**
 * Runtime proof (PL-SCALE, AC-172): menu lines for a few events or one dish
 * (convex/eventMenuLookup.ts) come through the event and dish indexes, as
 * plain rows, live ones only, and never from another company. These reads
 * replace the generated every-event menu list on the kitchen board, prep
 * board, allergen matrix, dish page and My day.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const TENANT = "tenant-menu-lookup";
const OTHER = "tenant-menu-lookup-other";

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

type Line = { _id: string; eventId: string; dishId: string; dish?: unknown };

describe("runtime proof: menu lines by event or dish stay in the company (AC-172)", () => {
  it("returns the asked events' or dish's live lines only", async () => {
    const proof = createManifestTestContext({
      convexTest: convexTest as never,
      schema,
      modules,
    });
    const owner = proof.asRole({
      subject: "menu-lookup-owner",
      role: "owner",
      tenantId: TENANT,
    });
    const outsider = proof.asRole({
      subject: "menu-lookup-outsider",
      role: "owner",
      tenantId: OTHER,
    });

    const ids = await owner.run(async (ctx) => {
      const dish = async (tenantId: string, name: string) =>
        (await ctx.db.insert("dishes", {
          tenantId,
          name,
          portionSize: 1,
          portionUnit: "each",
          status: "active",
          version: 1,
        })) as Id<"dishes">;
      const event = async (tenantId: string, title: string) =>
        (await ctx.db.insert("events", {
          tenantId,
          title,
          eventType: "dinner",
          stage: "planning",
          version: 1,
        })) as Id<"events">;
      const line = async (
        tenantId: string,
        eventId: Id<"events">,
        dishId: Id<"dishes">,
        deleted = false,
      ) =>
        (await ctx.db.insert("eventDishes", {
          tenantId,
          eventId,
          dishId,
          quantityServings: 50,
          deletedAt: deleted ? 1 : null,
          version: 1,
        })) as Id<"eventDishes">;
      const salmon = await dish(TENANT, "Salmon");
      const salad = await dish(TENANT, "Salad");
      const gala = await event(TENANT, "Gala");
      const lunch = await event(TENANT, "Lunch");
      const other = await event(TENANT, "Not asked for");
      const galaSalmon = await line(TENANT, gala, salmon);
      const galaSalad = await line(TENANT, gala, salad);
      const lunchSalmon = await line(TENANT, lunch, salmon);
      await line(TENANT, lunch, salad, true);
      const otherSalmon = await line(TENANT, other, salmon);
      // Another company's event and dish.
      const theirDish = await dish(OTHER, "Their dish");
      const theirEvent = await event(OTHER, "Their event");
      await line(OTHER, theirEvent, theirDish);
      return {
        salmon,
        gala,
        lunch,
        theirEvent,
        theirDish,
        galaSalmon,
        galaSalad,
        lunchSalmon,
        otherSalmon,
      };
    });

    const two = (await owner.query(api.eventMenuLookup.forEvents, {
      eventIds: [ids.gala, ids.lunch, ids.gala, "not-an-id"],
    })) as Line[];
    expect(two.map((l) => l._id).sort()).toEqual(
      [ids.galaSalmon, ids.galaSalad, ids.lunchSalmon].sort(),
    );
    // Plain rows: no recipe tree is read or sent.
    expect(two.every((l) => l.dish === undefined)).toBe(true);

    const salmonLines = (await owner.query(api.eventMenuLookup.forDish, {
      dishId: ids.salmon,
    })) as Line[];
    expect(salmonLines.map((l) => l._id).sort()).toEqual(
      [ids.galaSalmon, ids.lunchSalmon, ids.otherSalmon].sort(),
    );

    // Another company: asking for our ids gives nothing; theirs stay theirs.
    expect(
      await outsider.query(api.eventMenuLookup.forEvents, {
        eventIds: [ids.gala, ids.lunch],
      }),
    ).toEqual([]);
    expect(
      await outsider.query(api.eventMenuLookup.forDish, { dishId: ids.salmon }),
    ).toEqual([]);
    expect(
      await owner.query(api.eventMenuLookup.forEvents, {
        eventIds: [ids.theirEvent],
      }),
    ).toEqual([]);
    expect(
      await owner.query(api.eventMenuLookup.forDish, { dishId: ids.theirDish }),
    ).toEqual([]);
  });
});
