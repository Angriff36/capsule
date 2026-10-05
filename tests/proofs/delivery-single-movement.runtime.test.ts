/**
 * Runtime proof (AC-135, PL-DELIVERY, PR10-05): loading and dispatch record
 * who did it, when and where the load went; the delivery records who drove
 * off, who handed it over and who at the venue took it; a delivery problem
 * stays on the event. A repeated pack, schedule, dispatch or departure makes
 * one delivery and one departure, never a second.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  ENDS_AT,
  SERVE_AT,
  settle,
  stubTimingEnv,
  TIMING_TENANT,
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

describe("delivery single movement (AC-135)", () => {
  it("a replayed schedule/dispatch creates one delivery and one transit record and loaded stamp names the loader", async () => {
    // A delivery is the Drop Off service style (#377).
    const { t, owner, plannerActor, plannerId, event } = await timingWorld({
      style: "Drop Off",
    });
    const driver = (
      (await owner.mutation(M.Person_createViaHire, {
        givenName: "Dana",
        familyName: "Driver",
        email: "dana.driver@proof.example",
        role: "driver",
        employmentType: "part_time",
        authSubjectId: "timing-driver",
      })) as { docId: Id<"people"> }
    ).docId;
    const driverActor = t.withIdentity({
      subject: "timing-driver",
      org_id: TIMING_TENANT,
      role: "driver",
    });
    const version = async (
      id: Id<"packLists"> | Id<"packListItems"> | Id<"deliveries">,
    ) => (await t.run((ctx) => ctx.db.get(id)))!.version;

    const pack = (
      (await owner.mutation(M.PackList_createViaOpen, {
        eventId: event,
        name: "Main load",
      })) as { docId: Id<"packLists"> }
    ).docId;
    const item = (
      (await owner.mutation(M.PackListItem_createViaAddItem, {
        packListId: pack,
        description: "Chafers",
        requiredQuantity: 4,
        unit: "each",
      })) as { docId: Id<"packListItems"> }
    ).docId;
    await owner.mutation(M.PackList_startPacking, {
      docId: pack,
      version: await version(pack),
    });
    await owner.mutation(M.PackListItem_markPacked, {
      docId: item,
      version: await version(item),
      packedQuantity: 4,
    });
    await owner.mutation(M.PackList_markPacked, {
      docId: pack,
      version: await version(pack),
    });
    // A repack after a late change packs the list again: still one delivery.
    await owner.mutation(M.PackList_acknowledgePackingRequirement, {
      docId: pack,
      version: await version(pack),
      additionalRequired: true,
    });
    await owner.mutation(M.PackList_markPacked, {
      docId: pack,
      version: await version(pack),
    });
    await settle(t);
    const deliveries = () =>
      t.run(async (ctx) =>
        (await ctx.db.query("deliveries").collect()).filter(
          (row) => row.packListId === pack,
        ),
      );
    expect(await deliveries()).toHaveLength(1);
    const deliveryId = (await deliveries())[0]._id;

    // Scheduling again (the driver is added; the same call sent twice) keeps
    // the one delivery and its destination.
    const schedule = {
      docId: deliveryId,
      packListId: pack,
      eventId: event,
      destination: "ignored: keeps the event's venue",
      windowStartsAt: SERVE_AT - 3 * 60 * 60_000,
      windowEndsAt: SERVE_AT - 2 * 60 * 60_000,
      driverId: driver,
      idempotencyKey: "schedule-driver-1",
    };
    const first = await owner.mutation(M.Delivery_schedule, {
      ...schedule,
      version: await version(deliveryId),
    });
    const again = await owner.mutation(M.Delivery_schedule, {
      ...schedule,
      version: await version(deliveryId),
    });
    expect(again).toEqual(first);
    expect(await deliveries()).toHaveLength(1);
    expect((await deliveries())[0]).toMatchObject({
      driverId: driver,
      destination: "1 Harbor Way, Portland ME, US",
    });

    // Loading names the loader; dispatch names who sent it and where to.
    await plannerActor.mutation(M.PackList_markLoaded, {
      docId: pack,
      version: await version(pack),
    });
    const dispatch = {
      docId: pack,
      version: await version(pack),
      idempotencyKey: "dispatch-main-load",
    };
    const sent = await plannerActor.mutation(M.PackList_dispatch, dispatch);
    const resent = await plannerActor.mutation(M.PackList_dispatch, dispatch);
    expect(resent).toEqual(sent);
    const list = (await t.run((ctx) => ctx.db.get(pack)))!;
    expect(list).toMatchObject({
      status: "dispatched",
      loadedByPersonId: plannerId,
      dispatchedByPersonId: plannerId,
      dispatchDestination: "1 Harbor Way, Portland ME, US",
    });
    expect(list.loadedAt).toEqual(expect.any(Number));
    expect(list.dispatchedAt).toEqual(expect.any(Number));
    // A new dispatch (not a replay) of a list already out is refused.
    await expect(
      plannerActor.mutation(M.PackList_dispatch, {
        docId: pack,
        version: await version(pack),
      }),
    ).rejects.toThrow();
    const dispatchedEvents = await t.run(async (ctx) =>
      (await ctx.db.query("manifestEvents").collect()).filter(
        (row) => row.type === "PackListDispatched" && row.entityId === pack,
      ),
    );
    expect(dispatchedEvents).toHaveLength(1);

    // The driver leaves once, even when the button is pressed twice.
    const depart = {
      docId: deliveryId,
      version: await version(deliveryId),
      idempotencyKey: "depart-1",
    };
    await driverActor.mutation(M.Delivery_startTransit, depart);
    const departedAt = (await deliveries())[0].departedAt;
    vi.advanceTimersByTime(60_000);
    await driverActor.mutation(M.Delivery_startTransit, depart);
    const transitEvents = await t.run(async (ctx) =>
      (await ctx.db.query("manifestEvents").collect()).filter(
        (row) => row.type === "DeliveryTransitStarted",
      ),
    );
    expect(transitEvents).toHaveLength(1);
    expect((await deliveries())[0]).toMatchObject({
      status: "in_transit",
      departedAt,
      departedByPersonId: driver,
    });

    await driverActor.mutation(M.Delivery_confirmDelivery, {
      docId: deliveryId,
      version: await version(deliveryId),
      receivedByName: "  Jo at the front desk ",
      note: "Left in the kitchen",
    });
    expect((await deliveries())[0]).toMatchObject({
      status: "delivered",
      deliveredByPersonId: driver,
      receivedByName: "Jo at the front desk",
      deliveryNote: "Left in the kitchen",
    });
    expect(await deliveries()).toHaveLength(1);

    // A delivery problem stays on its event, with the reporter's profile.
    const incident = (await plannerActor.mutation(M.Incident_createViaReport, {
      eventId: event,
      severity: "medium",
      category: "equipment",
      description: "One chafer lid dented on the way",
      deliveryId,
    })) as { docId: Id<"incidents"> };
    expect(await t.run((ctx) => ctx.db.get(incident.docId))).toMatchObject({
      eventId: event,
      deliveryId,
      reportedByPersonId: plannerId,
    });
    const client = (await owner.mutation(M.Client_createViaRegister, {
      clientType: "company",
      companyName: "Other Client",
    })) as { docId: string };
    const other = (await owner.mutation(M.Event_createViaPlanEngagement, {
      clientId: client.docId,
      title: "Other party",
      eventType: "catering",
      startsAt: SERVE_AT,
      endsAt: ENDS_AT,
      expectedHeadcount: 20,
      primaryContactName: "Olly Other",
      budgetAmount: 1000,
      quotedPrice: 1000,
    })) as { docId: Id<"events"> };
    await expect(
      plannerActor.mutation(M.Incident_createViaReport, {
        eventId: other.docId,
        severity: "low",
        category: "equipment",
        description: "Wrong event",
        deliveryId,
      }),
    ).rejects.toThrow(/That delivery is for another event/);
  });
});
