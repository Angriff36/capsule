// The assistant's event loader reads clients without the full client list:
// name matching uses the email+phone list, and an existing event reads only
// its own client.
import { getFunctionName } from "convex/server";
import { describe, expect, it } from "vitest";
import { CapsuleEventBundleStateLoader } from "../src/agent/CapsuleEventBundleStateLoader";

function fakeClient(answers: Record<string, unknown>) {
  const calls: Array<{ name: string; args: Record<string, string> }> = [];
  return {
    calls,
    query: async (reference: unknown, args: Record<string, string>) => {
      const name = getFunctionName(reference as never);
      calls.push({ name, args });
      return answers[name] ?? [];
    },
  };
}

describe("assistant event loader client reads", () => {
  it("matches client names from the email and phone list", async () => {
    const client = fakeClient({
      "clientDirectory:listWithContacts": [
        {
          _id: "c1",
          status: "active",
          clientType: "company",
          companyName: "Acme",
          email: "a@acme.test",
        },
      ],
    });
    const loader = new CapsuleEventBundleStateLoader(client);
    const candidates = await loader.loadCatalogCandidates();
    expect(candidates.clients).toEqual([
      { id: "c1", name: "Acme", aliases: ["a@acme.test"] },
    ]);
    expect(client.calls.map((c) => c.name)).not.toContain("queries:listClient");
  });

  it("reads only the event's own client", async () => {
    const client = fakeClient({
      "queries:getEvent": { _id: "e1", clientId: "c7", status: "draft" },
      "queries:getClient": {
        _id: "c7",
        email: "host@example.test",
        phone: "555-0100",
      },
    });
    const loader = new CapsuleEventBundleStateLoader(client);
    const existing = await loader.loadExisting("e1");
    expect(existing.client).toMatchObject({
      email: "host@example.test",
      phone: "555-0100",
    });
    const names = client.calls.map((c) => c.name);
    expect(names).not.toContain("queries:listClient");
    // Only this event's rows, not the company's whole history.
    for (const whole of [
      "queries:listEvent",
      "queries:listClientContact",
      "queries:listEventDish",
      "queries:listEventTimelineActivity",
      "queries:listPrepTask",
      "queries:listPackList",
      "queries:listPackListItem",
      "queries:listEventAssignment",
    ])
      expect(names).not.toContain(whole);
    expect(
      client.calls.find((c) => c.name === "queries:listClientContactByClientId")
        ?.args,
    ).toEqual({ clientId: "c7" });
    expect(
      client.calls.find((c) => c.name === "queries:getClient")?.args,
    ).toEqual({ id: "c7" });
  });

  it("reads the bundle's own invoice, proposal and orders, not every one", async () => {
    const client = fakeClient({
      "agentHistoryWindow:bundleDirectory": {
        invoices: [{ _id: "i1", invoiceNumber: "1234", status: "draft" }],
        payments: [],
        proposals: [{ _id: "p1", proposalNumber: "1234", status: "draft" }],
        vendorOrders: [],
        proposalLines: [{ _id: "l1", proposalId: "p1", description: "Tacos" }],
        vendorOrderLines: [],
      },
    });
    const loader = new CapsuleEventBundleStateLoader(client);
    const directory = await loader.loadDirectory("1234", "e1");
    expect(directory.invoices.map((row) => row.id)).toEqual(["i1"]);
    expect(directory.proposals[0]?.lineDescriptions).toEqual(["Tacos"]);
    const names = client.calls.map((c) => c.name);
    for (const whole of [
      "queries:listInvoice",
      "queries:listPayment",
      "queries:listProposal",
      "queries:listVendorOrder",
      "queries:listProposalLineItem",
      "queries:listVendorOrderLine",
    ])
      expect(names).not.toContain(whole);
    expect(
      client.calls.find((c) => c.name === "agentHistoryWindow:bundleDirectory")
        ?.args,
    ).toEqual({ identity: "1234", eventId: "e1" });
  });
});
