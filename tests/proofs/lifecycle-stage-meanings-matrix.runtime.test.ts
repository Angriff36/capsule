/**
 * Runtime proof (AC-399 matrix): one compact walk across all ten Event
 * stages, asserting each §4.2 meaning. Slice proofs cover individual
 * stages; this file names every stage together.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const S = {
  startsAt: Date.UTC(2026, 9, 22, 17, 0),
  endsAt: Date.UTC(2026, 9, 22, 22, 0),
  expectedHeadcount: 40,
  quotedPrice: 4500,
  budgetAmount: 3000,
} as const;
const M = api.mutations;
type Downstream =
  "invoices" | "packLists" | "purchaseNeeds" | "eventStaffNeeds";
type StageRow = { stage: string; version: number; quotedPrice: number };
type EventRow = StageRow & {
  budgetAmount: number;
  expectedHeadcount: number;
};
type GuestRow = { rsvpStatus: string; checkedInAt: number | null };
type LedgerRow = { status: string; deletedAt?: number | null };
type CancelRow = { stage: string; cancellationReason: string | null };

function harness() {
  return createManifestTestContext({
    convexTest: convexTest as never,
    schema,
    modules,
  });
}

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

type Proof = ReturnType<typeof harness>;
type Role = ReturnType<Proof["asRole"]>;
type Cmd = Parameters<Proof["executeCommand"]>[1];

function rolesFor(proof: Proof, tenantId: string) {
  const as = (role: string, prefix: string) =>
    proof.asRole({ subject: `${prefix}-${tenantId}`, role, tenantId });
  return {
    sales: as("sales_manager", "sales"),
    events: as("event_manager", "event-manager"),
    kitchen: as("kitchen_manager", "kitchen"),
    logistics: as("logistics_manager", "logistics"),
  };
}

async function createEvent(proof: Proof, tenantId: string, title: string) {
  const { sales } = rolesFor(proof, tenantId);
  const client = (await proof.executeCommand(
    sales,
    M.Client_createViaRegister,
    { clientType: "company", companyName: `Matrix client ${tenantId}` },
  )) as { docId: string };
  const event = (await proof.executeCommand(
    sales,
    M.Event_createViaPlanEngagement,
    {
      clientId: client.docId,
      title,
      eventType: "corporate dinner",
      startsAt: S.startsAt,
      endsAt: S.endsAt,
      expectedHeadcount: S.expectedHeadcount,
      primaryContactName: "Casey Matrix",
      budgetAmount: S.budgetAmount,
      quotedPrice: S.quotedPrice,
    },
  )) as { docId: string };
  return event.docId;
}

const LADDER = [
  "planning",
  "pending_approval",
  "approved",
  "sales_lock",
  "executing",
  "final",
  "completed",
  "closed_out",
] as const;
type LadderStage = (typeof LADDER)[number];

async function walkToStage(
  proof: Proof,
  tenantId: string,
  target: LadderStage,
) {
  const { sales, events } = rolesFor(proof, tenantId);
  const eventId = await createEvent(proof, tenantId, `Matrix ${target} walk`);
  const plan: Array<readonly [Role, Cmd]> = [
    [events, M.Event_submitForApproval],
    [events, M.Event_approve],
    [sales, M.Event_lockForSales],
    [events, M.Event_beginExecution],
    [events, M.Event_finalizeEvent],
    [events, M.Event_complete],
    [events, M.Event_closeOut],
  ];
  let version = 1;
  for (const [i, [role, cmd]] of plan.entries()) {
    if (LADDER.indexOf(target) < i + 1) break;
    await proof.executeCommand(role, cmd, { docId: eventId, version });
    version = i + 2;
  }
  return { eventId, version };
}

/** Live (deletedAt == null) rows for one event in one table. */
async function liveRowsFor(
  reader: Role,
  table: Downstream,
  eventId: string,
): Promise<Array<Record<string, unknown>>> {
  return (await reader.run(async (ctx) =>
    ctx.db.query(table).collect(),
  )) as Array<Record<string, unknown>>;
}

function rowsForEvent(
  rows: Array<Record<string, unknown>>,
  eventId: string,
): Array<Record<string, unknown>> {
  return rows.filter(
    (row) =>
      (row as { deletedAt?: number | null }).deletedAt == null &&
      (row as { eventId?: string }).eventId === eventId,
  );
}

