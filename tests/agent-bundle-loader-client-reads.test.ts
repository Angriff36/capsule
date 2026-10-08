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
      "queries:listEvent": [{ _id: "e1", clientId: "c7", status: "draft" }],
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
    expect(
      client.calls.find((c) => c.name === "queries:getClient")?.args,
    ).toEqual({ id: "c7" });
  });
});
