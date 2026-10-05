// @vitest-environment edge-runtime
/**
 * AC-339 (CF-11.1): equipment inventory holds one-by-one pieces with a serial
 * and counted groups side by side, with category, amount, condition, active
 * state, home and current place, owned or rented, replacement value and
 * maintenance - and never touches food stock. A recount changes the amount
 * and leaves an audit event behind.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { api } from "../../../convex/_generated/api";
import schema from "../../../convex/schema";
import { modules } from "../../proofs/convex-test-modules";

const M = api.mutations;
const TENANT = "tenant-ac339-equipment";

beforeAll(() => {
  process.env.CONVEX_FIELD_ENCRYPTION_KEY ||=
    "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
});

type EquipmentRow = {
  _id: string;
  name: string;
  trackingMode?: string;
  serialNumber?: string;
  quantity: number;
  countUnit?: string;
  replacementCost?: number;
  customerPrice?: number;
  homeLocation?: string;
  ownership: string;
  condition: string;
  status: string;
  version: number;
};

describe("equipment register and recount (AC-339)", () => {
  it("registers a serialized asset and a pooled bulk line; recount adjusts quantity with an audit event", async () => {
    const proof = createManifestTestContext({
      convexTest: convexTest as never,
      schema,
      modules,
    });
    const staff = proof.asRole({
      subject: "inventory-ac339",
      role: "inventory_manager",
      tenantId: TENANT,
    });
    const run = (cmd: unknown, args: Record<string, unknown>) =>
      proof.executeCommand(staff, cmd as never, args as never) as Promise<{
        docId: string;
      }>;

    const warmer = await run(M.Equipment_createViaRegister, {
      name: "Hot box warmer",
      assetTag: "HB-01",
      category: "Holding",
      ownership: "owned",
      trackingMode: "serialized",
      serialNumber: "CS-88213",
      quantity: 1,
      purchaseValue: 1200,
      replacementCost: 1450,
      homeLocation: "Warehouse bay 2",
    });
    const chairs = await run(M.Equipment_createViaRegister, {
      name: "White folding chair",
      assetTag: "CH-POOL",
      category: "Furniture",
      ownership: "owned",
      trackingMode: "bulk",
      quantity: 200,
      countUnit: "each",
      replacementCost: 28,
      customerPrice: 4,
      homeLocation: "Warehouse rack C",
    });

    // A serial piece is one piece: a group of five is refused with a reason.
    await expect(
      run(M.Equipment_createViaRegister, {
        name: "Chafer",
        assetTag: "CF-X",
        category: "Holding",
        ownership: "owned",
        trackingMode: "serialized",
        quantity: 5,
      }),
    ).rejects.toThrow(/serial number is one piece/);

    const rows = (await staff.query(api.queries.listEquipment, {})) as
      EquipmentRow[] | null;
    const byId = new Map((rows ?? []).map((row) => [row._id, row]));
    expect(byId.get(warmer.docId)).toMatchObject({
      trackingMode: "serialized",
      serialNumber: "CS-88213",
      quantity: 1,
      replacementCost: 1450,
      homeLocation: "Warehouse bay 2",
      ownership: "owned",
      condition: "good",
      status: "active",
    });
    expect(byId.get(chairs.docId)).toMatchObject({
      trackingMode: "bulk",
      quantity: 200,
      countUnit: "each",
      replacementCost: 28,
      customerPrice: 4,
    });

    // Recount the chairs after an event: 196 came back.
    await run(M.Equipment_recount, {
      docId: chairs.docId,
      actualQuantity: 196,
    });
    // The warmer is lost: a serial piece counts 0 or 1, never 2.
    await expect(
      run(M.Equipment_recount, { docId: warmer.docId, actualQuantity: 2 }),
    ).rejects.toThrow(/one piece/);
    await run(M.Equipment_recount, { docId: warmer.docId, actualQuantity: 0 });

    const after = (await staff.query(api.queries.listEquipment, {})) as
      EquipmentRow[] | null;
    const afterById = new Map((after ?? []).map((row) => [row._id, row]));
    expect(afterById.get(chairs.docId)?.quantity).toBe(196);
    expect(afterById.get(warmer.docId)?.quantity).toBe(0);

    const audit = (await staff.run(async (ctx) =>
      ctx.db.query("manifestEvents").collect(),
    )) as Array<{ type: string; entityId: string; payload: any }>;
    const recounts = audit.filter((row) => row.type === "EquipmentRecounted");
    expect(
      recounts.map((row) => ({
        id: row.payload.equipmentId,
        from: row.payload.previousQuantity,
        to: row.payload.quantity,
      })),
    ).toEqual(
      expect.arrayContaining([
        { id: chairs.docId, from: 200, to: 196 },
        { id: warmer.docId, from: 1, to: 0 },
      ]),
    );

    // Equipment is not food stock: nothing landed in the stock tables.
    const stock = (await staff.run(async (ctx) =>
      ctx.db.query("inventoryItems").collect(),
    )) as unknown[];
    expect(stock).toHaveLength(0);
  });
});
