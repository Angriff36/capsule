/**
 * Runtime proof (PL-PACK-RULES): AC-538 identical items from several
 * sources merge into one line that keeps every source, while a different
 * owner stays a separate line; AC-534 equipment held for the event becomes
 * pull-sheet lines with owner and return duty.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import { S } from "./pack-quantity-override-survival.runtime.helpers";
import {
  addDish,
  createPlannedEvent,
  defineRule,
  harness,
  line,
  openPackList,
  packLines,
  rolesFor,
  runner,
  sources,
  version,
} from "./pack-rules.runtime.helpers";

const M = api.mutations;

beforeAll(() => {
  process.env.CONVEX_FIELD_ENCRYPTION_KEY ||=
    "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
});

describe("runtime proof: merged pack lines and pull sheet", () => {
  it("two dishes sharing one container stay one line and removing one dish subtracts only its servings (AC-538)", async () => {
    const proof = harness();
    const tenantId = "tenant-pack-combine";
    const roles = rolesFor(proof, tenantId);
    const { eventId } = await createPlannedEvent(proof, tenantId, "Combine");
    const chicken = await addDish(proof, tenantId, eventId, "Chicken", 40);
    const beef = await addDish(proof, tenantId, eventId, "Beef", 20);
    for (const dish of [chicken, beef])
      await defineRule(proof, tenantId, {
        trigger: "dish",
        dishId: dish.dishId,
        description: "Half hotel pan",
        category: "holding",
        scaleBy: "servings",
        perUnits: 10,
        baseQuantity: 0,
      });
    await defineRule(proof, tenantId, {
      trigger: "guest_count",
      description: "Half hotel pan",
      category: "holding",
      baseQuantity: 2,
      ownership: "rented",
      returnNote: "Party Rentals pick up Monday",
    });
    const packListId = await openPackList(
      proof,
      tenantId,
      eventId,
      "Combine list",
    );
    let lines = await packLines(roles.owner, tenantId, packListId);
    const pans = lines.filter((row) => row.description === "Half hotel pan");
    expect(pans).toHaveLength(2);
    const ours = pans.find((row) => row.ownership === "owned")!;
    const rented = pans.find((row) => row.ownership === "rented")!;
    expect(ours.requiredQuantity).toBe(6);
    expect(
      sources(ours)
        .map((s) => [s.sourceId, s.quantity])
        .sort(),
    ).toEqual(
      [
        [beef.eventDishId, 2],
        [chicken.eventDishId, 4],
      ].sort(),
    );
    expect(rented.requiredQuantity).toBe(2);
    expect(rented.returnNote).toBe("Party Rentals pick up Monday");

    await runner(proof, roles.events)(M.EventDish_remove, {
      docId: beef.eventDishId,
      reason: "Dropped from the menu",
      version: await version(roles.owner, beef.eventDishId),
    });
    lines = await packLines(roles.owner, tenantId, packListId);
    const after = lines.find((row) => row._id === ours._id)!;
    expect(after.requiredQuantity).toBe(4);
    expect(sources(after).map((s) => s.sourceId)).toEqual([
      chicken.eventDishId,
    ]);
    expect(
      lines.filter((row) => row.description === "Half hotel pan"),
    ).toHaveLength(2);
  });

  it("an outside-rental plan produces pull-sheet lines marked rented with return responsibility (AC-534)", async () => {
    const proof = harness();
    const tenantId = "tenant-pack-rental-pull";
    const roles = rolesFor(proof, tenantId);
    const { eventId } = await createPlannedEvent(
      proof,
      tenantId,
      "Rental pull sheet",
    );
    const run = runner(proof, roles.logistics);
    const chargers = await run(M.Equipment_createViaRegister, {
      name: "Gold charger",
      assetTag: "GC-100",
      category: "place_setting",
      ownership: "rented",
      quantity: 120,
    });
    const chafers = await run(M.Equipment_createViaRegister, {
      name: "Round chafer",
      assetTag: "CH-10",
      category: "holding",
      ownership: "owned",
      quantity: 10,
    });
    const packListId = await openPackList(
      proof,
      tenantId,
      eventId,
      "Pull sheet",
    );
    const reserve = (equipmentId: string, quantity: number) =>
      proof.executeCommand(roles.logistics, api.equipmentCheckout.reserve, {
        equipmentId,
        eventId,
        startsAt: S.startsAt,
        endsAt: S.endsAt,
        quantity,
      } as never) as Promise<{ equipmentReservationId: string }>;
    const held = await reserve(chargers.docId, 40);
    await reserve(chafers.docId, 4);

    let lines = await packLines(roles.owner, tenantId, packListId);
    expect(line(lines, "Gold charger")).toMatchObject({
      requiredQuantity: 40,
      ownership: "rented",
      returnRequired: true,
      returnNote: "Goes back to the rental company",
      category: "rental",
    });
    expect(sources(line(lines, "Gold charger"))[0]).toMatchObject({
      sourceType: "rental",
      sourceId: held.equipmentReservationId,
    });
    expect(line(lines, "Round chafer")).toMatchObject({
      requiredQuantity: 4,
      ownership: "owned",
      returnRequired: true,
      returnNote: "Comes back to the warehouse",
    });

    await run(M.EquipmentReservation_cancel, {
      docId: held.equipmentReservationId,
      reason: "Client brings their own",
      version: await version(roles.owner, held.equipmentReservationId),
    });
    lines = await packLines(roles.owner, tenantId, packListId);
    expect(line(lines, "Gold charger").retiredAt).toEqual(expect.any(Number));
    expect(line(lines, "Round chafer").requiredQuantity).toBe(4);
  });
});
