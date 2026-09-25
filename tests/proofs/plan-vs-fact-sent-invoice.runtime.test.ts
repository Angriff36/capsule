/**
 * Runtime proof (AC-407, §6.5 sent-invoice slice of the plan-vs-fact matrix):
 * after finance sends the event invoice, a later guest-count change keeps that
 * sent invoice exactly as recorded — same id, invoice number, status "sent",
 * money, issue stamp and send stamp. The sent bill is history: it is never
 * rewritten to the new forecast, reopened to draft, voided, or duplicated, and
 * replaying the same guest count writes no second invoice.
 *
 * Proof only — the commands already exist; nothing here adds commands.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  approveEvent,
  changeHeadcount,
  createPlannedEvent,
  harness,
  invoiceSnapshot,
  listedInvoiceFacts,
  readEventRow,
  rolesFor,
  sendInvoice,
  type InvoiceFactRow,
  type InvoiceSnapshot,
  type Proof,
} from "./plan-vs-fact-sent-invoice.runtime.helpers";

const NEW_HEADCOUNT = 60;
const QUOTED_PRICE = 4500;

type InvoiceState = {
  roles: ReturnType<typeof rolesFor>;
  eventId: string;
  snapshot: InvoiceSnapshot;
};

/** Seed the event at 40 guests, approve it, confirm the reaction-seeded draft,
 * send the invoice as finance, snapshot the sent row, then move the guest
 * count to 60. */
async function seedSentInvoiceThenChange(
  proof: Proof,
  tenantId: string,
  title: string,
): Promise<InvoiceState> {
  const roles = rolesFor(proof, tenantId);
  const { eventId, clientId } = await createPlannedEvent(
    proof,
    tenantId,
    title,
  );

  await approveEvent(proof, tenantId, eventId);

  // The EventApproved reaction seeded exactly one draft from the quoted price.
  const drafts = await listedInvoiceFacts(roles.finance, eventId);
  expect(drafts).toHaveLength(1);
  const draft: InvoiceFactRow = drafts[0]!;
  expect(draft.status).toBe("draft");
  expect(draft.issuedAt).toEqual(expect.any(Number));
  expect(draft.sentAt == null).toBe(true);
  expect(Number(draft.total)).toBe(QUOTED_PRICE);
  expect(Number(draft.amountDue)).toBe(QUOTED_PRICE);
  expect(Number(draft.amountPaid)).toBe(0);
  expect(Number(draft.taxAmount)).toBe(0);
  expect(Number(draft.discountAmount)).toBe(0);
  expect(draft.deletedAt ?? null).toBeNull();
  expect(typeof draft.invoiceNumber).toBe("string");
  expect((draft.invoiceNumber as string).length).toBeGreaterThan(0);

  await sendInvoice(proof, tenantId, draft._id);

  // The sent invoice as recorded, BEFORE any guest-count change.
  const sentRows = await listedInvoiceFacts(roles.finance, eventId);
  expect(sentRows).toHaveLength(1);
  const sent = sentRows[0]!;
  const snapshot = invoiceSnapshot(sent);
  expect(snapshot.status).toBe("sent");
  expect(snapshot.sentAt).toEqual(expect.any(Number));
  expect(snapshot.issuedAt).toEqual(expect.any(Number));
  expect(snapshot.total).toBe(QUOTED_PRICE);
  expect(snapshot.amountDue).toBe(QUOTED_PRICE);
  expect(snapshot.amountPaid).toBe(0);

  await changeHeadcount(proof, tenantId, eventId, NEW_HEADCOUNT);

  const event = await readEventRow(roles.events, eventId);
  expect(event.expectedHeadcount).toBe(NEW_HEADCOUNT);
  expect(eventId).toBeTruthy();
  expect(clientId).toBeTruthy();

  return { roles, eventId, snapshot };
}

/** The one live invoice, or a thrown error when the count is not 1. */
async function theOneLiveInvoice(
  actor: ReturnType<typeof rolesFor>["finance"],
  eventId: string,
): Promise<InvoiceFactRow> {
  const rows = await listedInvoiceFacts(actor, eventId);
  expect(rows).toHaveLength(1);
  return rows[0]!;
}

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

describe("runtime proof: AC-407 §6.5 sent invoice (plan vs fact)", () => {
  it("one headcount change after send keeps the sent invoice", async () => {
    const tenantId = "tenant-ac407-invoice-keep";
    const proof = harness();
    const { roles, eventId, snapshot } = await seedSentInvoiceThenChange(
      proof,
      tenantId,
      "AC-407 invoice keep",
    );

    const event = await readEventRow(roles.events, eventId);
    expect(event.expectedHeadcount).toBe(NEW_HEADCOUNT);
    expect(Number(event.quotedPrice)).toBe(QUOTED_PRICE);

    // Exactly one live invoice: the sent bill. The headcount change invents
    // no second invoice for the extra 20 guests.
    const row = await theOneLiveInvoice(roles.finance, eventId);
    expect(row._id).toBe(snapshot._id);
    expect(row.status).toBe("sent");
    expect(row.invoiceNumber).toBe(snapshot.invoiceNumber);
    expect(Number(row.subtotal)).toBe(snapshot.subtotal);
    expect(Number(row.taxAmount)).toBe(snapshot.taxAmount);
    expect(Number(row.discountAmount)).toBe(snapshot.discountAmount);
    expect(Number(row.total)).toBe(snapshot.total);
    expect(Number(row.amountDue)).toBe(snapshot.amountDue);
    expect(Number(row.amountPaid)).toBe(snapshot.amountPaid);
    expect(row.issuedAt).toBe(snapshot.issuedAt);
    expect(row.sentAt).toBe(snapshot.sentAt);
    expect(row.eventId).toBe(snapshot.eventId);
    expect(row.clientId).toBe(snapshot.clientId);
    expect(row.deletedAt ?? null).toBeNull();
    // Not reopened, voided, or marked paid.
    expect(row.status).not.toBe("draft");
    expect(row.status).not.toBe("voided");
    expect(row.status).not.toBe("paid");
  });

  it("replaying the same headcount after send does not rewrite the sent invoice", async () => {
    const tenantId = "tenant-ac407-invoice-replay";
    const proof = harness();
    const { roles, eventId, snapshot } = await seedSentInvoiceThenChange(
      proof,
      tenantId,
      "AC-407 invoice replay",
    );

    // Replay the identical headcount (same input, 60 again). A version bump
    // from the first change is tolerated: re-read and retry once.
    await changeHeadcount(proof, tenantId, eventId, NEW_HEADCOUNT);

    const event = await readEventRow(roles.events, eventId);
    expect(event.expectedHeadcount).toBe(NEW_HEADCOUNT);

    // Still exactly one live invoice, and the sent bill is untouched: no
    // second send stamp, no second invoice row.
    const row = await theOneLiveInvoice(roles.finance, eventId);
    expect(row._id).toBe(snapshot._id);
    expect(row.status).toBe("sent");
    expect(row.sentAt).toBe(snapshot.sentAt);
    expect(row.issuedAt).toBe(snapshot.issuedAt);
    expect(row.invoiceNumber).toBe(snapshot.invoiceNumber);
    expect(Number(row.total)).toBe(snapshot.total);
    expect(Number(row.amountDue)).toBe(snapshot.amountDue);
    expect(Number(row.amountPaid)).toBe(snapshot.amountPaid);
    expect(row.deletedAt ?? null).toBeNull();
  });
});
