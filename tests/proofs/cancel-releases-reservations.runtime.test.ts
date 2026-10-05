/**
 * Runtime proof (AC-544 BE-13-cancel-release): cancelling an event frees what
 * has not happened yet - future equipment bookings and shifts nobody started -
 * and keeps what already happened: a shift in progress, equipment that went
 * out, and a pack list that already left on the truck.
 */
import { beforeAll, describe, expect, it } from "vitest";
import type { Doc } from "../../convex/_generated/dataModel";
import {
  ensureEncryptionKey,
  HOUR,
  M,
  returnsHarness,
  SAT,
} from "./equipment-returns.runtime.helpers";

beforeAll(ensureEncryptionKey);

describe("cancel releases future work (AC-544)", () => {
  it("cancelling an event releases its unstarted shifts and equipment reservations, keeps worked shifts and dispatched movement", async () => {
    const tenantId = "tenant-ac544-cancel";
    const h = returnsHarness(tenantId);
    const workforce = h.as("workforce", "workforce_manager");
    const wedding = await h.event("Saturday wedding", SAT, SAT + 8 * HOUR);
    await h.run(h.events, M.Event_configureTiming, {
      docId: wedding.docId,
      version: (await h.read(wedding.docId)).version,
      serviceStartsAt: SAT,
      setupMinutes: 120,
      loadMinutes: 60,
      outboundTravelMinutes: 30,
      cleanupMinutes: 60,
      returnTravelMinutes: 30,
      unloadMinutes: 30,
    });

    const hire = async (name: string) => {
      const subject = `${tenantId}-${name.toLowerCase()}`;
      const person = await h.run(workforce, M.Person_createViaHire, {
        givenName: name,
        familyName: "Crew",
        email: `${name.toLowerCase()}@ac544.example`,
        role: "event_staff",
        employmentType: "part_time",
        authSubjectId: subject,
      });
      await h.run(workforce, M.EventAssignment_createViaAssign, {
        eventId: wedding.docId,
        personId: person.docId,
        role: "Server",
      });
      const shift = (await h.all("shifts")).find(
        (row) => row.personId === person.docId && row.status !== "cancelled",
      ) as Doc<"shifts">;
      return {
        shift,
        self: h.proof.asRole({ subject, role: "event_staff", tenantId }),
      };
    };
    const ann = await hire("Ann");
    const ben = await hire("Ben");
    expect(ann.shift).toBeDefined();
    expect(ben.shift).toBeDefined();
    // Ben has started work.
    await h.run(ben.self, M.Shift_start, {
      docId: ben.shift._id,
      version: (await h.read(ben.shift._id)).version,
    });
    const benStarted = await h.read(ben.shift._id);

    // Equipment: one booking still in the warehouse, one already out on the
    // truck that left.
    const pack = await h.run(h.manager, M.PackList_createViaOpen, {
      eventId: wedding.docId,
      name: "Truck 1",
    });
    const chafers = await h.equipment("Round chafer", 6);
    const linens = await h.equipment("White linen", 40);
    const outHold = await h.reserve(
      h.manager,
      chafers.docId,
      wedding.docId,
      SAT,
      SAT + 8 * HOUR,
      6,
    );
    const step = async (cmd: unknown, id: string, args: object = {}) =>
      h.run(h.manager, cmd, {
        docId: id,
        version: (await h.read(id)).version,
        ...args,
      });
    const pull = (await h.all("packListItems")).find(
      (row) =>
        row.packListId === pack.docId && row.description === "Round chafer",
    )!;
    await step(M.PackList_startPacking, pack.docId);
    await step(M.PackListItem_markPacked, pull._id, { packedQuantity: 6 });
    await step(M.PackList_markPacked, pack.docId);
    await step(M.PackList_markLoaded, pack.docId);
    await step(M.PackList_dispatch, pack.docId);
    const futureHold = await h.reserve(
      h.manager,
      linens.docId,
      wedding.docId,
      SAT,
      SAT + 8 * HOUR,
      40,
    );
    expect(await h.read(outHold.equipmentReservationId)).toMatchObject({
      status: "checked_out",
    });

    await h.run(h.events, M.Event_cancel, {
      docId: wedding.docId,
      version: (await h.read(wedding.docId)).version,
      reason: "Client postponed",
    });

    // Released: the future booking and the shift nobody started.
    expect(await h.read(futureHold.equipmentReservationId)).toMatchObject({
      status: "cancelled",
      cancellationReason: "Client postponed",
    });
    expect((await h.read(ann.shift._id)).status).toBe("cancelled");
    // Kept: work in progress, gear that went out, the truck that left.
    const benAfter = await h.read(ben.shift._id);
    expect(benAfter.status).toBe(benStarted.status);
    expect(benAfter.status).not.toBe("cancelled");
    expect(await h.read(outHold.equipmentReservationId)).toMatchObject({
      status: "checked_out",
    });
    expect(await h.read(pack.docId)).toMatchObject({ status: "dispatched" });
    expect(
      await h.availability(
        wedding.docId,
        SAT + 24 * HOUR,
        SAT + 30 * HOUR,
        linens.docId,
      ),
    ).toMatchObject({ free: 40 });
  });
});
