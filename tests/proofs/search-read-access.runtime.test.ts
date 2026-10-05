/**
 * Runtime proof (PL-AUTH, AC-212 search reads): the search box (searchAll)
 * and the team chat record picker (searchLinkTargets) show a record only to
 * a caller who passes that kind's generated read policy. A driver or a
 * kitchen worker no longer sees client names or invoice numbers and amounts
 * from search. Synthetic workspace and records only.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

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

type Actor = ReturnType<ReturnType<typeof harness>["asRole"]>;

const now = Date.UTC(2026, 8, 26);

async function searchKinds(actor: Actor, query: string) {
  const hits = (await actor.query(api.search.searchAll, {
    query,
    now,
  })) as Array<{ kind: string }>;
  return hits.map((hit) => hit.kind).sort();
}

async function pickerKinds(actor: Actor, term: string) {
  const hits = (await actor.query(api.teamChat.searchLinkTargets, {
    term,
  })) as Array<{ kind: string }>;
  return hits.map((hit) => hit.kind).sort();
}

describe("runtime proof: search follows each record's read policy (AC-212)", () => {
  it("shows clients and invoices only to roles that may read them", async () => {
    const proof = harness();
    const tenantId = "tenant-search-read-access";
    const as = (role: string) =>
      proof.asRole({ subject: "search-read-" + role, role, tenantId });
    const owner = as("owner");

    const client = (await proof.executeCommand(
      owner,
      api.mutations.Client_createViaRegister,
      {
        clientType: "company",
        companyName: "Harbor Foods",
        // The test search fake reads every searched field; real Convex skips
        // a missing one. Fill all three client name fields.
        givenName: "Harbor",
        familyName: "Foods",
      },
    )) as { docId: string };
    await proof.executeCommand(owner, api.mutations.Invoice_createViaIssue, {
      clientId: client.docId,
      invoiceNumber: "INV-HARBOR",
      subtotal: 4200,
      total: 4200,
      taxAmount: 0,
      discountAmount: 0,
    });

    // Control: the owner finds the client by name and the invoice by number.
    expect(await searchKinds(owner, "Harbor")).toEqual(["client"]);
    expect(await searchKinds(owner, "#INV-HARBOR")).toEqual(["invoice"]);
    expect(await pickerKinds(owner, "Harbor")).toEqual(["client"]);

    // Sales reads clients but not invoices; finance reads both.
    const sales = as("sales_staff");
    expect(await searchKinds(sales, "Harbor")).toEqual(["client"]);
    expect(await searchKinds(sales, "#INV-HARBOR")).toEqual([]);
    expect(await pickerKinds(sales, "Harbor")).toEqual(["client"]);
    const finance = as("finance_staff");
    expect(await searchKinds(finance, "Harbor")).toEqual(["client"]);
    expect(await searchKinds(finance, "#INV-HARBOR")).toEqual(["invoice"]);

    // A driver and a kitchen worker read neither, in search or the picker.
    for (const role of ["driver", "kitchen_staff"]) {
      const worker = as(role);
      expect(await searchKinds(worker, "Harbor")).toEqual([]);
      expect(await searchKinds(worker, "#INV-HARBOR")).toEqual([]);
      expect(await pickerKinds(worker, "Harbor")).toEqual([]);
    }
  });
});
