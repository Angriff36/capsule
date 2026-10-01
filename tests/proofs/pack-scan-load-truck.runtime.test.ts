/**
 * Runtime proof (review 2026-10-01T03:45Z, reason 2): a load scan with
 * "Truck being loaded" picked puts a line that is on no truck yet on that
 * truck in the same step as the count. Left out, a line keeps its truck.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
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

describe("load scan with a picked truck", () => {
  it("puts an unassigned line on the picked truck and saves the count together", async () => {
    const { t, owner, event } = await timingWorld();
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
    const rig = async (vehicleId: Id<"vehicles">) =>
      (
        (await owner.mutation(M.EventVehicleAssignment_createViaAssign, {
          eventId: event,
          vehicleId,
        })) as { docId: Id<"eventVehicleAssignments"> }
      ).docId;
    const runA = await rig(await truck("TRUCK-A"));
    const runB = await rig(await truck("TRUCK-B"));

    const pack = (
      (await owner.mutation(M.PackList_createViaOpen, {
        eventId: event,
        name: "Main load",
      })) as { docId: Id<"packLists"> }
    ).docId;
    const line = async (description: string) =>
      (
        (await owner.mutation(M.PackListItem_createViaAddItem, {
          packListId: pack,
          description,
          requiredQuantity: 2,
          unit: "each",
        })) as { docId: Id<"packListItems"> }
      ).docId;
    const row = (id: Id<"packListItems">) => t.run((ctx) => ctx.db.get(id));
    await owner.mutation(M.PackList_startPacking, {
      docId: pack,
      version: (await t.run((ctx) => ctx.db.get(pack)))!.version,
    });
    const packed = async (id: Id<"packListItems">) =>
      owner.mutation(M.PackListItem_markPacked, {
        docId: id,
        version: (await row(id))!.version,
        packedQuantity: 2,
      });

    const cords = await line("Extension cords");
    const tent = await line("Tent sidewalls");
    await packed(cords);
    await packed(tent);
    await owner.mutation(M.PackListItem_assignLoad, {
      docId: tent,
      version: (await row(tent))!.version,
      loadAssignmentId: runA,
    });
    await settle(t);

    // Cords are on no truck; the loader picked truck B.
    expect((await row(cords))!.loadAssignmentId ?? null).toBeNull();
    await owner.mutation(M.PackListItem_recordLoaded, {
      docId: cords,
      version: (await row(cords))!.version,
      loadedQuantity: 1,
      loadAssignmentId: runB,
    });
    expect(await row(cords)).toMatchObject({
      loadedQuantity: 1,
      loadAssignmentId: runB,
    });

    // No truck picked: the tent keeps truck A.
    await owner.mutation(M.PackListItem_recordLoaded, {
      docId: tent,
      version: (await row(tent))!.version,
      loadedQuantity: 2,
    });
    expect(await row(tent)).toMatchObject({
      loadedQuantity: 2,
      loadAssignmentId: runA,
    });

    // A truck that is off the event is refused, and nothing is saved.
    await t.run((ctx) => ctx.db.patch(runA, { deletedAt: Date.now() }));
    const before = await row(cords);
    await expect(
      owner.mutation(M.PackListItem_recordLoaded, {
        docId: cords,
        version: before!.version,
        loadedQuantity: 2,
        loadAssignmentId: runA,
      }),
    ).rejects.toThrow(/not on this event/);
    expect(await row(cords)).toMatchObject({
      loadedQuantity: 1,
      loadAssignmentId: runB,
    });
  });
});
