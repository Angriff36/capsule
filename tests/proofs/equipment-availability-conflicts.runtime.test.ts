/**
 * Runtime proof (AC-341 CF-11.3): availability counts overlapping bulk holds,
 * items still out, maintenance (out of service) and lost units.
 *
 * 100 linens: Saturday's wedding holds 60, Saturday's gala overlaps and can
 * only get the other 40; a Sunday brunch that does not overlap gets all 100.
 * A warmer that breaks after it was booked cannot be checked out. Linens come
 * back from the wedding 3 short: those 3 leave the count, so Sunday can no
 * longer hold 100. Moving the linens to the second kitchen is a recorded move
 * and the availability read shows the new place.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";

const M = api.mutations;
const TENANT = "tenant-ac341-availability";
const HOUR = 3600_000;
const SAT = Date.UTC(2026, 10, 14, 16, 0);
const SUN = Date.UTC(2026, 10, 15, 10, 0);

beforeAll(() => {
  process.env.CONVEX_FIELD_ENCRYPTION_KEY ||=
    "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
});

describe("equipment availability (AC-341)", () => {
  it("overlapping bulk reservations reduce availability and an out-of-service asset cannot check out", async () => {
    const proof = createManifestTestContext({
      convexTest: convexTest as never,
      schema,
      modules,
    });
    const as = (subject: string, role: string) =>
      proof.asRole({ subject, role, tenantId: TENANT });
    const logistics = as("logistics-ac341", "logistics_manager");
    const sales = as("sales-ac341", "sales_manager");
    const run = (actor: typeof sales, cmd: unknown, args: object) =>
      proof.executeCommand(actor, cmd as never, args as never) as Promise<{
        docId: string;
      }>;
    const event = async (title: string, startsAt: number, endsAt: number) => {
      const client = await run(sales, M.Client_createViaRegister, {
        clientType: "company",
        companyName: `${title} client`,
      });
      return run(sales, M.Event_createViaPlanEngagement, {
        clientId: client.docId,
        title,
        eventType: "wedding",
        startsAt,
        endsAt,
        expectedHeadcount: 100,
        primaryContactName: "Riley Host",
        budgetAmount: 5000,
        quotedPrice: 7000,
      });
    };
    const reserve = (
      equipmentId: string,
      eventId: string,
      startsAt: number,
      endsAt: number,
      quantity: number,
    ) =>
      logistics.mutation(api.equipmentCheckout.reserve, {
        equipmentId: equipmentId as never,
        eventId: eventId as never,
        startsAt,
        endsAt,
        quantity,
      }) as Promise<{ equipmentReservationId: string }>;
    const read = async (id: string) =>
      (await logistics.run(async (ctx) => ctx.db.get(id as never))) as Record<
        string,
        any
      >;
    const availability = async (
      eventId: string,
      startsAt: number,
      endsAt: number,
      equipmentId: string,
    ) =>
      (
        (await logistics.query(api.equipmentCheckout.equipmentAvailability, {
          eventId: eventId as never,
          startsAt,
          endsAt,
        })) as Array<Record<string, any>>
      ).find((row) => row.equipmentId === equipmentId)!;

    const linens = await run(logistics, M.Equipment_createViaRegister, {
      name: "White linen 120in",
      assetTag: "LIN-120",
      category: "Linens",
      ownership: "owned",
      quantity: 100,
      trackingMode: "bulk",
      homeLocation: "Main kitchen",
    });
    const wedding = await event("Saturday wedding", SAT, SAT + 8 * HOUR);
    const gala = await event("Saturday gala", SAT + 2 * HOUR, SAT + 10 * HOUR);
    const brunch = await event("Sunday brunch", SUN, SUN + 4 * HOUR);

    // Overlapping bulk holds share the 100.
    const weddingHold = await reserve(
      linens.docId,
      wedding.docId,
      SAT,
      SAT + 8 * HOUR,
      60,
    );
    expect(
      await availability(
        gala.docId,
        SAT + 2 * HOUR,
        SAT + 10 * HOUR,
        linens.docId,
      ),
    ).toMatchObject({ quantity: 100, free: 40 });
    await expect(
      reserve(linens.docId, gala.docId, SAT + 2 * HOUR, SAT + 10 * HOUR, 41),
    ).rejects.toThrow(/has 40 free for that time and you asked for 41/);
    await reserve(
      linens.docId,
      gala.docId,
      SAT + 2 * HOUR,
      SAT + 10 * HOUR,
      40,
    );
    // Sunday does not overlap either hold.
    expect(
      await availability(brunch.docId, SUN, SUN + 4 * HOUR, linens.docId),
    ).toMatchObject({ free: 100, conflicts: [] });

    // Out of service after booking: the checkout is refused.
    const warmer = await run(logistics, M.Equipment_createViaRegister, {
      name: "Hot box warmer",
      assetTag: "HB-2",
      category: "Warmers",
      ownership: "owned",
      quantity: 1,
    });
    const warmerHold = await reserve(
      warmer.docId,
      wedding.docId,
      SAT,
      SAT + 8 * HOUR,
      1,
    );
    await run(logistics, M.Equipment_updateCondition, {
      docId: warmer.docId,
      condition: "out_of_service",
      note: "Door latch broken",
    });
    await expect(
      run(logistics, M.EquipmentReservation_checkOut, {
        docId: warmerHold.equipmentReservationId,
        condition: "good",
      }),
    ).rejects.toThrow(/marked out of service, so it can't be checked out/);
    expect(await read(warmerHold.equipmentReservationId)).toMatchObject({
      status: "reserved",
    });
    expect(
      await availability(brunch.docId, SUN, SUN + 4 * HOUR, warmer.docId),
    ).toMatchObject({ blocked: "out_of_service", condition: "out_of_service" });

    // Linens go out and come back 3 short: 97 left to book.
    await run(logistics, M.EquipmentReservation_checkOut, {
      docId: weddingHold.equipmentReservationId,
      condition: "good",
    });
    const out = await read(weddingHold.equipmentReservationId);
    await expect(
      run(logistics, M.EquipmentReservation_markReturned, {
        docId: weddingHold.equipmentReservationId,
        version: out.version,
        condition: "good",
        missingQuantity: 61,
      }),
    ).rejects.toThrow(/between zero and the amount that went out/);
    await run(logistics, M.EquipmentReservation_markReturned, {
      docId: weddingHold.equipmentReservationId,
      version: out.version,
      condition: "fair",
      note: "Three left at the venue",
      missingQuantity: 3,
    });
    expect(await read(weddingHold.equipmentReservationId)).toMatchObject({
      status: "returned",
      missingQuantity: 3,
      returnNote: "Three left at the venue",
    });
    expect(await read(linens.docId)).toMatchObject({
      quantity: 97,
      condition: "fair",
    });
    await expect(
      reserve(linens.docId, brunch.docId, SUN, SUN + 4 * HOUR, 100),
    ).rejects.toThrow(/has 97 free for that time/);

    // A move to the second kitchen is recorded and shown.
    await run(logistics, M.Equipment_transfer, {
      docId: linens.docId,
      toLocation: "Second kitchen",
      note: "For Sunday",
    });
    expect(
      await availability(brunch.docId, SUN, SUN + 4 * HOUR, linens.docId),
    ).toMatchObject({ location: "Second kitchen", free: 97 });
    const moves = (await logistics.run(async (ctx) =>
      ctx.db.query("manifestEvents").collect(),
    )) as Array<{ type: string; payload: Record<string, unknown> }>;
    expect(
      moves.find((row) => row.type === "EquipmentTransferred")?.payload,
    ).toMatchObject({
      fromLocation: "Main kitchen",
      toLocation: "Second kitchen",
      note: "For Sunday",
    });
    await expect(
      run(logistics, M.Equipment_transfer, {
        docId: linens.docId,
        toLocation: "  ",
      }),
    ).rejects.toThrow(/Say where the equipment is going/);
  });
});
