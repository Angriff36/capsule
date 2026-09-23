/**
 * Runtime proof (AC-407, §6.5 partially-received slice of the plan-vs-fact
 * matrix): after a weekly order is submitted, confirmed, and partially
 * received, a headcount change keeps the order, its lines, and the delivery
 * receipt exactly as booked, and lands only the leftover need in a NEW weekly
 * draft. What already arrived stays put — a replayed headcount change touches
 * neither the receipt nor the draft count.
 *
 * Proof only — the commands already exist; nothing here adds commands.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  harness,
  liveVendorOrders,
  orderLines,
  readRow,
  rolesFor,
  runner,
  seedWeeklyOrder,
  submitWeeklyOrder,
  type Proof,
  type VendorOrderLineRow,
  type VendorOrderRow,
  type WeeklySeed,
} from "./plan-vs-fact-matrix.runtime.helpers";
import {
  confirmWeeklyOrder,
  liveLots,
  markPartiallyReceived,
  recordPartialReceipt,
  registerDryStore,
  type InventoryLotRow,
} from "./plan-vs-fact-partial-receipt.runtime.helpers";

type EventRow = {
  expectedHeadcount: number;
  version: number;
  tenantId: string;
};

type PartiallyReceivedOrder = VendorOrderRow & { confirmedAt: number | null };

type ReceiptSnapshot = {
  orderId: string;
  submittedAt: number;
  confirmedAt: number;
  lineAId: string;
  lineBId: string;
  lotAId: string;
  lotBId: string;
};

function lineFor(
  lines: VendorOrderLineRow[],
  ingredientId: string,
): VendorOrderLineRow {
  const found = lines.find((line) => line.ingredientId === ingredientId);
  if (!found) throw new Error(`No order line for ingredient ${ingredientId}`);
  return found;
}

function lotFor(lots: InventoryLotRow[], lineId: string): InventoryLotRow {
  const found = lots.find((lot) => lot.vendorOrderLineId === lineId);
  if (!found) throw new Error(`No inventory lot for line ${lineId}`);
  return found;
}

async function changeHeadcount(
  proof: Proof,
  roles: ReturnType<typeof rolesFor>,
  eventId: string,
  newHeadcount: number,
  retryVersion?: number,
): Promise<void> {
  const runEvent = runner(proof, roles.events);
  const event = await readRow<EventRow>(roles.events, eventId);
  try {
    await runEvent(api.mutations.Event_changeHeadcount, {
      docId: eventId,
      version: retryVersion ?? event.version,
      newHeadcount,
    });
  } catch (error) {
    if (retryVersion !== undefined) throw error;
    if (!String(error).includes("VERSION_MISMATCH")) throw error;
    await changeHeadcount(proof, roles, eventId, newHeadcount, event.version);
  }
}

type PartiallyReceivedState = {
  proof: Proof;
  roles: ReturnType<typeof rolesFor>;
  s: WeeklySeed;
  snapshot: ReceiptSnapshot;
};

/** Seed the weekly order at 40 guests, submit, confirm, book 15 of 40 on both
 * lines, mark the order partially received, then move headcount to 60.
 * Snapshot the receipt facts (order, lines, stock lots) so both tests compare
 * against what was actually booked. */
