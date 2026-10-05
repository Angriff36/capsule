/**
 * AC-091 (PR05-08): bringing old records over (contacts, past events with
 * their revenue, and money rows of every kind) sends no email, starts no
 * charge, makes no invoice or payment, and schedules no reminder or other
 * job. A new invoice made in Capsule afterwards still issues and sends as
 * normal.
 */
import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  M,
  harness,
  invoicesOf,
  newClient,
  ownerOf,
  type Actor,
} from "./event-invoice.runtime.helpers";

const act = (actor: Actor) =>
  actor as unknown as {
    action: (fn: unknown, args?: unknown) => Promise<unknown>;
  };
const importFile = (owner: Actor, datasetType: string, rows: unknown[]) =>
  act(owner).action(api.quickImport.importFile, {
    datasetType,
    sourceSystem: "tpp_legacy",
    rows,
  }) as Promise<{ committed: number }>;

/** Jobs waiting to run (reminders, email, sync, webhooks all go here). */
const scheduled = (ctx: unknown) =>
  (
    ctx as {
      db: {
        system: {
          query: (table: "_scheduled_functions") => {
            collect: () => Promise<{ name: string }[]>;
          };
        };
      };
    }
  ).db.system
    .query("_scheduled_functions")
    .collect();

describe("historical import has no side effects (AC-091)", () => {
  it("old contacts, events and money rows start nothing; a new invoice still sends", async () => {
    const proof = harness();
    const tenantId = "tenant-ac091";
    const owner = await ownerOf(proof, tenantId, "o-ac091");
    const before = await owner.run(async (ctx) => ({
      jobs: (await scheduled(ctx)).length,
      events: (await ctx.db.query("manifestEvents").collect()).length,
    }));

    expect(
      (
        await importFile(owner, "contacts", [
          {
            ContactID: "C-1",
            FirstName: "Old",
            LastName: "Client",
            Email: "old-client@example.com",
            Phone: "555-0101",
          },
        ])
      ).committed,
    ).toBe(1);
    expect(
      (
        await importFile(owner, "events", [
          {
            EventID: "E-1",
            EventName: "Past wedding",
            ClientID: "C-1",
            EventDate: "2024-06-15",
            StartTime: "18:00",
            ExpectedCount: 120,
            TotalRevenue: "12500.00",
            EventStatus: "Completed",
          },
        ])
      ).committed,
    ).toBe(1);
    const moneyRows = [
      ["P-1", "5000.00", "Deposit"],
      ["P-2", "7500.00", "Balance Payment"],
      ["P-3", "(250.00)", "Refund"],
      ["P-4", "0.00", "Payment"],
      ["P-5", "12500.00", "Invoice"],
    ].map(([PaymentID, PaymentAmount, PaymentType]) => ({
      PaymentID,
      PaymentAmount,
      PaymentType,
      EventID: "E-1",
      InvoiceID: "OLD-77",
      PaymentDate: "2024-06-01",
      PaymentMethod: "Check",
    }));
    expect((await importFile(owner, "payments", moneyRows)).committed).toBe(
      moneyRows.length,
    );

    const after = await owner.run(async (ctx) => ({
      jobs: (await scheduled(ctx)).map((job) => job.name),
      eventTypes: (
        (await ctx.db.query("manifestEvents").collect()) as { type: string }[]
      )
        .slice(before.events)
        .map((row) => row.type),
      payments: (await ctx.db.query("payments").collect()).length,
    }));
    // Nothing waits to run: no email, reminder, charge, sync or webhook job.
    expect(after.jobs.length).toBe(before.jobs);
    expect(after.payments).toBe(0);
    expect(await invoicesOf(owner, tenantId)).toHaveLength(0);
    expect(
      after.eventTypes.filter((type) =>
        /Invoice|Payment|Reminder|Email|Sent|Charge/.test(type),
      ),
    ).toEqual([]);

    // A new invoice made in Capsule still issues and sends as normal.
    const clientId = await newClient(proof, owner, "AC-091 new client");
    const issued = (await proof.executeCommand(
      owner,
      M.Invoice_createViaIssue,
      {
        clientId,
        invoiceSequence: 0,
        subtotal: 300,
        taxAmount: 0,
        discountAmount: 0,
        total: 300,
      },
    )) as { docId: string };
    const draft = (await owner.run(async (ctx) =>
      ctx.db.get(issued.docId as never),
    )) as { version: number };
    await proof.executeCommand(owner, M.Invoice_send, {
      docId: issued.docId,
      version: draft.version,
    });
    const sent = (await invoicesOf(owner, tenantId)).find(
      (row) => row._id === issued.docId,
    );
    expect(sent).toMatchObject({ status: "sent", total: 300 });
  });
});
