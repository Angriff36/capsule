/**
 * Runtime proof (AC-429, PL-ROUTE-LEGS, spec §8.4 multiple legs). One event
 * holds several runs: the main crew, a truck that drops early and comes back
 * for a second, later run, and an outside vendor's drop. Crew ride a truck,
 * meet at the venue, or go with the main crew. Every window comes from the
 * same event timing, so moving serve time moves them all; the same truck
 * cannot be on two runs at once.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  ENDS_AT,
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

describe("multiple legs (AC-429)", () => {
  it("two vehicles with different depart windows derive from the same milestones", async () => {
    const { t, owner, event } = await timingWorld({
      policy: { briefingMinutes: 15 },
      safetyBufferMinutes: 10,
    });
    const timing = (serviceStartsAt: number) =>
      owner.mutation(M.Event_configureTiming, {
        docId: event,
        serviceStartsAt,
        setupMinutes: 180,
        loadMinutes: 60,
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
    const version = async (id: Id<"eventVehicleAssignments">) =>
      (await t.run((ctx) => ctx.db.get(id)))!.version;
    const planLeg = async (
      id: Id<"eventVehicleAssignments">,
      leg: Record<string, number>,
    ) =>
      owner.mutation(M.EventVehicleAssignment_planLeg, {
        docId: id,
        version: await version(id),
        ...leg,
      });

    const mainRun = await assign({ vehicleId: truckA });
    // Truck B drops the tent gear early and comes back...
    const dropRun = await assign({ vehicleId: truckB });
    await planLeg(dropRun, {
      arriveBeforeServeMinutes: 240,
      leaveAfterMinutes: 30,
    });
    // ...then makes a second, later run with a shorter load.
    const secondRun = await assign({ vehicleId: truckB });
    await planLeg(secondRun, { arriveBeforeServeMinutes: 90, loadMinutes: 30 });
    const vendor = await assign({ vendorName: "Harbor Party Rentals" });
    await planLeg(vendor, { arriveBeforeServeMinutes: 300 });

    const legsAt = async () =>
      (await owner.query(api.eventRouteLegs.getEventRouteLegs, {
        eventId: event,
      }))!;
    const expectLegs = async (S: number, E: number) => {
      const { legs, conflicts } = await legsAt();
      const leg = (id: string) => legs.find((row) => row.id === id)!;
      expect(conflicts).toEqual([]);
      // Main crew and truck A: on site 180 before serve, 30 drive + 10 safety,
      // 60 load, 15 briefing.
      for (const id of ["main", String(mainRun)]) {
        expect(leg(id)).toMatchObject({
          arriveAt: S - 180 * MIN,
          departShopAt: S - 220 * MIN,
          loadStartAt: S - 280 * MIN,
          staffOnAt: S - 295 * MIN,
          departVenueAt: E + 60 * MIN,
          returnShopAt: E + 90 * MIN,
          staffOffAt: E + 120 * MIN,
        });
      }
      expect(leg(String(dropRun))).toMatchObject({
        label: "TRUCK-B",
        arriveAt: S - 240 * MIN,
        departShopAt: S - 280 * MIN,
        loadStartAt: S - 340 * MIN,
        departVenueAt: S - 210 * MIN,
        returnShopAt: S - 180 * MIN,
      });
      expect(leg(String(secondRun))).toMatchObject({
        arriveAt: S - 90 * MIN,
        departShopAt: S - 130 * MIN,
        loadStartAt: S - 160 * MIN,
        staffOnAt: S - 175 * MIN,
        staffOffAt: E + 120 * MIN,
      });
      // The two trucks leave the kitchen at different times.
      expect(leg(String(mainRun)).departShopAt).not.toBe(
        leg(String(secondRun)).departShopAt,
      );
      expect(leg(String(vendor))).toMatchObject({
        kind: "vendor",
        label: "Harbor Party Rentals",
        arriveAt: S - 300 * MIN,
        departShopAt: null,
        staffOnAt: null,
      });
    };
    await expectLegs(SERVE_AT, ENDS_AT);

    // Crew: Drew rides the second truck run, Eli meets at the venue, Fran
    // goes with the main crew.
    const hire = async (givenName: string) =>
      (
        (await owner.mutation(M.Person_createViaHire, {
          givenName,
          familyName: "Crew",
          email: `${givenName.toLowerCase()}.legs@proof.example`,
          role: "event_staff",
          employmentType: "part_time",
        })) as { docId: Id<"people"> }
      ).docId;
    const crew = {
      drew: await hire("Drew"),
      eli: await hire("Eli"),
      fran: await hire("Fran"),
    };
    const assignment: Record<string, Id<"eventAssignments">> = {};
    for (const [name, personId] of Object.entries(crew)) {
      assignment[name] = (
        (await owner.mutation(M.EventAssignment_createViaAssign, {
          eventId: event,
          personId,
          role: "Server",
        })) as { docId: Id<"eventAssignments"> }
      ).docId;
    }
    const assignmentVersion = async (name: string) =>
      (await t.run((ctx) => ctx.db.get(assignment[name])))!.version;
    await owner.mutation(M.EventAssignment_chooseTravelLeg, {
      docId: assignment.drew,
      version: await assignmentVersion("drew"),
      rideVehicleAssignmentId: secondRun,
    });
    await owner.mutation(M.EventAssignment_chooseTravelLeg, {
      docId: assignment.eli,
      version: await assignmentVersion("eli"),
      meetsAtVenue: true,
    });
    await settle(t);
    const shiftOf = async (personId: Id<"people">) =>
      (
        await t.run((ctx) =>
          ctx.db
            .query("shifts")
            .withIndex("by_personId", (q) => q.eq("personId", personId))
            .collect(),
        )
      ).filter((row) => row.status === "scheduled");
    const expectShifts = async (S: number, E: number) => {
      expect(await shiftOf(crew.drew)).toMatchObject([
        { startsAt: S - 175 * MIN, endsAt: E + 120 * MIN },
      ]);
      expect(await shiftOf(crew.eli)).toMatchObject([
        { startsAt: S - 180 * MIN, endsAt: E + 60 * MIN },
      ]);
      expect(await shiftOf(crew.fran)).toMatchObject([
        { startsAt: S - 295 * MIN, endsAt: E + 120 * MIN },
      ]);
    };
    await expectShifts(SERVE_AT, ENDS_AT);

    // Serve moves an hour later: every run and every shift moves with it.
    const later = SERVE_AT + 60 * MIN;
    await timing(later);
    await settle(t);
    await expectLegs(later, ENDS_AT);
    await expectShifts(later, ENDS_AT);

    // The second run planned too early would need truck B while it is still
    // out on the drop: shown as a clash, not hidden.
    await planLeg(secondRun, {
      arriveBeforeServeMinutes: 200,
      loadMinutes: 30,
    });
    const clash = await legsAt();
    expect(clash.conflicts).toHaveLength(1);
    expect(clash.conflicts[0].legIds.sort()).toEqual(
      [String(dropRun), String(secondRun)].sort(),
    );
    expect(clash.conflicts[0].message).toContain("same truck");

    // Truck B's second run is released: Drew goes back to the main crew.
    await owner.mutation(M.EventVehicleAssignment_release, {
      docId: secondRun,
      version: await version(secondRun),
    });
    await settle(t);
    expect(await shiftOf(crew.drew)).toMatchObject([
      { startsAt: later - 295 * MIN, endsAt: ENDS_AT + 120 * MIN },
    ]);
  });

  it("a person cannot ride a truck that is not on the event", async () => {
    const { t, owner, event } = await timingWorld();
    const outside = await t.run((ctx) =>
      ctx.db.insert("eventVehicleAssignments", {
        tenantId: "another-workspace",
        eventId: event,
        activeEventId: String(event),
        vendorName: "Elsewhere",
        assignedAt: Date.now(),
        version: 1,
      }),
    );
    const person = (await owner.mutation(M.Person_createViaHire, {
      givenName: "Gil",
      familyName: "Crew",
      email: "gil.legs@proof.example",
      role: "event_staff",
      employmentType: "part_time",
    })) as { docId: Id<"people"> };
    const row = (await owner.mutation(M.EventAssignment_createViaAssign, {
      eventId: event,
      personId: person.docId,
      role: "Server",
    })) as { docId: Id<"eventAssignments"> };
    const version = (await t.run((ctx) => ctx.db.get(row.docId)))!.version;
    // Another workspace's row is refused before anything is saved.
    await expect(
      owner.mutation(M.EventAssignment_chooseTravelLeg, {
        docId: row.docId,
        version,
        rideVehicleAssignmentId: outside,
      }),
    ).rejects.toThrow();
    // A truck already taken off this event cannot be ridden either.
    const truck = (await owner.mutation(M.Vehicle_createViaRegister, {
      make: "Isuzu",
      model: "NPR",
      registration: "TRUCK-OFF",
      ownership: "owned",
      payloadCapacityKg: 3000,
      operationalStatus: "available",
    })) as { docId: Id<"vehicles"> };
    const rig = (await owner.mutation(
      M.EventVehicleAssignment_createViaAssign,
      {
        eventId: event,
        vehicleId: truck.docId,
      },
    )) as { docId: Id<"eventVehicleAssignments"> };
    await owner.mutation(M.EventVehicleAssignment_release, {
      docId: rig.docId,
      version: (await t.run((ctx) => ctx.db.get(rig.docId)))!.version,
    });
    await expect(
      owner.mutation(M.EventAssignment_chooseTravelLeg, {
        docId: row.docId,
        version,
        rideVehicleAssignmentId: rig.docId,
      }),
    ).rejects.toThrow(/truck on this event/);
    const saved = await t.run((ctx) => ctx.db.get(row.docId));
    expect(saved!.rideVehicleAssignmentId ?? null).toBeNull();
  });
});