async function seedPartiallyReceivedThenChange(
  tenantId: string,
  title: string,
): Promise<PartiallyReceivedState> {
  const proof = harness();
  const roles = rolesFor(proof, tenantId);

  const s = await seedWeeklyOrder(proof, tenantId, title);
  const orderId = await submitWeeklyOrder(proof, tenantId, s.vendorOrderId);
  await confirmWeeklyOrder(proof, tenantId, orderId);
  const locationId = await registerDryStore(
    proof,
    tenantId,
    `AC-407 dry store ${tenantId}`,
  );

  await recordPartialReceipt(
    proof,
    tenantId,
    s.lineAId,
    locationId,
    15,
    1,
    `LOT-AC407-A-${tenantId}`,
  );
  await recordPartialReceipt(
    proof,
    tenantId,
    s.lineBId,
    locationId,
    15,
    1,
    `LOT-AC407-B-${tenantId}`,
  );
  await markPartiallyReceived(proof, tenantId, orderId);

  // The receipt facts as booked: order partially received, each line 15 of 40
  // delivered with 25 still owed, one stock lot per line at 15.
  const order = await readRow<PartiallyReceivedOrder>(
    roles.procurement,
    orderId,
  );
  expect(order.status).toBe("partially_received");
  expect(order.submittedAt).toEqual(expect.any(Number));
  expect(order.confirmedAt).toEqual(expect.any(Number));
  const receivedLines = await orderLines(roles.procurement, tenantId, orderId);
  expect(receivedLines).toHaveLength(2);
  const lineA = lineFor(receivedLines, s.ingredientAId);
  const lineB = lineFor(receivedLines, s.ingredientBId);
  expect(lineA._id).toBe(s.lineAId);
  expect(lineB._id).toBe(s.lineBId);
  expect(Number(lineA.orderedQuantity)).toBe(40);
  expect(Number(lineB.orderedQuantity)).toBe(40);
  expect(Number(lineA.receivedQuantity)).toBe(15);
  expect(Number(lineB.receivedQuantity)).toBe(15);
  expect(Number(lineA.pendingSupplyQuantity)).toBe(25);
  expect(Number(lineB.pendingSupplyQuantity)).toBe(25);
  const bookedLots = await liveLots(roles.procurement, tenantId);
  expect(bookedLots).toHaveLength(2);
  const lotA = lotFor(bookedLots, s.lineAId);
  const lotB = lotFor(bookedLots, s.lineBId);
  expect(Number(lotA.receiptQuantity)).toBe(15);
  expect(Number(lotB.receiptQuantity)).toBe(15);
  expect(Number(lotA.cumulativeReceivedQuantity)).toBe(15);
  expect(Number(lotB.cumulativeReceivedQuantity)).toBe(15);

  const snapshot: ReceiptSnapshot = {
    orderId,
    submittedAt: order.submittedAt!,
    confirmedAt: order.confirmedAt!,
    lineAId: lineA._id,
    lineBId: lineB._id,
    lotAId: lotA._id,
    lotBId: lotB._id,
  };

  await changeHeadcount(proof, roles, s.eventId, 60);

  const event = await readRow<EventRow>(roles.events, s.eventId);
  expect(event.expectedHeadcount).toBe(60);

  return { proof, roles, s, snapshot };
}

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