async function readRow<T extends Record<string, unknown>>(
  actor: Role,
  docId: string,
): Promise<T> {
  return (await actor.run(async (ctx) => ctx.db.get(docId as never))) as T;
}

/** The event has exactly one draft pack list and one draft unsent invoice. */
async function expectDraftInvoiceAndPack(logistics: Role, eventId: string) {
  const packs = rowsForEvent(
    await liveRowsFor(logistics, "packLists", eventId),
    eventId,
  );
  expect(packs).toHaveLength(1);
  expect((packs[0] as { status?: string }).status).toBe("draft");
  const invoices = rowsForEvent(
    await liveRowsFor(logistics, "invoices", eventId),
    eventId,
  );
  expect(invoices).toHaveLength(1);
  const invoice = invoices[0] as { status?: string; sentAt?: number | null };
  expect(invoice.status).toBe("draft");
  expect(invoice.sentAt == null).toBe(true);
  return {
    packId: (packs[0] as { _id: string })._id,
    invoiceId: (invoices[0] as { _id: string })._id,
  };
}

/** The command must be refused as a guard rejection with zero writes. */
function refused(
  proof: Proof,
  role: Role,
  cmd: Cmd,
  args: Record<string, unknown>,
) {
  return expect(proof.executeCommand(role, cmd, args)).rejects.toThrow(
    /Guard|Invalid state transition/,
  );
}

