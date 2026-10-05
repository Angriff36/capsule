/**
 * Runtime proof (AC-550, PL-DELIVERY, spec §13.3 route stops): a trailer on a
 * truck that cannot pull one is refused; a pack line placed on a truck, or a
 * weight set on it, that takes the load past what the truck can carry is
 * refused with the numbers; each stop of a run names its crew (driver and
 * riders) and its window, and a run with no one on it says so.
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

describe("route capacity and stop crew (AC-550)", () => {
  it("an overweight or incompatible assignment is refused and each stop names its crew", async () => {
    const { t, owner, event } = await timingWorld();
    await owner.mutation(M.Event_configureTiming, {
      docId: event,
      serviceStartsAt: SERVE_AT,
      setupMinutes: 120,
      loadMinutes: 45,
      outboundTravelMinutes: 30,
      cleanupMinutes: 60,
      returnTravelMinutes: 30,
      unloadMinutes: 30,
    });
    await settle(t);

    const vehicle = async (registration: string, payloadCapacityKg: number) =>
      (
        (await owner.mutation(M.Vehicle_createViaRegister, {
          make: "Ford",
          model: "Transit",
          registration,
          ownership: "owned",
          payloadCapacityKg,
          operationalStatus: "available",
        })) as { docId: Id<"vehicles"> }
      ).docId;
    const version = async (id: Id<"vehicles"> | Id<"packListItems">) =>
      (await t.run((ctx) => ctx.db.get(id)))!.version;
    const van = await vehicle("VAN-1", 500);
    const smallVan = await vehicle("VAN-2", 800);
    await owner.mutation(M.Vehicle_setTowCapacity, {
      docId: smallVan,
      version: await version(smallVan),
      towCapacityKg: 0,
    });
    const trailer = (
      (await owner.mutation(M.Trailer_createViaRegister, {
        make: "Wells Cargo",
        model: "Fast Trac",
        registration: "TRL-1",
        payloadCapacityKg: 1500,
        operationalStatus: "available",
      })) as { docId: Id<"trailers"> }
    ).docId;

    // Incompatible: a van that cannot pull a trailer, with a trailer.
    await expect(
      owner.mutation(M.EventVehicleAssignment_createViaAssign, {
        eventId: event,
        vehicleId: smallVan,
        trailerId: trailer,
      }),
    ).rejects.toThrow(/VAN-2 cannot pull a trailer/);

    const hire = async (givenName: string, role: string) =>
      (
        (await owner.mutation(M.Person_createViaHire, {
          givenName,
          familyName: "Road",
          email: `${givenName.toLowerCase()}.road@proof.example`,
          role,
          employmentType: "part_time",
        })) as { docId: Id<"people"> }
      ).docId;
    const dana = await hire("Dana", "driver");
    const drew = await hire("Drew", "event_staff");
    const vanRun = (
      (await owner.mutation(M.EventVehicleAssignment_createViaAssign, {
        eventId: event,
        vehicleId: van,
        driverId: dana,
        loadingZone: "Dock 2",
      })) as { docId: Id<"eventVehicleAssignments"> }
    ).docId;
    const emptyRun = (
      (await owner.mutation(M.EventVehicleAssignment_createViaAssign, {
        eventId: event,
        vehicleId: smallVan,
      })) as { docId: Id<"eventVehicleAssignments"> }
    ).docId;
    const ride = (
      (await owner.mutation(M.EventAssignment_createViaAssign, {
        eventId: event,
        personId: drew,
        role: "Server",
      })) as { docId: Id<"eventAssignments"> }
    ).docId;
    await owner.mutation(M.EventAssignment_chooseTravelLeg, {
      docId: ride,
      version: (await t.run((ctx) => ctx.db.get(ride)))!.version,
      rideVehicleAssignmentId: vanRun,
    });
    await settle(t);

    // Pack lines with weights: 20 chafers at 10 kg fit on the 500 kg van.
    const pack = (
      (await owner.mutation(M.PackList_createViaOpen, {
        eventId: event,
        name: "Main load",
      })) as { docId: Id<"packLists"> }
    ).docId;
    const line = async (description: string, requiredQuantity: number) =>
      (
        (await owner.mutation(M.PackListItem_createViaAddItem, {
          packListId: pack,
          description,
          requiredQuantity,
          unit: "each",
        })) as { docId: Id<"packListItems"> }
      ).docId;
    const chafers = await line("Chafers", 20);
    const tables = await line("Folding tables", 30);
    const setWeight = async (id: Id<"packListItems">, unitWeightKg: number) =>
      owner.mutation(M.PackListItem_setUnitWeight, {
        docId: id,
        version: await version(id),
        unitWeightKg,
      });
    const place = async (id: Id<"packListItems">) =>
      owner.mutation(M.PackListItem_assignLoad, {
        docId: id,
        version: await version(id),
        loadAssignmentId: vanRun,
      });
    await setWeight(chafers, 10);
    await setWeight(tables, 12);
    await place(chafers);

    // 30 tables at 12 kg = 360 kg more: 560 kg on a 500 kg van. Refused.
    await expect(place(tables)).rejects.toThrow(
      /VAN-1 can carry 500 kg; this load is 560 kg, 60 kg too much/,
    );
    expect(
      (await t.run((ctx) => ctx.db.get(tables)))!.loadAssignmentId ?? null,
    ).toBeNull();
    // Lighter tables fit; then a heavier weight on a line already on the van
    // is refused too.
    await setWeight(tables, 9);
    await place(tables);
    await expect(setWeight(tables, 11)).rejects.toThrow(
      /VAN-1 can carry 500 kg/,
    );

    const transport = (await owner.query(api.eventRouteLegs.getEventTransport, {
      eventId: event,
    }))!;
    expect(
      transport.rigLoads.find((rig) => rig.id === String(vanRun)),
    ).toMatchObject({ loadKg: 470, capacityKg: 500, overKg: 0, message: null });

    // Stops: the van's four stops name Dana (driver) and Drew (rider); the
    // empty van says no one is on it.
    const vanStops = transport.stops.filter(
      (stop) => stop.legId === String(vanRun),
    );
    expect(vanStops.map((stop) => stop.kind)).toEqual([
      "load",
      "drop",
      "pickup",
      "unload",
    ]);
    for (const stop of vanStops) {
      expect(stop.crew).toEqual(["Dana Road (driver)", "Drew Road"]);
      expect(stop.crewMissing).toBeNull();
    }
    // Load: 45 min before leaving; leaves 30 min drive + 15 safety before
    // arriving 120 min before serve.
    expect(vanStops[0]).toMatchObject({
      startsAt: SERVE_AT - (120 + 45 + 45) * MIN,
      endsAt: SERVE_AT - (120 + 45) * MIN,
    });
    expect(vanStops[1].startsAt).toBe(SERVE_AT - 120 * MIN);
    const emptyStops = transport.stops.filter(
      (stop) => stop.legId === String(emptyRun),
    );
    expect(emptyStops).toHaveLength(4);
    expect(emptyStops[0].crewMissing).toMatch(/No one is named for VAN-2/);
  });
});
