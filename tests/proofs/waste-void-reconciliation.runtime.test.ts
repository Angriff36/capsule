/**
 * Runtime proof (AC-335 CF-10.4): a waste entry keeps ingredient, amount,
 * unit, reason, cost, event, location, notes, time and WHO recorded it;
 * voiding needs a reason, records who voided it, restores the stock once,
 * and the event food-cost roll-up leaves the voided entry out.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { EventFoodCost } from "../../convex/lib/culinaryModel/eventFoodCost";
import {
  captureCloseout,
  finalizeCloseout,
} from "./plan-vs-fact-finalized-closeout.runtime.helpers";
import {
  closeOut,
  FOOD,
  harness,
  runner,
  seedCostedEvent,
  type Proof,
} from "./event-food-cost.runtime.helpers";

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

async function linkedStaff(
  proof: Proof,
  tenantId: string,
  subject: string,
  role: string,
) {
  const actor = proof.asRole({ subject, role, tenantId });
  const personId = (await actor.run((ctx) =>
    ctx.db.insert("people", {
      tenantId,
      givenName: "Proof",
      familyName: subject,
      email: `${subject}@example.test`,
      role,
      employmentType: "full_time",
      status: "active",
      authSubjectId: subject,
      version: 1,
    } as never),
  )) as unknown as string;
  return { actor, personId };
}

type WasteRow = {
  status: string;
  quantity: number;
  unit: string;
  reason: string;
  unitCost: number;
  eventId: string;
  locationId: string;
  notes: string;
  recordedAt: number;
  recordedById: string;
  voidedById?: string;
  voidReason?: string;
};

describe("waste void reconciliation", () => {
  it("voiding restores on-hand stock, requires a reason, and the event cost roll-up excludes voided waste", async () => {
    const proof = harness();
    const tenantId = "tenant-waste-void-reconciliation";
    const seed = await seedCostedEvent(proof, tenantId);
    const eventId = seed.event.docId as Id<"events">;
    const staff = await linkedStaff(
      proof,
      tenantId,
      `waste-staff-${tenantId}`,
      "inventory_staff",
    );
    const manager = await linkedStaff(
      proof,
      tenantId,
      `waste-manager-${tenantId}`,
      "inventory_manager",
    );
    const store = runner(proof, staff.actor);
    const location = await store(
      api.mutations.StorageLocation_createViaRegister,
      { name: "Waste void walk-in", locationType: "cold" },
    );
    const item = await store(api.mutations.InventoryItem_createViaOpen, {
      ingredientId: seed.butter.docId,
      locationId: location.docId,
      unit: "pound",
      quantityOnHand: 30,
    });
    const onHand = async () =>
      Number(
        (
          (await staff.actor.run((ctx) =>
            ctx.db.get(item.docId as never),
          )) as never as { quantityOnHand: number }
        ).quantityOnHand,
      );
    const record = (quantity: number) =>
      store(api.mutations.WasteRecord_createViaRecord, {
        ingredientId: seed.butter.docId,
        locationId: location.docId,
        inventoryItemId: item.docId,
        eventId,
        quantity,
        unit: "pound",
        reason: "spoilage",
        unitCost: FOOD.butterPrice,
        notes: "Cooler door left open",
      });
    await record(2);
    const mistake = await record(5);
    expect(await onHand()).toBe(23);

    const kept = (await staff.actor.run((ctx) =>
      ctx.db.get(mistake.docId as never),
    )) as never as WasteRow;
    expect(kept).toMatchObject({
      status: "recorded",
      quantity: 5,
      unit: "pound",
      reason: "spoilage",
      unitCost: FOOD.butterPrice,
      eventId,
      locationId: location.docId,
      notes: "Cooler door left open",
      recordedById: staff.personId,
    });
    expect(kept.recordedAt).toEqual(expect.any(Number));

    // No reason, no void; the stock is untouched.
    const voidAs = runner(proof, manager.actor);
    await expect(
      voidAs(api.mutations.WasteRecord_voidRecord, {
        docId: mistake.docId,
        reason: "  ",
      }),
    ).rejects.toThrow("Say why you're voiding this.");
    expect(await onHand()).toBe(23);

    await voidAs(api.mutations.WasteRecord_voidRecord, {
      docId: mistake.docId,
      reason: "Counted the same crate twice",
    });
    expect(await onHand()).toBe(28);
    const voided = (await staff.actor.run((ctx) =>
      ctx.db.get(mistake.docId as never),
    )) as never as WasteRow;
    expect(voided).toMatchObject({
      status: "voided",
      voidReason: "Counted the same crate twice",
      voidedById: manager.personId,
    });

    // The event roll-up counts only the 2 lb still recorded. A finalized
    // closeout is the event's frozen result, so the books are closed with
    // the waste the records hold (the voided entry left out).
    const closeoutId = await closeOut(proof, tenantId, eventId);
    const waste = 2 * FOOD.butterPrice;
    const total = 800 + waste + 900 + 200;
    await captureCloseout(proof, tenantId, closeoutId, eventId, {
      actualWasteCost: waste,
      totalActualCost: total,
      costVariance: 3000 - total,
      grossProfit: 4500 - total,
    });
    await finalizeCloseout(proof, tenantId, closeoutId, 2);
    const report = (await seed.roles.finance.query(
      api.culinaryDemand.eventFoodCostReport,
      { eventId },
    )) as EventFoodCost;
    expect(report.actual?.wasteCost).toBe(2 * FOOD.butterPrice);
  });
});
