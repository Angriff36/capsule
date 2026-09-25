/**
 * Runtime proof (AC-388, purchasing slice): a buyer-revised weekly draft
 * VendorOrderLine quantity survives Event.changeHeadcount — the revised line
 * keeps its ordered quantity while a following automatic line keeps scaling.
 * Proof only — the commands already exist in the manifest; nothing here adds
 * commands.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  draftLines,
  harness,
  liveRows,
  liveVendorOrders,
  readRow,
  rolesFor,
  runner,
  seedWeeklyOrder,
  type VendorOrderLineRow,
  type VendorOrderRow,
} from "./buyer-qty-override-survival.runtime.helpers";

const M = api.mutations;

type EventRow = { expectedHeadcount: number; tenantId: string };

function lineFor(
  lines: VendorOrderLineRow[],
  ingredientId: string,
): VendorOrderLineRow {
  const found = lines.find((line) => line.ingredientId === ingredientId);
  if (!found) throw new Error(`No draft line for ingredient ${ingredientId}`);
  return found;
}

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

describe("runtime proof: purchasing buyer qty override survival (AC-388)", () => {
  it("headcount change keeps a buyer-revised draft quantity and scales a following line", async () => {
    const proof = harness();
    const tenantId = "tenant-ac388-buyer-keep";
    const s = await seedWeeklyOrder(proof, tenantId, "AC-388 buyer keep");
    const roles = rolesFor(proof, tenantId);
    const runEvent = runner(proof, roles.events);
    const runBuyer = runner(proof, roles.procurement);

    const before = await draftLines(
      roles.procurement,
      tenantId,
      s.vendorOrderId,
    );
    expect(before).toHaveLength(2);
    const lineA = lineFor(before, s.ingredientAId);
    const lineB = lineFor(before, s.ingredientBId);
    expect(Number(lineA.orderedQuantity)).toBe(40);
    expect(lineA.quantityIsManual).not.toBe(true);
    expect(Number(lineB.orderedQuantity)).toBe(40);
    expect(lineB.quantityIsManual).not.toBe(true);

    await runBuyer(M.VendorOrderLine_reviseQuantity, {
      docId: lineA._id,
      orderedQuantity: 7,
    });
    const revised = await readRow<VendorOrderLineRow>(roles.events, lineA._id);
    expect(Number(revised.orderedQuantity)).toBe(7);
    expect(revised.quantityIsManual).toBe(true);

    await runEvent(M.Event_changeHeadcount, {
      docId: s.eventId,
      version: 3,
      newHeadcount: 60,
    });

    const event = await readRow<EventRow>(roles.events, s.eventId);
    expect(event.expectedHeadcount).toBe(60);

    const after = await draftLines(roles.events, tenantId, s.vendorOrderId);
    expect(after).toHaveLength(2);
    const a = lineFor(after, s.ingredientAId);
    expect(Number(a.orderedQuantity)).toBe(7);
    expect(a.quantityIsManual).toBe(true);
    expect(Number(a.plannedQuantity)).toBe(60);
    const b = lineFor(after, s.ingredientBId);
    expect(Number(b.orderedQuantity)).toBe(60);
    expect(b.quantityIsManual).not.toBe(true);

    const events_ = await liveRows<EventRow>(roles.events, "events", tenantId);
    expect(events_).toHaveLength(1);
    const drafts = (await liveVendorOrders(roles.events, tenantId)).filter(
      (order: VendorOrderRow) => order.status === "draft",
    );
    expect(drafts).toHaveLength(1);
  });

  it("a second headcount change still leaves the buyer-revised quantity and scales the follower", async () => {
    const proof = harness();
    const tenantId = "tenant-ac388-buyer-again";
    const s = await seedWeeklyOrder(proof, tenantId, "AC-388 buyer again");
    const roles = rolesFor(proof, tenantId);
    const runEvent = runner(proof, roles.events);
    const runBuyer = runner(proof, roles.procurement);

    const before = await draftLines(
      roles.procurement,
      tenantId,
      s.vendorOrderId,
    );
    expect(before).toHaveLength(2);
    const lineA = lineFor(before, s.ingredientAId);

    await runBuyer(M.VendorOrderLine_reviseQuantity, {
      docId: lineA._id,
      orderedQuantity: 7,
    });
    await runEvent(M.Event_changeHeadcount, {
      docId: s.eventId,
      version: 3,
      newHeadcount: 60,
    });
    const mid = await draftLines(roles.events, tenantId, s.vendorOrderId);
    expect(Number(lineFor(mid, s.ingredientAId).orderedQuantity)).toBe(7);
    expect(Number(lineFor(mid, s.ingredientBId).orderedQuantity)).toBe(60);

    await runEvent(M.Event_changeHeadcount, {
      docId: s.eventId,
      version: 4,
      newHeadcount: 80,
    });

    const event = await readRow<EventRow>(roles.events, s.eventId);
    expect(event.expectedHeadcount).toBe(80);
    const after = await draftLines(roles.events, tenantId, s.vendorOrderId);
    expect(after).toHaveLength(2);
    const a = lineFor(after, s.ingredientAId);
    expect(Number(a.orderedQuantity)).toBe(7);
    expect(a.quantityIsManual).toBe(true);
    expect(Number(a.plannedQuantity)).toBe(80);
    const b = lineFor(after, s.ingredientBId);
    expect(Number(b.orderedQuantity)).toBe(80);
    expect(b.quantityIsManual).not.toBe(true);

    const events_ = await liveRows<EventRow>(roles.events, "events", tenantId);
    expect(events_).toHaveLength(1);
    const drafts = (await liveVendorOrders(roles.events, tenantId)).filter(
      (order: VendorOrderRow) => order.status === "draft",
    );
    expect(drafts).toHaveLength(1);
  });
});
