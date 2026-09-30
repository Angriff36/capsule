/**
 * Runtime proof (AC-466 BE-10.2): waste and void are traceable stock
 * adjustments. Recording waste with a stock item decrements the item once
 * (the WasteRecorded reaction), voiding it restores the amount once (the
 * WasteVoided reaction), and the item's audit log shows exactly those two
 * adjustments with their deltas — no second decrement, no silent write.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  harness,
  runner,
  type Proof,
  type Role,
} from "./headcount-prep-reconciliation.runtime.helpers";

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

type AuditEntry = {
  eventType: string;
  delta: number;
  reason: string;
  referenceId: string | null;
};

async function onHand(role: Role, itemId: string) {
  const item = (await role.run(async (ctx) =>
    ctx.db.get(itemId as never),
  )) as never as { quantityOnHand: number; version: number };
  return item;
}

describe("waste and void are traceable", () => {
  it("a waste record decrements stock once and its void restores it, both in the audit log", async () => {
    const proof = harness();
    const tenantId = "tenant-a";
    const kitchen = proof.asRole({
      subject: "waste-kitchen",
      role: "kitchen_manager",
      tenantId,
    });
    const inventory = proof.asRole({
      subject: "waste-inventory",
      role: "inventory_staff",
      tenantId,
    });
    const manager = proof.asRole({
      subject: "waste-inventory-manager",
      role: "inventory_manager",
      tenantId,
    });
    const ing = await runner(proof, kitchen)(
      api.mutations.Ingredient_createViaIntroduce,
      {
        name: "Waste trace ingredient",
        unit: "kilogram",
        costPerUnit: 4,
        allergens: [],
        category: "produce",
      },
    );
    const run = runner(proof, inventory);
    const loc = await run(api.mutations.StorageLocation_createViaRegister, {
      name: "Waste trace storage",
      locationType: "cold",
    });
    const item = await run(api.mutations.InventoryItem_createViaOpen, {
      ingredientId: ing.docId,
      locationId: loc.docId,
      unit: "kilogram",
      quantityOnHand: 20,
    });

    // Record 5 kg spoiled against the stock item: one decrement.
    const waste = await run(api.mutations.WasteRecord_createViaRecord, {
      ingredientId: ing.docId,
      locationId: loc.docId,
      inventoryItemId: item.docId,
      quantity: 5,
      unit: "kilogram",
      reason: "spoilage",
      unitCost: 4,
      notes: "Crate left out overnight",
    });

    const afterWaste = await onHand(inventory, item.docId);
    expect(Number(afterWaste.quantityOnHand)).toBe(15);

    // Voiding restores the amount once — an inventory manager's decision.
    await runner(proof, manager)(api.mutations.WasteRecord_voidRecord, {
      docId: waste.docId,
      version: 1,
      reason: "Recorded against the wrong crate",
    });
    const afterVoid = await onHand(inventory, item.docId);
    expect(Number(afterVoid.quantityOnHand)).toBe(20);

    // The item audit log shows exactly the two adjustments.
    const audit = (await (
      inventory as unknown as {
        action: (fn: unknown, args?: unknown) => Promise<unknown>;
      }
    ).action(api.inventoryAudit.listForItem, {
      inventoryItemId: item.docId,
    })) as AuditEntry[];
    const adjustments = audit.filter(
      (entry) => entry.eventType === "InventoryQuantityAdjusted",
    );
    expect(adjustments).toHaveLength(2);
    expect(adjustments.map((entry) => Number(entry.delta)).sort()).toEqual([
      -5, 5,
    ]);
    // The decrement says Waste; the restore carries the void reason.
    expect(adjustments.map((entry) => entry.reason)).toEqual([
      "Waste",
      "Recorded against the wrong crate",
    ]);
    // The waste row itself keeps the void trace.
    const wasteRow = (await inventory.run(async (ctx) =>
      ctx.db.get(waste.docId as never),
    )) as never as { status: string; voidReason: string; voidedAt: number };
    expect(wasteRow).toMatchObject({
      status: "voided",
      voidReason: "Recorded against the wrong crate",
    });
    expect(wasteRow.voidedAt ?? null).not.toBeNull();
  });
});