describe("runtime proof: AC-399 ten-stage §4.2 meaning matrix", () => {
  it("quote, planning, and pending_approval have zero automatic downstream rows", async () => {
    const proof = harness();
    const logistics = rolesFor(proof, "mx-zero").logistics;

    // quote: no public create starts on quote; patch the stage directly.
    const quoteEvent = await createEvent(proof, "mx-quote", "Matrix quote");
    await logistics.run(async (ctx) =>
      ctx.db.patch(quoteEvent as never, { stage: "quote" }),
    );
    // planning: create only (walkToStage stops before the first step).
    const planningEvent = await createEvent(proof, "mx-plan", "plan-only");
    // pending_approval: create + submit (version 1).
    const pending = await walkToStage(proof, "mx-pend", "pending_approval");

    const stageOf = (id: string) =>
      readRow<{ stage: string }>(logistics, id).then((r) => r.stage);
    expect(await stageOf(quoteEvent)).toBe("quote");
    expect(await stageOf(planningEvent)).toBe("planning");
    expect(await stageOf(pending.eventId)).toBe("pending_approval");

    for (const eventId of [quoteEvent, planningEvent, pending.eventId]) {
      for (const table of [
        "invoices",
        "packLists",
        "purchaseNeeds",
        "eventStaffNeeds",
      ] as const) {
        expect(
          rowsForEvent(await liveRowsFor(logistics, table, eventId), eventId),
        ).toHaveLength(0);
      }
    }
  });

  it("approved ensures one draft invoice and pack; sales_lock freezes price and allows headcount", async () => {
    const proof = harness();
    const tenantId = "mx-sales-lock";
    const { sales, events, logistics } = rolesFor(proof, tenantId);
    const walked = await walkToStage(proof, tenantId, "approved");
    const { eventId, version } = walked;
    await expectDraftInvoiceAndPack(logistics, eventId);

    await proof.executeCommand(sales, M.Event_lockForSales, {
      docId: eventId,
      version,
    });
    await proof.executeCommand(events, M.Event_changeHeadcount, {
      docId: eventId,
      version: version + 1,
      newHeadcount: 48,
    });
    const locked = await readRow<EventRow>(events, eventId);
    expect(locked).toMatchObject({
      stage: "sales_lock",
      expectedHeadcount: 48,
      quotedPrice: S.quotedPrice,
      budgetAmount: S.budgetAmount,
    });

    await refused(proof, events, M.Event_changePricing, {
      docId: eventId,
      version: locked.version,
      budgetAmount: 1,
      quotedPrice: 2,
    });
    const after = await readRow<EventRow>(events, eventId);
    expect(after.quotedPrice).toBe(S.quotedPrice);
    expect(after.version).toBe(locked.version);
  });

  it("executing permits attendance, exits via finalizeEvent; final refuses new plans and exits via complete", async () => {
    const proof = harness();
    const tenantId = "mx-exec-final";
    const { events, kitchen } = rolesFor(proof, tenantId);
    const walked = await walkToStage(proof, tenantId, "executing");
    const { eventId, version } = walked;
    const run = (cmd: Cmd, v: number) =>
      proof.executeCommand(events, cmd, { docId: eventId, version: v });
    const stop = (cmd: Cmd, v: number) =>
      refused(proof, events, cmd, { docId: eventId, version: v });
    const stageNow = () => readRow<StageRow>(events, eventId);

    const guest = (await proof.executeCommand(
      events,
      M.EventGuest_createViaInvite,
      { eventId, name: "Matrix Guest" },
    )) as { docId: string };
    for (const [cmd, v] of [
      [M.EventGuest_rsvpConfirm, 1],
      [M.EventGuest_checkIn, 2],
    ] as const) {
      await proof.executeCommand(events, cmd, {
        docId: guest.docId,
        version: v,
      });
    }
    const guestRow = await readRow<GuestRow>(events, guest.docId);
    expect(guestRow.rsvpStatus).toBe("confirmed");
    expect(guestRow.checkedInAt).toBeGreaterThan(0);
    const executing = await stageNow();
    expect(executing).toMatchObject({
      stage: "executing",
      version,
      quotedPrice: S.quotedPrice,
    });

    await stop(M.Event_complete, executing.version);
    expect(await stageNow()).toMatchObject(executing);

    await run(M.Event_finalizeEvent, executing.version);
    const finalized = await stageNow();
    expect(finalized.stage).toBe("final");

    const dish = (await proof.executeCommand(
      kitchen,
      M.Dish_createViaIntroduce,
      {
        name: `Matrix no-plan dish ${tenantId}`,
        portionSize: 1,
        portionUnit: "portion",
      },
    )) as { docId: string };
    await refused(proof, events, M.EventDish_createViaAddToEvent, {
      eventId,
      dishId: dish.docId,
      quantityServings: 12,
    });
    expect(await stageNow()).toMatchObject(finalized);

    await stop(M.Event_closeOut, finalized.version);
    expect(await stageNow()).toMatchObject(finalized);

    await run(M.Event_complete, finalized.version);
    expect((await stageNow()).stage).toBe("completed");
  });

  it("closed_out refuses ordinary edits; cancelled stands down the draft pack and voids the unpaid invoice", async () => {
    const proof = harness();

    // A) closed_out refuses pricing, headcount, and cancel.
    const closed = rolesFor(proof, "mx-closed-out");
    const walked = await walkToStage(proof, "mx-closed-out", "closed_out");
    const { eventId, version } = walked;
    for (const [cmd, args] of [
      [M.Event_changePricing, { budgetAmount: 1, quotedPrice: 1 }],
      [M.Event_changeHeadcount, { newHeadcount: 99 }],
      [M.Event_cancel, { reason: "too late" }],
    ] as const) {
      await refused(proof, closed.events, cmd, {
        docId: eventId,
        version,
        ...args,
      });
    }
    expect(await readRow<EventRow>(closed.logistics, eventId)).toMatchObject({
      stage: "closed_out",
      quotedPrice: S.quotedPrice,
      budgetAmount: S.budgetAmount,
      expectedHeadcount: S.expectedHeadcount,
      version,
    });

    // B) cancel from approved stands down the pack and voids the invoice.
    const cancel = rolesFor(proof, "mx-cancel");
    const approved = await walkToStage(proof, "mx-cancel", "approved");
    const ids = await expectDraftInvoiceAndPack(
      cancel.logistics,
      approved.eventId,
    );
    await proof.executeCommand(cancel.events, M.Event_cancel, {
      docId: approved.eventId,
      version: approved.version,
      reason: "Client withdrew",
    });
    const cancelled = await readRow<CancelRow>(cancel.events, approved.eventId);
    expect(cancelled.stage).toBe("cancelled");
    expect(cancelled.cancellationReason).toBe("Client withdrew");
    const packRow = await readRow<LedgerRow>(cancel.logistics, ids.packId);
    expect(packRow.status).toBe("cancelled");
    expect(packRow.deletedAt ?? null).toBeNull();
    const invoiceRow = await readRow<LedgerRow>(
      cancel.logistics,
      ids.invoiceId,
    );
    expect(invoiceRow.status).toBe("voided");
    expect(invoiceRow.deletedAt ?? null).toBeNull();
  });
});
