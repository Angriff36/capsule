/**
 * Runtime proof (AC-535, PL-DELIVERY, spec §13.2 timeline/transport facts):
 * each pack line carries the truck it rides on, which trip of that truck, the
 * loading zone, the load / leave / arrive times from the event timeline, and
 * for food the time it is out of the kitchen before serve (flagged over four
 * hours). A line not placed on a truck says so. Moving serve time moves them.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  MIN,
  SERVE_AT,
  settle,
  stubTimingEnv,
  timingWorld,
} from "./timing-rules.runtime.helpers";

beforeEach(() => {
  stubTimingEnv();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

const M = api.mutations;

describe("pack line transport facts (AC-535)", () => {
  it("pack lines resolve an assigned vehicle and trip grouping from the timeline", async () => {
    const { t, owner, event } = await timingWorld();
    const timing = (serviceStartsAt: number) =>
      owner.mutation(M.Event_configureTiming, {
        docId: event,
        serviceStartsAt,
        setupMinutes: 120,
        loadMinutes: 45,
        outboundTravelMinutes: 30,
        cleanupMinutes: 60,
        returnTravelMinutes: 30,
        unloadMinutes: 30,
      });
    await timing(SERVE_AT);
    await settle(t);

    const truck = async (registration: string) =>
      (
        (await owner.mutation(M.Vehicle_createViaRegister, {
          make: "Isuzu",
          model: "NPR",
          registration,
          ownership: "owned",
          payloadCapacityKg: 3000,
          operationalStatus: "available",
        })) as { docId: Id<"vehicles"> }
      ).docId;
    const truckA = await truck("TRUCK-A");
    const truckB = await truck("TRUCK-B");
    const assign = async (args: Record<string, unknown>) =>
      (
        (await owner.mutation(M.EventVehicleAssignment_createViaAssign, {
          eventId: event,
          ...args,
        })) as { docId: Id<"eventVehicleAssignments"> }
      ).docId;
    const mainRun = await assign({ vehicleId: truckA, loadingZone: "Dock 1" });
    // Truck B drops the rentals early, comes back, then takes a second trip.
    const dropRun = await assign({
      vehicleId: truckB,
      arriveBeforeServeMinutes: 300,
      leaveAfterMinutes: 30,
      loadingZone: "Back lot",
    });
    const secondTrip = await assign({
      vehicleId: truckB,
      arriveBeforeServeMinutes: 90,
      loadMinutes: 30,
    });
    await owner.mutation(M.EventVehicleAssignment_setLoadingZone, {
      docId: secondTrip,
      version: (await t.run((ctx) => ctx.db.get(secondTrip)))!.version,
      loadingZone: "Dock 2",
    });

    const dish = (await owner.mutation(M.Dish_createViaIntroduce, {
      name: "Short rib",
      portionSize: 1,
      portionUnit: "serving",
    })) as { docId: Id<"dishes"> };
    const pack = (
      (await owner.mutation(M.PackList_createViaOpen, {
        eventId: event,
        name: "Main load",
      })) as { docId: Id<"packLists"> }
    ).docId;
    const line = async (description: string, dishId?: Id<"dishes">) =>
      (
        (await owner.mutation(M.PackListItem_createViaAddItem, {
          packListId: pack,
          description,
          requiredQuantity: 2,
          unit: "each",
          ...(dishId ? { dishId } : {}),
        })) as { docId: Id<"packListItems"> }
      ).docId;
    const place = async (
      id: Id<"packListItems">,
      loadAssignmentId: Id<"eventVehicleAssignments">,
    ) =>
      owner.mutation(M.PackListItem_assignLoad, {
        docId: id,
        version: (await t.run((ctx) => ctx.db.get(id)))!.version,
        loadAssignmentId,
      });
    const ribOnMain = await line("Short rib hotel pans", dish.docId);
    const ribOnDrop = await line("Short rib, early drop", dish.docId);
    const tent = await line("Tent sidewalls");
    const loose = await line("Extension cords");
    await place(ribOnMain, mainRun);
    await place(ribOnDrop, dropRun);
    await place(tent, secondTrip);
    await settle(t);

    const factsAt = async () => {
      const transport = (await owner.query(
        api.eventRouteLegs.getEventTransport,
        { eventId: event },
      ))!;
      return (id: Id<"packListItems">) =>
        transport.lines.find((row) => row.lineId === String(id))!;
    };
    const expectFacts = async (S: number) => {
      const fact = await factsAt();
      // Main truck: on site 120 before serve, leaves 30 drive + 15 safety
      // earlier, loads 45 before that. Food is out 165 min: no warning.
      expect(fact(ribOnMain)).toMatchObject({
        rigLabel: "TRUCK-A",
        trip: 1,
        loadingZone: "Dock 1",
        loadStartAt: S - 210 * MIN,
        departAt: S - 165 * MIN,
        arriveAt: S - 120 * MIN,
        holdFrom: S - 165 * MIN,
        holdUntil: S,
        holdWarning: null,
      });
      // Early drop on truck B, trip 1: food out 345 min, flagged.
      expect(fact(ribOnDrop)).toMatchObject({
        rigLabel: "TRUCK-B",
        trip: 1,
        loadingZone: "Back lot",
        departAt: S - 345 * MIN,
        holdFrom: S - 345 * MIN,
      });
      expect(fact(ribOnDrop).holdWarning).toMatch(/more than 4 hours/);
      // Truck B's second trip; not food, so no hold window.
      expect(fact(tent)).toMatchObject({
        rigLabel: "TRUCK-B",
        trip: 2,
        loadingZone: "Dock 2",
        arriveAt: S - 90 * MIN,
        holdFrom: null,
        holdWarning: null,
      });
      expect(fact(loose)).toMatchObject({
        rigLabel: null,
        trip: null,
        note: "Not on a truck yet.",
      });
    };
    await expectFacts(SERVE_AT);

    // Serve an hour later: every line's times move with it.
    await timing(SERVE_AT + 60 * MIN);
    await settle(t);
    await expectFacts(SERVE_AT + 60 * MIN);
  });
});
