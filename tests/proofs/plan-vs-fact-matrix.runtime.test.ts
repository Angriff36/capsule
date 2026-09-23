/**
 * Runtime proof (AC-407, §6.5 submitted/ordered slice of the plan-vs-fact
 * matrix): after a weekly order is submitted, a headcount change keeps the
 * committed order untouched and lands the delta in a NEW weekly draft, and a
 * replayed change neither rewrites the committed order nor piles up drafts.
 * Proof only — the commands already exist in the manifest; nothing here adds
 * commands.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  harness,
  liveRows,
  liveVendorOrders,
  orderLines,
  readRow,
  rolesFor,
  runner,
  seedWeeklyOrder,
  submitWeeklyOrder,
  type Proof,
  type Role,
  type VendorOrderLineRow,
  type VendorOrderRow,
  type WeeklySeed,
} from "./plan-vs-fact-matrix.runtime.helpers";

const M = api.mutations;

type EventRow = {
  expectedHeadcount: number;
  version: number;
  tenantId: string;
};

type SubmittedSnapshot = {
  orderId: string;
  submittedAt: number;
  lineAId: string;
  lineBId: string;
  lineAQty: number;
  lineBQty: number;
};

function lineFor(
  lines: VendorOrderLineRow[],
  ingredientId: string,
): VendorOrderLineRow {
  const found = lines.find((line) => line.ingredientId === ingredientId);
  if (!found) throw new Error(`No order line for ingredient ${ingredientId}`);
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
    await runEvent(M.Event_changeHeadcount, {
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

type SubmittedState = {
  proof: Proof;
  roles: ReturnType<typeof rolesFor>;
  s: WeeklySeed;
  submitted: SubmittedSnapshot;
};

/** Seed the weekly draft at 40 guests, submit it, then move headcount to 60.
 * Snapshot the committed order (id, submittedAt, line ids, line quantities)
 * right after submit so both tests compare against the as-submitted facts. */
async function seedSubmittedThenChange(
  tenantId: string,
  title: string,
): Promise<SubmittedState> {
  const proof = harness();
  const roles = rolesFor(proof, tenantId);
  const runEvent = runner(proof, roles.events);

  const s = await seedWeeklyOrder(proof, tenantId, title);

  // Seed confirmation: exactly one draft with two auto lines at 40.
  const draftsBefore = (
    await liveVendorOrders(roles.procurement, tenantId)
  ).filter((order: VendorOrderRow) => order.status === "draft");
  expect(draftsBefore).toHaveLength(1);
  const before = await orderLines(roles.procurement, tenantId, s.vendorOrderId);
  expect(before).toHaveLength(2);
  expect(Number(lineFor(before, s.ingredientAId).orderedQuantity)).toBe(40);
  expect(Number(lineFor(before, s.ingredientBId).orderedQuantity)).toBe(40);

  const orderId = await submitWeeklyOrder(proof, tenantId, s.vendorOrderId);

  const submittedOrder = await readRow<VendorOrderRow>(
    roles.procurement,
    orderId,
  );
  expect(orderId).toBe(s.vendorOrderId);
  expect(submittedOrder.status).toBe("submitted");
  expect(submittedOrder.submittedAt).toEqual(expect.any(Number));
  expect(Number.isFinite(submittedOrder.submittedAt)).toBe(true);
  const submittedLines = await orderLines(roles.procurement, tenantId, orderId);
  expect(submittedLines).toHaveLength(2);
  const lineA = lineFor(submittedLines, s.ingredientAId);
  const lineB = lineFor(submittedLines, s.ingredientBId);
  expect(Number(lineA.orderedQuantity)).toBe(40);
  expect(Number(lineB.orderedQuantity)).toBe(40);
  const submitted: SubmittedSnapshot = {
    orderId,
    submittedAt: submittedOrder.submittedAt!,
    lineAId: lineA._id,
    lineBId: lineB._id,
    lineAQty: Number(lineA.orderedQuantity),
    lineBQty: Number(lineB.orderedQuantity),
  };

  await changeHeadcount(proof, roles, s.eventId, 60);

  const event = await readRow<EventRow>(roles.events, s.eventId);
  expect(event.expectedHeadcount).toBe(60);

  return { proof, roles, s, submitted };
}

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

