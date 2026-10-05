/**
 * Runtime proof (AC-133 PR10-03, AC-541 BE-13-reservations): two events race
 * for the last warmer through the one reservation transaction. Exactly one
 * wins; the loser is refused with the conflicting event, its dates and the
 * amount it holds, where the warmer is kept, and the ways out (other
 * equipment, move one, rent one). Out-of-service equipment refuses a new
 * booking, and a warmer that went out and is late coming back still holds its
 * unit for the next event until someone checks it in.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";

const M = api.mutations;
const TENANT = "tenant-ac133-race";
const HOUR = 3600_000;
const DAY = 24 * HOUR;

beforeAll(() => {
  process.env.CONVEX_FIELD_ENCRYPTION_KEY ||=
    "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
});

function setup() {
  const proof = createManifestTestContext({
    convexTest: convexTest as never,
    schema,
    modules,
  });
  const as = (subject: string, role: string) =>
    proof.asRole({ subject, role, tenantId: TENANT });
  const logistics = as("logistics-ac133", "logistics_manager");
  const sales = as("sales-ac133", "sales_manager");
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
      expectedHeadcount: 80,
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
    });
  const holds = async (equipmentId: string) =>
    (
      (await logistics.run(async (ctx) =>
        ctx.db.query("equipmentReservations").collect(),
      )) as Array<{ equipmentId: string; eventId: string; status: string }>
    ).filter((row) => row.equipmentId === equipmentId);
  return { proof, logistics, run, event, reserve, holds };
}

describe("two events competing for the same equipment (AC-133, AC-541)", () => {
  it("two concurrent reservations for the last unit leave exactly one winner and the loser message names the conflicting window", async () => {
    const { logistics, run, event, reserve, holds } = setup();
    const startsAt = Date.UTC(2026, 10, 7, 15, 0);
    const endsAt = Date.UTC(2026, 10, 7, 23, 0);
    const warmer = await run(logistics, M.Equipment_createViaRegister, {
      name: "Hot box warmer",
      assetTag: "HB-1",
      category: "Warmers",
      ownership: "owned",
      quantity: 1,
      homeLocation: "Main kitchen cage",
    });
    const smith = await event("Smith wedding", startsAt, endsAt);
    const jones = await event("Jones gala", startsAt + HOUR, endsAt + HOUR);

    const results = await Promise.allSettled([
      reserve(warmer.docId, smith.docId, startsAt, endsAt, 1),
      reserve(warmer.docId, jones.docId, startsAt + HOUR, endsAt + HOUR, 1),
    ]);
    const won = results.filter((r) => r.status === "fulfilled");
    const lost = results.filter(
      (r): r is PromiseRejectedResult => r.status === "rejected",
    );
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(1);

    const rows = await holds(warmer.docId);
    expect(rows).toHaveLength(1);
    const winner =
      rows[0]!.eventId === smith.docId ? "Smith wedding" : "Jones gala";
    const message = String(lost[0]!.reason?.data ?? lost[0]!.reason?.message);
    expect(message).toContain(
      "Hot box warmer has 0 free for that time and you asked for 1.",
    );
    expect(message).toContain(`Already booked: ${winner}, Nov 7, 1 held.`);
    expect(message).toContain("Kept at Main kitchen cage.");
    expect(message).toMatch(
      /Pick other equipment, move one from another place, rent it from a vendor/,
    );

    // The office sees the same conflict before trying: the loser's event reads
    // 0 free with the winner's window and amount.
    const loserId = winner === "Smith wedding" ? jones.docId : smith.docId;
    const view = (await logistics.query(
      api.equipmentCheckout.equipmentAvailability,
      { eventId: loserId as never, startsAt, endsAt: endsAt + HOUR },
    )) as Array<Record<string, any>>;
    const line = view.find((row) => row.equipmentId === warmer.docId)!;
    expect(line).toMatchObject({
      free: 0,
      quantity: 1,
      condition: "good",
      location: "Main kitchen cage",
      blocked: null,
    });
    expect(line.conflicts).toEqual([
      expect.objectContaining({
        eventTitle: winner,
        quantity: 1,
        overdue: false,
      }),
    ]);
    // The winner's own hold never counts against the winner.
    const winnerId = loserId === jones.docId ? smith.docId : jones.docId;
    const own = (await logistics.query(
      api.equipmentCheckout.equipmentAvailability,
      { eventId: winnerId as never, startsAt, endsAt: endsAt + HOUR },
    )) as Array<Record<string, any>>;
    expect(own.find((row) => row.equipmentId === warmer.docId)).toMatchObject({
      free: 1,
      conflicts: [],
    });
  });

  it("out-of-service equipment refuses a new booking and a late return still holds its unit", async () => {
    const { logistics, run, event, reserve, holds } = setup();
    const broken = await run(logistics, M.Equipment_createViaRegister, {
      name: "Chafing dish",
      assetTag: "CD-7",
      category: "Serving",
      ownership: "owned",
      quantity: 4,
    });
    await run(logistics, M.Equipment_updateCondition, {
      docId: broken.docId,
      condition: "out_of_service",
      note: "Cracked water pan",
    });
    const now = Date.now();
    const later = await event(
      "Later party",
      now + 2 * DAY,
      now + 2 * DAY + 6 * HOUR,
    );
    await expect(
      reserve(
        broken.docId,
        later.docId,
        now + 2 * DAY,
        now + 2 * DAY + 6 * HOUR,
        1,
      ),
    ).rejects.toThrow(
      /Chafing dish is marked out of service, so it can't be booked/,
    );
    expect(await holds(broken.docId)).toHaveLength(0);

    // Back in service once fixed: the booking goes through.
    await run(logistics, M.Equipment_updateCondition, {
      docId: broken.docId,
      condition: "good",
    });
    await reserve(
      broken.docId,
      later.docId,
      now + 2 * DAY,
      now + 2 * DAY + 6 * HOUR,
      1,
    );

    // A generator that went out yesterday and was due back an hour ago is
    // still out: tomorrow's party cannot book it until it is checked in.
    const generator = await run(logistics, M.Equipment_createViaRegister, {
      name: "Generator",
      assetTag: "GEN-1",
      category: "Power",
      ownership: "owned",
      quantity: 1,
    });
    const past = await event("Yesterday picnic", now - DAY, now - HOUR);
    await reserve(generator.docId, past.docId, now - DAY, now - HOUR, 1);
    const [hold] = (await holds(generator.docId)) as unknown as Array<{
      _id: string;
      version: number;
    }>;
    await run(logistics, M.EquipmentReservation_checkOut, {
      docId: hold!._id,
      condition: "good",
    });
    const tomorrow = await event(
      "Tomorrow brunch",
      now + DAY,
      now + DAY + 4 * HOUR,
    );
    await expect(
      reserve(
        generator.docId,
        tomorrow.docId,
        now + DAY,
        now + DAY + 4 * HOUR,
        1,
      ),
    ).rejects.toThrow(
      /Yesterday picnic, still out and late coming back, 1 held/,
    );

    const checkedOut = (await logistics.run(async (ctx) =>
      ctx.db.get(hold!._id as never),
    )) as { version: number };
    await run(logistics, M.EquipmentReservation_markReturned, {
      docId: hold!._id,
      version: checkedOut.version,
      condition: "good",
    });
    await reserve(
      generator.docId,
      tomorrow.docId,
      now + DAY,
      now + DAY + 4 * HOUR,
      1,
    );
  });
});