describe("runtime proof: AC-407 §6.5 partially received (plan vs fact)", () => {
  it("one headcount change after a partial receipt keeps the receipt and adds a delta draft", async () => {
    const tenantId = "tenant-ac407-partial-keep";
    const { roles, s, snapshot } = await seedPartiallyReceivedThenChange(
      tenantId,
      "AC-407 partial keep",
    );

    const event = await readRow<EventRow>(roles.events, s.eventId);
    expect(event.expectedHeadcount).toBe(60);

    // The order the food actually arrived on: same id, same booking dates,
    // still partially received — not rewritten or replaced.
    const orders = await liveVendorOrders(roles.events, tenantId);
    const receivedOrders = orders.filter(
      (order: VendorOrderRow) => order.status === "partially_received",
    );
    expect(receivedOrders).toHaveLength(1);
    expect(receivedOrders[0]!._id).toBe(snapshot.orderId);
    expect(receivedOrders[0]!.submittedAt).toBe(snapshot.submittedAt);

    // Both original lines: same ids, still 40 ordered, 15 delivered, 25 owed.
    const committedLines = await orderLines(
      roles.events,
      tenantId,
      snapshot.orderId,
    );
    expect(committedLines).toHaveLength(2);
    const committedA = lineFor(committedLines, s.ingredientAId);
    const committedB = lineFor(committedLines, s.ingredientBId);
    expect(committedA._id).toBe(snapshot.lineAId);
    expect(committedB._id).toBe(snapshot.lineBId);
    expect(Number(committedA.orderedQuantity)).toBe(40);
    expect(Number(committedB.orderedQuantity)).toBe(40);
    expect(Number(committedA.receivedQuantity)).toBe(15);
    expect(Number(committedB.receivedQuantity)).toBe(15);
    expect(Number(committedA.pendingSupplyQuantity)).toBe(25);
    expect(Number(committedB.pendingSupplyQuantity)).toBe(25);

    // The stock that arrived: exactly the two booked lots, same ids, 15 each.
    // Nothing was deleted to make room for the change.
    const lots = await liveLots(roles.events, tenantId);
    expect(lots).toHaveLength(2);
    const lotA = lotFor(lots, snapshot.lineAId);
    const lotB = lotFor(lots, snapshot.lineBId);
    expect(lotA._id).toBe(snapshot.lotAId);
    expect(lotB._id).toBe(snapshot.lotBId);
    expect(Number(lotA.receiptQuantity)).toBe(15);
    expect(Number(lotB.receiptQuantity)).toBe(15);
    expect(Number(lotA.cumulativeReceivedQuantity)).toBe(15);
    expect(Number(lotB.cumulativeReceivedQuantity)).toBe(15);

    // The leftover need (60 for the day − 25 still owed − 15 on the shelf)
    // lands on exactly one NEW draft at 20 per ingredient.
    const draftOrders = orders.filter(
      (order: VendorOrderRow) => order.status === "draft",
    );
    expect(draftOrders).toHaveLength(1);
    expect(draftOrders[0]!._id).not.toBe(snapshot.orderId);
    const deltaLines = await orderLines(
      roles.events,
      tenantId,
      draftOrders[0]!._id,
    );
    expect(deltaLines).toHaveLength(2);
    const deltaA = lineFor(deltaLines, s.ingredientAId);
    const deltaB = lineFor(deltaLines, s.ingredientBId);
    expect(Number(deltaA.orderedQuantity)).toBe(20);
    expect(Number(deltaA.plannedQuantity)).toBe(20);
    expect(Number(deltaB.orderedQuantity)).toBe(20);
    expect(Number(deltaB.plannedQuantity)).toBe(20);

    // Only these two orders exist — the received one was kept, nothing else
    // was created.
    expect(orders).toHaveLength(2);
  });

  it("replaying the same headcount after a partial receipt does not rewrite the receipt", async () => {
    const tenantId = "tenant-ac407-partial-replay";
    const { proof, roles, s, snapshot } = await seedPartiallyReceivedThenChange(
      tenantId,
      "AC-407 partial replay",
    );

    // Replay the identical headcount change (same input). A version bump from
    // the first change is tolerated: re-read and retry once.
    await changeHeadcount(proof, roles, s.eventId, 60);

    const event = await readRow<EventRow>(roles.events, s.eventId);
    expect(event.expectedHeadcount).toBe(60);

    // The order, its lines, and the booked stock are exactly as snapshotted.
    const orders = await liveVendorOrders(roles.events, tenantId);
    const receivedOrders = orders.filter(
      (order: VendorOrderRow) => order.status === "partially_received",
    );
    expect(receivedOrders).toHaveLength(1);
    expect(receivedOrders[0]!._id).toBe(snapshot.orderId);
    expect(receivedOrders[0]!.submittedAt).toBe(snapshot.submittedAt);

    const committedLines = await orderLines(
      roles.events,
      tenantId,
      snapshot.orderId,
    );
    expect(committedLines).toHaveLength(2);
    const committedA = lineFor(committedLines, s.ingredientAId);
    const committedB = lineFor(committedLines, s.ingredientBId);
    expect(committedA._id).toBe(snapshot.lineAId);
    expect(committedB._id).toBe(snapshot.lineBId);
    expect(Number(committedA.orderedQuantity)).toBe(40);
    expect(Number(committedB.orderedQuantity)).toBe(40);
    expect(Number(committedA.receivedQuantity)).toBe(15);
    expect(Number(committedB.receivedQuantity)).toBe(15);
    expect(Number(committedA.pendingSupplyQuantity)).toBe(25);
    expect(Number(committedB.pendingSupplyQuantity)).toBe(25);

    const lots = await liveLots(roles.events, tenantId);
    expect(lots).toHaveLength(2);
    const lotA = lotFor(lots, snapshot.lineAId);
    const lotB = lotFor(lots, snapshot.lineBId);
    expect(lotA._id).toBe(snapshot.lotAId);
    expect(lotB._id).toBe(snapshot.lotBId);
    expect(Number(lotA.receiptQuantity)).toBe(15);
    expect(Number(lotB.receiptQuantity)).toBe(15);
    expect(Number(lotA.cumulativeReceivedQuantity)).toBe(15);
    expect(Number(lotB.cumulativeReceivedQuantity)).toBe(15);

    // Still exactly one draft at 20 — the replay opened no second draft and
    // piled no quantities.
    const draftOrders = orders.filter(
      (order: VendorOrderRow) => order.status === "draft",
    );
    expect(draftOrders).toHaveLength(1);
    expect(draftOrders[0]!._id).not.toBe(snapshot.orderId);
    const deltaLines = await orderLines(
      roles.events,
      tenantId,
      draftOrders[0]!._id,
    );
    expect(deltaLines).toHaveLength(2);
    const deltaA = lineFor(deltaLines, s.ingredientAId);
    const deltaB = lineFor(deltaLines, s.ingredientBId);
    expect(Number(deltaA.orderedQuantity)).toBe(20);
    expect(Number(deltaB.orderedQuantity)).toBe(20);

    expect(orders).toHaveLength(2);
  });
});
