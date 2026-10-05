/**
 * Runtime proof (PL-SCALE, AC-172): the month tracker's pack lists, open
 * questions, trucks and event numbers (convex/eventMonthRows.ts) come only
 * from the asked events, live rows only, never from another company, under
 * the staff read rule of the generated lists. Pack list notes stay out.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const TENANT = "tenant-event-month-rows";
const OTHER = "tenant-event-month-rows-other";

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

type Rows = {
  packLists: { name: string; notes?: unknown }[];
  reviewFlags: { question: string }[];
  vehicleAssignments: { eventId: string; isPreloaded: boolean }[];
  numberAssignments: { eventNumber: string }[];
};

describe("runtime proof: month tracker rows stay with the asked events (AC-172)", () => {
  it("returns the asked events' live rows, inside the company", async () => {
    const proof = createManifestTestContext({
      convexTest: convexTest as never,
      schema,
      modules,
    });
    const owner = proof.asRole({
      subject: "month-rows-owner",
      role: "owner",
      tenantId: TENANT,
    });
    const outsider = proof.asRole({
      subject: "month-rows-outsider",
      role: "owner",
      tenantId: OTHER,
    });

    const ids = await owner.run(async (ctx) => {
      const event = async (title: string) =>
        (await ctx.db.insert("events", {
          tenantId: TENANT,
          title,
          eventType: "dinner",
          stage: "planning",
          version: 1,
        })) as Id<"events">;
      const shown = await event("Shown wedding");
      const other = await event("Next month gala");
      for (const [eventId, name, deletedAt] of [
        [shown, "Hot line", null],
        [shown, "Old list", 1],
        [other, "Gala list", null],
      ] as const)
        await ctx.db.insert("packLists", {
          tenantId: TENANT,
          eventId,
          name,
          notes: "secret",
          status: "draft",
          deletedAt,
          version: 1,
        });
      for (const [eventId, question] of [
        [shown, "Who brings ice?"],
        [other, "Gala question"],
      ] as const)
        await ctx.db.insert("reviewFlags", {
          tenantId: TENANT,
          eventId,
          targetKind: "whole_event",
          targetLabel: "Event",
          question,
          status: "open",
          version: 1,
        });
      await ctx.db.insert("eventVehicleAssignments", {
        tenantId: TENANT,
        eventId: shown,
        assignedAt: 1,
        preloadedAt: 2,
        version: 1,
      });
      await ctx.db.insert("eventVehicleAssignments", {
        tenantId: TENANT,
        eventId: other,
        assignedAt: 1,
        version: 1,
      });
      await ctx.db.insert("eventNumberAssignments", {
        tenantId: TENANT,
        eventId: shown,
        eventNumber: "6014",
      });
      await ctx.db.insert("eventNumberAssignments", {
        tenantId: TENANT,
        eventId: other,
        eventNumber: "6015",
      });
      return { shown, other };
    });

    const rows = (await owner.query(api.eventMonthRows.forEvents, {
      eventIds: [ids.shown, ids.shown, "not-an-id"],
    })) as Rows;
    expect(rows.packLists.map((r) => r.name)).toEqual(["Hot line"]);
    expect(rows.packLists[0]).not.toHaveProperty("notes");
    expect(rows.reviewFlags.map((r) => r.question)).toEqual([
      "Who brings ice?",
    ]);
    expect(rows.vehicleAssignments).toEqual([
      expect.objectContaining({ eventId: ids.shown, isPreloaded: true }),
    ]);
    expect(rows.numberAssignments.map((r) => r.eventNumber)).toEqual(["6014"]);

    // Another company reads none of our events' rows.
    const theirs = (await outsider.query(api.eventMonthRows.forEvents, {
      eventIds: [ids.shown, ids.other],
    })) as Rows;
    for (const list of Object.values(theirs)) expect(list).toEqual([]);
  });
});
