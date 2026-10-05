/**
 * Runtime proof (AC-542, PL-DELIVERY, spec §13.3): putting a truck or trailer
 * on an event checks it can go out and is free for the run's window. A truck
 * in the shop or a trailer out of service is refused; a truck already out for
 * another live event at that time is refused with the clashing event and
 * window named; nothing is saved on a refusal; a truck on another day, or on a
 * cancelled event, is free.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  ENDS_AT,
  SERVE_AT,
  stubTimingEnv,
  timingWorld,
} from "./timing-rules.runtime.helpers";

beforeEach(() => {
  stubTimingEnv();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

const M = api.mutations;
const DAY = 24 * 60 * 60_000;

describe("vehicle assignment conflicts (AC-542)", () => {
  it("a booked vehicle is refused with the clashing window and a maintained vehicle is refused", async () => {
    const { t, owner, event } = await timingWorld();
    const register = async (
      registration: string,
      operationalStatus = "available",
    ) =>
      (
        (await owner.mutation(M.Vehicle_createViaRegister, {
          make: "Isuzu",
          model: "NPR",
          registration,
          ownership: "owned",
          payloadCapacityKg: 3000,
          operationalStatus,
        })) as { docId: Id<"vehicles"> }
      ).docId;
    const trailer = async (registration: string, operationalStatus: string) =>
      (
        (await owner.mutation(M.Trailer_createViaRegister, {
          make: "Wells Cargo",
          model: "Fast Trac",
          registration,
          payloadCapacityKg: 1500,
          operationalStatus,
        })) as { docId: Id<"trailers"> }
      ).docId;
    const client = (await owner.mutation(M.Client_createViaRegister, {
      clientType: "company",
      companyName: "Second Client Co",
    })) as { docId: string };
    const newEvent = async (title: string, startsAt: number, endsAt: number) =>
      (
        (await owner.mutation(M.Event_createViaPlanEngagement, {
          clientId: client.docId,
          title,
          eventType: "catering",
          startsAt,
          endsAt,
          expectedHeadcount: 40,
          primaryContactName: "Sam Second",
          budgetAmount: 2000,
          quotedPrice: 2000,
        })) as { docId: Id<"events"> }
      ).docId;
    const assign = (eventId: Id<"events">, args: Record<string, unknown>) =>
      owner.mutation(M.EventVehicleAssignment_createViaAssign, {
        eventId,
        ...args,
      }) as Promise<{ docId: Id<"eventVehicleAssignments"> }>;
    const rows = () =>
      t.run((ctx) => ctx.db.query("eventVehicleAssignments").collect());

    // In the shop: refused, nothing saved.
    const shopTruck = await register("SHOP-1", "maintenance");
    await expect(assign(event, { vehicleId: shopTruck })).rejects.toThrow(
      /SHOP-1 is in the shop for maintenance/,
    );
    const brokenTrailer = await trailer("TRL-9", "out_of_service");
    await expect(assign(event, { trailerId: brokenTrailer })).rejects.toThrow(
      /TRL-9 is out of service/,
    );
    expect(await rows()).toEqual([]);

    // Booked on the gala, then asked for an overlapping event: refused with
    // the gala named and its window.
    const truck = await register("TRUCK-1");
    await assign(event, { vehicleId: truck });
    const overlapping = await newEvent(
      "Overlapping lunch",
      SERVE_AT - 60 * 60_000,
      ENDS_AT - 60 * 60_000,
    );
    await expect(assign(overlapping, { vehicleId: truck })).rejects.toThrow(
      /TRUCK-1 is already out for Timing proof gala, .+ to .+\. Give this run other times/,
    );
    expect((await rows()).filter((row) => row.eventId === overlapping)).toEqual(
      [],
    );

    // The next day the truck is free.
    const nextDay = await newEvent(
      "Next day brunch",
      SERVE_AT + DAY,
      ENDS_AT + DAY,
    );
    await expect(assign(nextDay, { vehicleId: truck })).resolves.toBeDefined();

    // A cancelled event gives its truck back: the gala is cancelled, the
    // overlapping lunch can now have it.
    const gala = (await t.run((ctx) => ctx.db.get(event)))!;
    await owner.mutation(M.Event_cancel, {
      docId: event,
      version: gala.version,
      reason: "Client called it off",
    });
    await expect(
      assign(overlapping, { vehicleId: truck }),
    ).resolves.toBeDefined();
  });
});
