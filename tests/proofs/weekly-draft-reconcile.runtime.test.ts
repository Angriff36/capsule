/**
 * Runtime proof (AC-078, PR04-04): a headcount change reconciles event demand
 * into the SAME weekly draft order. It opens no second order, keeps the
 * buyer's hand-set quantity, and does not plan extra production.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  approvedEvent,
  drafts,
  harness,
  lineFor,
  liveRows,
  orders,
  rolesFor,
  runner,
  seedCatalog,
  versionOf,
  WEEK_ONE,
} from "./weekly-purchasing.runtime.helpers";

const M = api.mutations;

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

describe("runtime proof: weekly draft reconcile (AC-078)", () => {
  it("a headcount change updates the existing weekly draft, keeps manual quantities, and opens no second order", async () => {
    const proof = harness();
    const tenantId = "tenant-ac078-weekly-reconcile";
    const roles = rolesFor(proof, tenantId);
    const buyer = runner(proof, roles.procurement);
    const events = runner(proof, roles.events);
    const catalog = await seedCatalog(proof, tenantId, [
      { name: "Flour", perServing: 0.1, stock: 5 },
      { name: "Salt", perServing: 0.01 },
    ]);
    const [flourId, saltId] = catalog.ingredientIds as [string, string];
    const eventA = await approvedEvent(proof, tenantId, {
      title: "AC-078 lunch",
      headcount: 100,
      dishIds: catalog.dishIds,
    });
    await approvedEvent(proof, tenantId, {
      title: "AC-078 dinner",
      headcount: 50,
      dishIds: [catalog.dishIds[0]!],
    });

    const [draft] = await drafts(roles.procurement, tenantId);
    expect(draft).toBeDefined();
    expect(draft!.sourceRangeStart).toBe(WEEK_ONE.key);
    const flourBefore = await lineFor(
      roles.procurement,
      tenantId,
      draft!._id,
      flourId,
    );
    // 150 guests x 0.1 kg = 15 kg, less 5 kg on the shelf.
    expect(Number(flourBefore!.orderedQuantity)).toBeCloseTo(10, 4);
    const salt = await lineFor(roles.procurement, tenantId, draft!._id, saltId);
    expect(Number(salt!.orderedQuantity)).toBeCloseTo(1, 4);

    // The buyer rounds salt up to a full 3 kg sack.
    await buyer(M.VendorOrderLine_reviseQuantity, {
      docId: salt!._id,
      version: salt!.version,
      orderedQuantity: 3,
    });

    const ordersBefore = await orders(roles.procurement, tenantId);
    const batchesBefore = await liveRows<{ _id: string; tenantId: string }>(
      roles.procurement,
      "productionBatches",
      tenantId,
    );

    await events(M.Event_changeHeadcount, {
      docId: eventA,
      version: await versionOf(roles.events, eventA),
      newHeadcount: 120,
    });

    const ordersAfter = await orders(roles.procurement, tenantId);
    expect(ordersAfter.map((o) => o._id).sort()).toEqual(
      ordersBefore.map((o) => o._id).sort(),
    );
    const draftsAfter = await drafts(roles.procurement, tenantId);
    expect(draftsAfter).toHaveLength(1);
    expect(draftsAfter[0]!._id).toBe(draft!._id);

    const flourAfter = await lineFor(
      roles.procurement,
      tenantId,
      draft!._id,
      flourId,
    );
    expect(flourAfter!._id).toBe(flourBefore!._id);
    // 170 guests x 0.1 kg = 17 kg, less 5 kg on the shelf.
    expect(Number(flourAfter!.orderedQuantity)).toBeCloseTo(12, 4);
    expect(flourAfter!.quantityIsManual).toBe(false);

    const saltAfter = await lineFor(
      roles.procurement,
      tenantId,
      draft!._id,
      saltId,
    );
    expect(saltAfter!._id).toBe(salt!._id);
    expect(Number(saltAfter!.orderedQuantity)).toBe(3);
    expect(saltAfter!.quantityIsManual).toBe(true);
    // The calculation still follows the event, so the buyer can compare.
    expect(Number(saltAfter!.plannedQuantity)).toBeCloseTo(1.2, 4);

    // Buying more flour is not a reason to plan more cooking.
    const batchesAfter = await liveRows<{ _id: string; tenantId: string }>(
      roles.procurement,
      "productionBatches",
      tenantId,
    );
    expect(batchesAfter.map((b) => b._id).sort()).toEqual(
      batchesBefore.map((b) => b._id).sort(),
    );
  });
});
