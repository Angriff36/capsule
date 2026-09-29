// @vitest-environment edge-runtime
/**
 * AC-545 (BE-13-gs-catalog): the catalog carries owned and rented items with
 * photo, unit, bundle parts, accessories, condition, serial, replacement
 * cost, storage place and client price. A rented item names the vendor we
 * get it from; another company's vendor or item never links.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { api } from "../../../convex/_generated/api";
import schema from "../../../convex/schema";
import { modules } from "../../proofs/convex-test-modules";

const M = api.mutations;
const TENANT = "tenant-ac545-catalog";
const OTHER = "tenant-ac545-other";

beforeAll(() => {
  process.env.CONVEX_FIELD_ENCRYPTION_KEY ||=
    "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
});

describe("rental catalog fields (AC-545)", () => {
  it("a rented catalog item names its vendor, replacement cost and customer price", async () => {
    const proof = createManifestTestContext({
      convexTest: convexTest as never,
      schema,
      modules,
    });
    const staff = proof.asRole({
      subject: "logistics-ac545",
      role: "logistics_manager",
      tenantId: TENANT,
    });
    const buyer = proof.asRole({
      subject: "buyer-ac545",
      role: "inventory_manager",
      tenantId: TENANT,
    });
    const otherBuyer = proof.asRole({
      subject: "buyer-ac545-other",
      role: "inventory_manager",
      tenantId: OTHER,
    });
    const run = (actor: typeof staff, cmd: unknown, args: object) =>
      proof.executeCommand(actor, cmd as never, args as never) as Promise<{
        docId: string;
      }>;

    const vendor = await run(buyer, M.Vendor_createViaOnboard, {
      name: "Party Rentals Co",
    });
    const theirVendor = await run(otherBuyer, M.Vendor_createViaOnboard, {
      name: "Their Rentals",
    });

    const chairs = await run(staff, M.Equipment_createViaRegister, {
      name: "Chiavari chair, gold",
      assetTag: "RENT-CHIAV",
      category: "Furniture",
      ownership: "rented",
      quantity: 150,
      countUnit: "each",
      replacementCost: 95,
      customerPrice: 9.5,
      vendorId: vendor.docId,
      description: "Gold resin chair with ivory cushion",
    });

    // Another company's vendor never links to our catalog.
    await expect(
      run(staff, M.Equipment_createViaRegister, {
        name: "Stolen link",
        assetTag: "RENT-X",
        category: "Furniture",
        ownership: "rented",
        vendorId: theirVendor.docId,
      }),
    ).rejects.toThrow(/linked record was not found|isn't in your vendor list/);

    const chafer = await run(staff, M.Equipment_createViaRegister, {
      name: "Roll-top chafer",
      assetTag: "CF-7",
      category: "Holding",
      ownership: "owned",
      trackingMode: "serialized",
      serialNumber: "RT-7781",
      replacementCost: 320,
      customerPrice: 45,
      homeLocation: "Shelf B4",
    });
    const pan = await run(staff, M.Equipment_createViaRegister, {
      name: "Full water pan",
      assetTag: "WP-POOL",
      category: "Holding",
      ownership: "owned",
      quantity: 40,
    });
    const sterno = await run(staff, M.Equipment_createViaRegister, {
      name: "Fuel can stand",
      assetTag: "FS-POOL",
      category: "Holding",
      ownership: "owned",
      quantity: 30,
    });

    // The chafer ships with its water pan and offers a fuel stand.
    await run(staff, M.EquipmentPart_createViaAttach, {
      equipmentId: chafer.docId,
      partEquipmentId: pan.docId,
      role: "part",
      quantity: 1,
    });
    await run(staff, M.EquipmentPart_createViaAttach, {
      equipmentId: chafer.docId,
      partEquipmentId: sterno.docId,
      role: "accessory",
      quantity: 2,
    });
    await expect(
      run(staff, M.EquipmentPart_createViaAttach, {
        equipmentId: chafer.docId,
        partEquipmentId: chafer.docId,
        role: "part",
      }),
    ).rejects.toThrow(/can't be a part of itself/);

    // A photo on the catalog item.
    const storageId = (await staff.run(async (ctx) =>
      ctx.storage.store(new Blob(["chair"], { type: "image/png" })),
    )) as string;
    await run(staff, M.Equipment_setPrimaryImage, {
      docId: chairs.docId,
      storageId,
      fileName: "chiavari.png",
    });

    const rows = (await staff.query(api.queries.listEquipment, {})) as any[];
    const rented = rows.find((row) => row._id === chairs.docId);
    expect(rented).toMatchObject({
      ownership: "rented",
      vendorId: vendor.docId,
      replacementCost: 95,
      customerPrice: 9.5,
      countUnit: "each",
      description: "Gold resin chair with ivory cushion",
      primaryImageStorageId: storageId,
      primaryImageFileName: "chiavari.png",
    });
    expect(rows.find((row) => row._id === chafer.docId)).toMatchObject({
      trackingMode: "serialized",
      serialNumber: "RT-7781",
      condition: "good",
      homeLocation: "Shelf B4",
      replacementCost: 320,
      customerPrice: 45,
    });

    const parts = (
      (await staff.query(api.queries.listEquipmentPart, {})) as any[]
    ).filter((row) => row.equipmentId === chafer.docId);
    expect(
      parts
        .map((row) => ({
          part: row.partEquipmentId,
          role: row.role,
          quantity: row.quantity,
        }))
        .sort((a, b) => a.role.localeCompare(b.role)),
    ).toEqual([
      { part: sterno.docId, role: "accessory", quantity: 2 },
      { part: pan.docId, role: "part", quantity: 1 },
    ]);

    // The photo resolves only for our company.
    const urls = (await staff.query(
      (api as any).fileStorage.urlsForStorageIds,
      { storageIds: [storageId] },
    )) as Record<string, string | null>;
    expect(urls[storageId]).toEqual(expect.any(String));
    const theirUrls = (await otherBuyer.query(
      (api as any).fileStorage.urlsForStorageIds,
      { storageIds: [storageId] },
    )) as Record<string, string | null>;
    expect(theirUrls[storageId] ?? null).toBeNull();
  });
});
