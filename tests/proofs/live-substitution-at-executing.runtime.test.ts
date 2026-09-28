/**
 * PL-COMMERCIAL-CHANGE runtime proof (AC-101): during service (stage
 * executing) a manager can 86 a dish (zero servings), swap a dish, adjust
 * servings and change instructions without reopening the event, without
 * touching the accepted proposal or its frozen revision, and without changing
 * the invoice - money stays on its own correction path.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  generate,
  seedWorld,
  type World,
} from "./proposal-generate.runtime.helpers";

const M = api.mutations;

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

const row = async (w: World, id: string) =>
  (await w.owner.run((ctx) => ctx.db.get(id as never))) as any;

async function walkToExecuting(w: World) {
  const events = w.proof.asRole({
    subject: `events-${w.tenantId}`,
    role: "event_manager",
    tenantId: w.tenantId,
  });
  const logistics = w.proof.asRole({
    subject: `logistics-${w.tenantId}`,
    role: "logistics_manager",
    tenantId: w.tenantId,
  });
  await w.proof.executeCommand(events, M.Event_submitForApproval, {
    docId: w.eventId,
  } as never);
  await w.proof.executeCommand(events, M.Event_approve, {
    docId: w.eventId,
  } as never);
  const openPackLists = (await logistics.run(async (ctx) =>
    (await ctx.db.query("packLists").collect()).filter(
      (pack: any) =>
        pack.eventId === w.eventId &&
        pack.deletedAt == null &&
        pack.status !== "cancelled" &&
        pack.status !== "dispatched",
    ),
  )) as any[];
  for (const pack of openPackLists) {
    await w.proof.executeCommand(logistics, M.PackList_cancel, {
      docId: pack._id,
      reason: "Proof skips packing",
      version: pack.version,
    } as never);
  }
  // Sales lock needs a venue and a service style (AC-227); this proof is
  // about substitution, so seed the two names straight onto the row.
  await w.owner.run((ctx) =>
    ctx.db.patch(
      w.eventId as never,
      {
        venueName: "Proof Hall",
        serviceStyleName: "Plated",
      } as never,
    ),
  );
  await w.proof.executeCommand(w.sales, M.Event_lockForSales, {
    docId: w.eventId,
  } as never);
  await w.proof.executeCommand(events, M.Event_beginExecution, {
    docId: w.eventId,
  } as never);
  return events;
}

describe("live changes during service (AC-101)", () => {
  it("86, swap, servings and instructions keep the stage, the accepted revision and the invoice", async () => {
    const w = await seedWorld("tenant-live-substitution");
    const { proposalId } = await generate(w);
    await w.proof.executeCommand(
      w.sales,
      api.lib.proposalRevision.sendProposalWithRevisionCapture as never,
      { docId: proposalId } as never,
    );
    const [revision] = (await w.sales.query(
      api.queries.listProposalRevisionByProposalId,
      { proposalId } as never,
    )) as unknown as { _id: string; snapshot: string }[];
    await w.proof.executeCommand(w.sales, M.Proposal_accept, {
      docId: proposalId,
      acceptedRevisionId: revision._id,
    } as never);
    const finance = w.proof.asRole({
      subject: `finance-${w.tenantId}`,
      role: "finance_manager",
      tenantId: w.tenantId,
    });
    const invoice = (await w.proof.executeCommand(
      finance,
      M.Invoice_createViaIssue,
      {
        clientId: w.clientId,
        invoiceNumber: "INV-LIVE-1",
        subtotal: 1515,
        taxAmount: 0,
        discountAmount: 0,
        total: 1515,
      } as never,
    )) as { docId: string };

    const manager = await walkToExecuting(w);
    expect((await row(w, w.eventId)).stage).toBe("executing");
    const proposalBefore = await row(w, proposalId);
    const invoiceBefore = await row(w, invoice.docId);

    // 86 the brisket, swap the salmon for the tart, adjust and annotate.
    await w.proof.executeCommand(manager, M.EventDish_adjustServings, {
      docId: w.eventDishes.brisket,
      quantityServings: 0,
    } as never);
    await w.proof.executeCommand(manager, M.EventDish_remove, {
      docId: w.eventDishes.salmon,
      reason: "Salmon delivery short - swapped for the tart",
    } as never);
    const tart = (await w.proof.executeCommand(
      manager,
      M.EventDish_createViaAddToEvent,
      {
        eventId: w.eventId,
        dishId: w.dishes.tart,
        quantityServings: 30,
      } as never,
    )) as { docId: string };
    await w.proof.executeCommand(manager, M.EventDish_adjustServings, {
      docId: tart.docId,
      quantityServings: 42,
    } as never);
    await w.proof.executeCommand(manager, M.EventDish_updateInstructions, {
      docId: tart.docId,
      specialInstructions: "Plate at the dessert station",
    } as never);

    expect(await row(w, w.eventDishes.brisket)).toMatchObject({
      quantityServings: 0,
    });
    expect((await row(w, w.eventDishes.salmon)).deletedAt).not.toBeNull();
    expect(await row(w, tart.docId)).toMatchObject({
      quantityServings: 42,
      specialInstructions: "Plate at the dessert station",
    });

    // The event was never reopened.
    expect((await row(w, w.eventId)).stage).toBe("executing");
    // The accepted proposal and its frozen revision are untouched.
    expect(await row(w, proposalId)).toEqual(proposalBefore);
    const [revisionAfter] = (await w.sales.query(
      api.queries.listProposalRevisionByProposalId,
      { proposalId } as never,
    )) as unknown as { _id: string; snapshot: string }[];
    expect(revisionAfter.snapshot).toBe(revision.snapshot);
    // Money stays on its own path: the invoice did not move.
    expect(await row(w, invoice.docId)).toEqual(invoiceBefore);
  });
});
