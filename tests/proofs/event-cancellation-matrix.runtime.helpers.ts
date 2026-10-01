/**
 * Shared steps for the BE-20.2 cancellation matrix proof (AC-675..683):
 * walk an event to any stage the cancel allows, cancel it, and read the
 * cancellation receipts. Built on the PL-RETURNS harness. Assertion-free;
 * the test file owns every expect().
 */
import {
  M,
  returnsHarness,
  SAT,
  HOUR,
  type Row,
} from "./equipment-returns.runtime.helpers";
import { readReconciliationReceipts } from "./reconciliation-failure-isolation.runtime.helpers";

export { M, SAT, HOUR, returnsHarness, type Row };

export type Harness = ReturnType<typeof returnsHarness>;

export const CANCEL_STAGES = [
  "quote",
  "planning",
  "pending_approval",
  "approved",
  "sales_lock",
  "executing",
  "final",
] as const;
export type CancelStage = (typeof CANCEL_STAGES)[number];

/** An event with a venue and service style, so every stage step is allowed. */
export async function bookedEvent(h: Harness, title: string) {
  const client = await h.run(h.sales, M.Client_createViaRegister, {
    clientType: "company",
    companyName: `${title} client`,
  });
  return h.run(h.sales, M.Event_createViaPlanEngagement, {
    clientId: client.docId,
    title,
    eventType: "corporate dinner",
    venueName: "Proof Hall",
    serviceStyleName: "Plated",
    startsAt: SAT,
    endsAt: SAT + 6 * HOUR,
    expectedHeadcount: 40,
    primaryContactName: "Casey Matrix",
    budgetAmount: 3000,
    quotedPrice: 4500,
  });
}

/** Move a planning event forward to `stage` with the normal stage steps. A
 * quote-stage event has no public create, so it is placed there directly. */
export async function walkTo(h: Harness, eventId: string, stage: CancelStage) {
  if (stage === "quote") {
    await h.manager.run(async (ctx) =>
      ctx.db.patch(eventId as never, { stage: "quote" } as never),
    );
    return;
  }
  const ladder: Array<[CancelStage, unknown, Harness["events"]]> = [
    ["pending_approval", M.Event_submitForApproval, h.events],
    ["approved", M.Event_approve, h.events],
    ["sales_lock", M.Event_lockForSales, h.sales],
    ["executing", M.Event_beginExecution, h.events],
    ["final", M.Event_finalizeEvent, h.events],
  ];
  if (stage === "planning") return;
  for (const [reached, cmd, actor] of ladder) {
    await h.run(actor, cmd, {
      docId: eventId,
      version: (await h.read(eventId)).version,
    });
    if (reached === stage) return;
  }
}

export async function cancel(h: Harness, eventId: string, reason: string) {
  return h.run(h.events, M.Event_cancel, {
    docId: eventId,
    version: (await h.read(eventId)).version,
    reason,
  });
}

/** The cancellation receipts written for one event. */
export async function cancelReceipts(
  h: Harness,
  tenantId: string,
  eventId: string,
) {
  return (await readReconciliationReceipts(h.events, tenantId)).filter(
    (row) =>
      row.eventId === eventId && row.affectedDomains.includes("cancellation"),
  );
}

/** Rows of one table that belong to one event and are not deleted. */
export async function eventRows(h: Harness, table: string, eventId: string) {
  return (await h.all(table)).filter(
    (row) => row.eventId === eventId && row.deletedAt == null,
  );
}
