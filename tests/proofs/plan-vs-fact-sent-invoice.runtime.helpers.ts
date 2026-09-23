/**
 * Seed + readers for the AC-407 §6.5 sent-invoice slice of the plan-vs-fact
 * matrix runtime proof: approve the planned event, let the EventApproved
 * reaction seed the draft invoice, send it as finance, snapshot the sent row,
 * and move the guest count. Reuses the AC-390 prep harness for the planned
 * event (quotedPrice 4500). Assertion-free; the test file owns every expect().
 */
import { api } from "../../convex/_generated/api";
import {
  createPlannedEvent,
  harness,
  runner,
  S,
  type Proof,
  type Role,
} from "./headcount-prep-reconciliation.runtime.helpers";

export { createPlannedEvent, harness, runner, S };
export type { Proof, Role };

/** Sales / events / finance actors for one tenant. */
export function rolesFor(proof: Proof, tenantId: string) {
  const mk = (name: string, role: string) =>
    proof.asRole({ subject: `${name}-${tenantId}`, role, tenantId });
  return {
    sales: mk("sales", "sales_manager"),
    events: mk("event-manager", "event_manager"),
    finance: mk("finance", "finance_manager"),
  };
}

export type InvoiceFactRow = {
  _id: string;
  eventId?: string | null;
  clientId: string;
  invoiceNumber?: string | null;
  status: string;
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  total: number;
  amountPaid: number;
  amountDue: number;
  issuedAt?: number | null;
  sentAt?: number | null;
  version: number;
  deletedAt?: number | null;
};

export type InvoiceSnapshot = {
  _id: string;
  eventId: string;
  clientId: string;
  invoiceNumber: string;
  status: string;
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  total: number;
  amountPaid: number;
  amountDue: number;
  issuedAt: number;
  sentAt: number;
  version: number;
  deletedAt: number | null;
};

/** The identity + money slice the proof compares after a guest-count change. */
export function invoiceSnapshot(row: InvoiceFactRow): InvoiceSnapshot {
  if (row.issuedAt == null || row.sentAt == null)
    throw new Error(`Invoice ${row._id} is not sent history`);
  return {
    _id: row._id,
    eventId: row.eventId as string,
    clientId: row.clientId,
    invoiceNumber: row.invoiceNumber as string,
    status: row.status,
    subtotal: Number(row.subtotal),
    taxAmount: Number(row.taxAmount),
    discountAmount: Number(row.discountAmount),
    total: Number(row.total),
    amountPaid: Number(row.amountPaid),
    amountDue: Number(row.amountDue),
    issuedAt: row.issuedAt,
    sentAt: row.sentAt,
    version: row.version,
    deletedAt: row.deletedAt ?? null,
  };
}

/** Live (deletedAt null or absent) invoices for one event, read the same way
 * the reaction-replay proof reads `invoices`. */
export function listedInvoiceFacts(
  actor: Role,
  eventId: string,
): Promise<InvoiceFactRow[]> {
  return actor
    .run(
      async (ctx) =>
        ctx.db.query("invoices").collect() as unknown as Promise<
          InvoiceFactRow[]
        >,
    )
    .then((rows) =>
      rows.filter((row) => row.deletedAt == null && row.eventId === eventId),
    );
}

export type EventRow = {
  expectedHeadcount: number;
  quotedPrice?: number;
  version: number;
};

export async function readEventRow(
  actor: Role,
  eventId: string,
): Promise<EventRow> {
  return (await actor.run(async (ctx) =>
    ctx.db.get(eventId as never),
  )) as never as EventRow;
}

/** Approve the planned event (submit then approve). Reads the live event
 * version first; retries the pair once on a version mismatch; other errors
 * propagate. */
export async function approveEvent(
  proof: Proof,
  tenantId: string,
  eventId: string,
  retryVersion?: number,
): Promise<void> {
  const { events } = rolesFor(proof, tenantId);
  const runEvent = runner(proof, events);
  const event = await readEventRow(events, eventId);
  const version = retryVersion ?? event.version;
  try {
    await runEvent(api.mutations.Event_submitForApproval, {
      docId: eventId,
      version,
    });
    await runEvent(api.mutations.Event_approve, {
      docId: eventId,
      version: version + 1,
    });
  } catch (error) {
    if (retryVersion !== undefined) throw error;
    if (!String(error).includes("VERSION_MISMATCH")) throw error;
    const fresh = await readEventRow(events, eventId);
    await approveEvent(proof, tenantId, eventId, fresh.version);
  }
}

/** Send the event's draft invoice as finance, using its live version. */
export async function sendInvoice(
  proof: Proof,
  tenantId: string,
  invoiceId: string,
): Promise<void> {
  const { finance } = rolesFor(proof, tenantId);
  const sent = (await finance.run(async (ctx) =>
    ctx.db.get(invoiceId as never),
  )) as { version: number };
  await runner(proof, finance)(api.mutations.Invoice_send, {
    docId: invoiceId,
    version: sent.version,
  });
}

/** Move the guest count as the event manager. Retries once on a version
 * mismatch by re-reading the event version; other errors propagate. */
export async function changeHeadcount(
  proof: Proof,
  tenantId: string,
  eventId: string,
  newHeadcount: number,
  retryVersion?: number,
): Promise<void> {
  const roles = rolesFor(proof, tenantId);
  const runEvent = runner(proof, roles.events);
  const event = await readEventRow(roles.events, eventId);
  try {
    await runEvent(api.mutations.Event_changeHeadcount, {
      docId: eventId,
      version: retryVersion ?? event.version,
      newHeadcount,
    });
  } catch (error) {
    if (retryVersion !== undefined) throw error;
    if (!String(error).includes("VERSION_MISMATCH")) throw error;
    await changeHeadcount(
      proof,
      tenantId,
      eventId,
      newHeadcount,
      event.version,
    );
  }
}
