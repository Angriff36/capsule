/**
 * AC-548 (BE-13-gs-vendor-orders): items rented from an outside vendor and
 * items the client brings are tracked without being counted as our stock.
 *
 * We own 100 chairs. The event needs 150, so 50 more are rented from a
 * vendor, and the client brings their own cake stand. The rental line runs
 * its whole vendor job (asked, confirmed, 48 arrive, 46 go back = 2 the
 * vendor will bill), the cake stand is a client line on the pack list - and
 * our 100 chairs stay 100, all 100 still free to hold for the event.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";

const M = api.mutations;
const TENANT = "tenant-ac548-rentals";
const STARTS = Date.UTC(2026, 10, 7, 17, 0);
const ENDS = Date.UTC(2026, 10, 7, 23, 0);

beforeAll(() => {
  process.env.CONVEX_FIELD_ENCRYPTION_KEY ||=
    "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
});

describe("runtime proof: rentals from vendors and client items (AC-548)", () => {
  it("a sub-rental order and a client-provided line never reduce owned stock", async () => {
    const proof = createManifestTestContext({
      convexTest: convexTest as never,
      schema,
      modules,
    });
    const as = (subject: string, role: string) =>
      proof.asRole({ subject, role, tenantId: TENANT });
    const logistics = as("logistics-ac548", "logistics_manager");
    const inventory = as("inventory-ac548", "inventory_manager");
    const sales = as("sales-ac548", "sales_manager");
    const owner = as("owner-ac548", "owner");
    const run = (actor: typeof owner, cmd: unknown, args: object) =>
      proof.executeCommand(actor, cmd as never, args as never) as Promise<{
        docId: string;
      }>;

    const vendor = await run(inventory, M.Vendor_createViaOnboard, {
      name: "Party Rentals Co",
    });
    const chairs = await run(logistics, M.Equipment_createViaRegister, {
      name: "White folding chair",
      assetTag: "CH-POOL",
      category: "Furniture",
      ownership: "owned",
      quantity: 100,
      replacementCost: 28,
      customerPrice: 4,
    });
    const client = await run(sales, M.Client_createViaRegister, {
      clientType: "company",
      companyName: "Garden party client",
    });
    const event = await run(sales, M.Event_createViaPlanEngagement, {
      clientId: client.docId,
      title: "Garden party",
      eventType: "wedding",
      startsAt: STARTS,
      endsAt: ENDS,
      expectedHeadcount: 150,
      primaryContactName: "Riley Host",
      budgetAmount: 9000,
      quotedPrice: 12000,
    });

    // 50 chairs rented from the vendor, named against our catalog line.
    const rental = await run(logistics, M.RentalOrderLine_createViaAskVendor, {
      eventId: event.docId,
      vendorId: vendor.docId,
      equipmentId: chairs.docId,
      description: "White folding chair",
      quantity: 50,
      vendorCost: 125,
      deliverBy: STARTS - 3 * 3600_000,
      pickupAt: ENDS + 12 * 3600_000,
    });
    // Pick-up before drop-off is refused with a reason.
    await expect(
      run(logistics, M.RentalOrderLine_createViaAskVendor, {
        eventId: event.docId,
        vendorId: vendor.docId,
        description: "Tent",
        quantity: 1,
        deliverBy: ENDS,
        pickupAt: STARTS,
      }),
    ).rejects.toThrow(/Pick-up has to be after drop-off/);

    await run(logistics, M.RentalOrderLine_confirm, {
      docId: rental.docId,
      vendorReference: "PR-5521",
    });
    await run(logistics, M.RentalOrderLine_markDelivered, {
      docId: rental.docId,
      deliveredQuantity: 48,
    });
    await expect(
      run(logistics, M.RentalOrderLine_markReturned, {
        docId: rental.docId,
        returnedQuantity: 49,
      }),
    ).rejects.toThrow(/more than arrived/);
    await run(logistics, M.RentalOrderLine_markReturned, {
      docId: rental.docId,
      returnedQuantity: 46,
      note: "Two chairs broken at teardown",
    });

    const lines = (await logistics.query(
      api.queries.listRentalOrderLine,
      {},
    )) as any[];
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      status: "returned",
      vendorId: vendor.docId,
      equipmentId: chairs.docId,
      quantity: 50,
      deliveredQuantity: 48,
      returnedQuantity: 46,
      missingQuantity: 2,
      vendorReference: "PR-5521",
      vendorCost: 125,
      returnNote: "Two chairs broken at teardown",
    });

    // The client's cake stand is a client line on the pack list.
    const packList = await run(owner, M.PackList_createViaOpen, {
      eventId: event.docId,
      name: "Garden party pack list",
    });
    const cakeStand = await run(logistics, M.PackListItem_createViaAddItem, {
      packListId: packList.docId,
      description: "Cake stand (client's own)",
      requiredQuantity: 1,
      unit: "each",
    });
    await run(logistics, M.PackListItem_setResponsibility, {
      docId: cakeStand.docId,
      ownership: "client",
      returnRequired: true,
      returnNote: "Hand back to the couple at the end",
    });
    const packItem = (await logistics.run(async (ctx) =>
      ctx.db.get(cakeStand.docId as never),
    )) as any;
    expect(packItem).toMatchObject({
      ownership: "client",
      returnRequired: true,
      returnNote: "Hand back to the couple at the end",
    });

    // Our stock is untouched: still 100 chairs, no holds, no stock moves.
    const equipment = (await logistics.run(async (ctx) =>
      ctx.db.get(chairs.docId as never),
    )) as any;
    expect(equipment.quantity).toBe(100);
    const holds = (await logistics.run(async (ctx) =>
      ctx.db.query("equipmentReservations").collect(),
    )) as unknown[];
    expect(holds).toHaveLength(0);
    const stock = (await logistics.run(async (ctx) =>
      ctx.db.query("inventoryItems").collect(),
    )) as unknown[];
    expect(stock).toHaveLength(0);

    // All 100 owned chairs are still free to hold for the same window.
    await logistics.mutation(api.equipmentCheckout.reserve, {
      equipmentId: chairs.docId as never,
      eventId: event.docId as never,
      startsAt: STARTS,
      endsAt: ENDS,
      quantity: 100,
    });
    await expect(
      logistics.mutation(api.equipmentCheckout.reserve, {
        equipmentId: chairs.docId as never,
        eventId: event.docId as never,
        startsAt: STARTS,
        endsAt: ENDS,
        quantity: 1,
      }),
    ).rejects.toThrow(/has 0 available/);
  });
});