describe("runtime proof: AC-407 §6.5 submitted/ordered (plan vs fact)", () => {
  it("one headcount change after submit keeps the committed order and adds a delta draft", async () => {
    const tenantId = "tenant-ac407-submit-keep";
    const { roles, s, submitted } = await seedSubmittedThenChange(
      tenantId,
      "AC-407 submit keep",
    );

    // The committed order: exactly one submitted order, same id and submittedAt,
    // original lines untouched at 40 — never rewritten to 60.
    const orders = await liveVendorOrders(roles.events, tenantId);
    const submittedOrders = orders.filter(
      (order: VendorOrderRow) => order.status === "submitted",
    );
    expect(submittedOrders).toHaveLength(1);
    expect(submittedOrders[0]!._id).toBe(submitted.orderId);
    expect(submittedOrders[0]!.submittedAt).toBe(submitted.submittedAt);

    const committedLines = await orderLines(
      roles.events,
      tenantId,
      submitted.orderId,
    );
    expect(committedLines).toHaveLength(2);
    const committedA = lineFor(committedLines, s.ingredientAId);
    const committedB = lineFor(committedLines, s.ingredientBId);
    expect(committedA._id).toBe(submitted.lineAId);
    expect(committedB._id).toBe(submitted.lineBId);
    expect(Number(committedA.orderedQuantity)).toBe(40);
    expect(Number(committedB.orderedQuantity)).toBe(40);
    expect(committedA.receivedQuantity ?? 0).toBe(0);
    expect(committedB.receivedQuantity ?? 0).toBe(0);

    // The delta: exactly one draft with a DIFFERENT id, one live line per
    // ingredient, each the 20-guest leftover (60 needed − 40 pending supply
    // from the submitted order).
    const draftOrders = orders.filter(
      (order: VendorOrderRow) => order.status === "draft",
    );
    expect(draftOrders).toHaveLength(1);
    expect(draftOrders[0]!._id).not.toBe(submitted.orderId);
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

    // There are only these two orders — the submitted one was not cancelled
    // or deleted, and nothing else was created.
    expect(orders).toHaveLength(2);
    const event = await readRow<EventRow>(roles.events, s.eventId);
    expect(event.expectedHeadcount).toBe(60);
  });

  it("replaying the same headcount after submit does not rewrite the committed order", async () => {
    const tenantId = "tenant-ac407-submit-replay";
    const { proof, roles, s, submitted } = await seedSubmittedThenChange(
      tenantId,
      "AC-407 submit replay",
    );

    // Replay the identical headcount change (same input). A version bump from
    // the first change is tolerated: re-read and retry once.
    await changeHeadcount(proof, roles, s.eventId, 60);

    const event = await readRow<EventRow>(roles.events, s.eventId);
    expect(event.expectedHeadcount).toBe(60);

    // Still exactly one submitted order with the as-submitted facts intact.
    const orders = await liveVendorOrders(roles.events, tenantId);
    const submittedOrders = orders.filter(
      (order: VendorOrderRow) => order.status === "submitted",
    );
    expect(submittedOrders).toHaveLength(1);
    expect(submittedOrders[0]!._id).toBe(submitted.orderId);
    expect(submittedOrders[0]!.submittedAt).toBe(submitted.submittedAt);
    const committedLines = await orderLines(
      roles.events,
      tenantId,
      submitted.orderId,
    );
    expect(committedLines).toHaveLength(2);
    const committedA = lineFor(committedLines, s.ingredientAId);
    const committedB = lineFor(committedLines, s.ingredientBId);
    expect(committedA._id).toBe(submitted.lineAId);
    expect(committedB._id).toBe(submitted.lineBId);
    expect(Number(committedA.orderedQuantity)).toBe(40);
    expect(Number(committedB.orderedQuantity)).toBe(40);

    // Still exactly one draft — the replay did not open a second one, did not
    // pile 40+20+20 onto lines, and did not rewrite the committed 40.
    const draftOrders = orders.filter(
      (order: VendorOrderRow) => order.status === "draft",
    );
    expect(draftOrders).toHaveLength(1);
    expect(draftOrders[0]!._id).not.toBe(submitted.orderId);
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
