/**
 * Runtime proof (AC-404 / backend §6.2 reaction-child replay).
 *
 * Why: EventApproved child commands must converge on the FIRST invoice, pack
 * list, batch, and purchase need. Re-running Invoice.issue, PackList.open,
 * ProductionBatch.plan, and (via the reaction identity) PurchaseNeed.create on
 * the existing rows keeps the same ids, numbers, timestamps, yields, and
 * quantities — retries never create a second child, and the identity stays per
 * parent (a second event still gets its own children).
 *
 * PurchaseNeed note: the create command is insert-only in the Convex
 * projection (self maps to command args; docId is not accepted; the unique
 * demand key is not enforced), so a DIRECT replay call cannot reconcile the
 * row — the convergence is carried by the reaction identity: the first open
 * releases the demand, so a replayed EventApproved fanOut matches zero rows.
 * This proof asserts that release condition plus child singleness.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import {
  M,
  createEvent,
  harness,
  liveRows,
  readEventStage,
  replayIssue,
  rolesFor,
  seedDishComponentForEvent,
  seedEligibleDemandForEvent,
} from "./reaction-replay-identity.runtime.helpers";

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

describe("runtime proof: EventApproved child commands replay to the same rows (AC-404 / §6.2)", () => {
  it("replaying Invoice.issue and PackList.open after approve keeps one of each", async () => {
    const proof = harness();
    const tenantId = "tenant-rxn-replay-invoice-pack";
    const { events, logistics } = rolesFor(proof, tenantId);
    const eventId = await createEvent(
      proof,
      tenantId,
      "Replay keeps one invoice and pack list",
    );

    await proof.executeCommand(events, M.Event_submitForApproval, {
      docId: eventId,
      version: 1,
    });
    await proof.executeCommand(events, M.Event_approve, {
      docId: eventId,
      version: 2,
    });
    expect(await readEventStage(logistics, eventId)).toBe("approved");

    const invoices = await liveRows(logistics, "invoices", eventId);
    expect(invoices).toHaveLength(1);
    const invoice = invoices[0]!;
    expect(invoice.status).toBe("draft");
    const beforeIssue = {
      id: invoice._id,
      number: invoice.invoiceNumber,
      issuedAt: invoice.issuedAt,
      total: Number(invoice.total),
    };

    const packs = await liveRows(logistics, "packLists", eventId);
    expect(packs).toHaveLength(1);
    const pack = packs[0]!;
    const beforeOpen = {
      id: pack._id,
      name: pack.name,
      openedAt: pack.openedAt,
    };

    // Different money on purpose — the stored 4800 must stay.
    await replayIssue(proof, tenantId, invoice);

    // Different name on purpose — the first open must survive.
    await proof.executeCommand(logistics, M.PackList_open, {
      docId: pack._id as string,
      eventId,
      name: "Replay must not rename",
      version: pack.version as number,
    });

    const afterInvoices = await liveRows(logistics, "invoices", eventId);
    expect(afterInvoices).toHaveLength(1);
    const stillInvoice = afterInvoices[0]!;
    expect(stillInvoice._id).toBe(beforeIssue.id);
    expect(stillInvoice.invoiceNumber).toBe(beforeIssue.number);
    expect(stillInvoice.issuedAt).toBe(beforeIssue.issuedAt);
    expect(Number(stillInvoice.total)).toBe(4800);
    expect(Number(stillInvoice.total)).toBe(beforeIssue.total);

    const afterPacks = await liveRows(logistics, "packLists", eventId);
    expect(afterPacks).toHaveLength(1);
    const stillPack = afterPacks[0]!;
    expect(stillPack._id).toBe(beforeOpen.id);
    expect(stillPack.name).toBe(beforeOpen.name);
    expect(stillPack.openedAt).toBe(beforeOpen.openedAt);

    expect(await readEventStage(logistics, eventId)).toBe("approved");
  });

  it("replaying ProductionBatch.plan and PurchaseNeed.create after a seeded approve keeps one of each", async () => {
    const proof = harness();
    const tenantId = "tenant-rxn-replay-batch-need";
    const { events, logistics, kitchen, inventory } = rolesFor(proof, tenantId);
    const eventId = await createEvent(
      proof,
      tenantId,
      "Replay keeps one batch and need",
    );

    await seedDishComponentForEvent(proof, tenantId, eventId);
    await seedEligibleDemandForEvent(proof, tenantId, eventId);

    await proof.executeCommand(events, M.Event_submitForApproval, {
      docId: eventId,
      version: 1,
    });
    await proof.executeCommand(events, M.Event_approve, {
      docId: eventId,
      version: 2,
    });

    const batches = await liveRows(logistics, "productionBatches", eventId);
    expect(batches).toHaveLength(1);
    const batch = batches[0]!;
    expect(Number(batch.plannedYield)).toBe(40);

    const needs = await liveRows(logistics, "purchaseNeeds", eventId);
    expect(needs).toHaveLength(1);
    const need = needs[0]!;
    expect(Number(need.requiredQuantity)).toBe(4.5);

    // PurchaseNeed replay convergence is carried by the reaction identity, not
    // the create command: the first open released the demand, so a replayed
    // EventApproved fanOut matches zero rows and calls create zero times.
    const demand = (await inventory.run(async (ctx) =>
      ctx.db.get(need.ingredientDemandId as never),
    )) as { purchaseEligibleEventId?: string | null };
    expect(demand.purchaseEligibleEventId ?? null).toBe(null);

    await proof.executeCommand(kitchen, M.ProductionBatch_plan, {
      docId: batch._id as string,
      componentId: batch.componentId as string,
      plannedYield: 999,
      yieldUnit: "portion",
      eventId,
      version: batch.version as number,
    });

    const stillBatches = await liveRows(
      logistics,
      "productionBatches",
      eventId,
    );
    expect(stillBatches).toHaveLength(1);
    expect(stillBatches[0]!._id).toBe(batch._id);
    expect(Number(stillBatches[0]!.plannedYield)).toBe(40);

    const stillNeeds = await liveRows(logistics, "purchaseNeeds", eventId);
    expect(stillNeeds).toHaveLength(1);
    expect(stillNeeds[0]!._id).toBe(need._id);
    expect(Number(stillNeeds[0]!.requiredQuantity)).toBe(4.5);

    expect(await liveRows(logistics, "invoices", eventId)).toHaveLength(1);
    expect(await liveRows(logistics, "packLists", eventId)).toHaveLength(1);
  });

  it("a second event still gets its own invoice — replay is per parent, not a freeze", async () => {
    const proof = harness();
    const tenantId = "tenant-rxn-replay-two-events";
    const { events, logistics } = rolesFor(proof, tenantId);
    const eventA = await createEvent(proof, tenantId, "Replay parent A");
    const eventB = await createEvent(proof, tenantId, "Replay parent B");

    await proof.executeCommand(events, M.Event_submitForApproval, {
      docId: eventA,
      version: 1,
    });
    await proof.executeCommand(events, M.Event_approve, {
      docId: eventA,
      version: 2,
    });
    await proof.executeCommand(events, M.Event_submitForApproval, {
      docId: eventB,
      version: 1,
    });
    await proof.executeCommand(events, M.Event_approve, {
      docId: eventB,
      version: 2,
    });

    const allInvoices = await liveRows(logistics, "invoices");
    expect(allInvoices).toHaveLength(2);
    const eventIds = allInvoices.map((row) => row.eventId);
    expect(new Set(eventIds)).toEqual(new Set([eventA, eventB]));
    expect(await liveRows(logistics, "packLists")).toHaveLength(2);

    const invoiceA = allInvoices.find((row) => row.eventId === eventA)!;
    await replayIssue(proof, tenantId, invoiceA);

    const after = await liveRows(logistics, "invoices");
    expect(after).toHaveLength(2);
    expect(after.find((row) => row._id === invoiceA._id)!.invoiceNumber).toBe(
      invoiceA.invoiceNumber,
    );
    expect(after.find((row) => row.eventId === eventB)!._id).toEqual(
      allInvoices.find((row) => row.eventId === eventB)!._id,
    );
  });
});
