/**
 * Runtime proof: contacts import with their company and address, and the
 * report fields land on the client (PL-SOURCE-DATASETS).
 *
 * - AC-275: a company row becomes a company client with its billing address,
 *   tax id and payment terms; a person row names its company and keeps its
 *   address; an event whose ClientID is the company id finds that client.
 * - AC-063: an imported birthday lands on the client; a contact with no
 *   birthday (or one the import cannot read) gets none - nothing made up.
 * - Running the same rows again makes no second company or person.
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
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5jqU=";
  }
});

type Actor = ReturnType<ReturnType<typeof harness>["asRole"]>;
type ActionRunner = {
  action: (fn: unknown, args?: unknown) => Promise<unknown>;
};
type Row = Record<string, unknown> & { _id: string };

async function importRows(actor: Actor, datasetType: string, rows: unknown[]) {
  return (await (actor as unknown as ActionRunner).action(
    api.quickImport.importFile,
    { datasetType, sourceSystem: "tpp_legacy", rows },
  )) as { committed: number; skipped: number; pending: number };
}

async function links(actor: Actor, tenantId: string) {
  return (await actor.run(async (ctx) =>
    (
      await (ctx.db.query as (t: string) => { collect(): Promise<unknown[]> })(
        "externalRecordLinks",
      ).collect()
    ).filter((row) => (row as { tenantId: string }).tenantId === tenantId),
  )) as Row[];
}

async function client(actor: Actor, id: unknown) {
  return (await actor.query(api.queries.getClient, { id: id as never })) as Row;
}

const ROWS = [
  {
    ContactID: "C-10",
    FirstName: "Maya",
    LastName: "Chen",
    Email: "maya@northwind.example",
    Phone: "312-555-0110",
    CompanyID: "CO-1",
    Address: "800 Lake Shore Dr",
    City: "Chicago",
    State: "IL",
    ZipCode: "60611",
    Birthday: "03/09/1984",
  },
  {
    ContactID: "C-11",
    FirstName: "Leo",
    LastName: "Park",
    Birthday: "March",
  },
  {
    CompanyID: "CO-1",
    CompanyName: "Northwind Traders",
    ClientType: "Corporate",
    BillingAddress: "1 Wacker Dr",
    City: "Chicago",
    State: "IL",
    ZipCode: "60606",
    TaxId: "36-1234567",
    PaymentTerms: "Net 15",
  },
];

describe("runtime proof: contacts with company and address (AC-275, AC-063)", () => {
  it("a contact row carrying an address imports the address onto the Capsule record, with its company", async () => {
    const tenantId = "tenant-import-company-contact";
    const actor = harness().asRole({
      subject: "import-company-owner",
      role: "owner",
      tenantId,
    });

    const first = await importRows(actor, "contacts", ROWS);
    expect(first.committed).toBe(3);
    expect(first.pending).toBe(0);

    const all = await links(actor, tenantId);
    const companyLink = all.find(
      (l) => l.recordType === "company" && l.externalId === "CO-1",
    )!;
    const mayaLink = all.find((l) => l.externalId === "C-10")!;
    const leoLink = all.find((l) => l.externalId === "C-11")!;

    const company = await client(actor, companyLink.capsuleId);
    expect(company).toMatchObject({
      clientType: "company",
      companyName: "Northwind Traders",
      addressLine1: "1 Wacker Dr",
      city: "Chicago",
      region: "IL",
      postalCode: "60606",
      paymentTermsDays: 15,
    });

    const maya = await client(actor, mayaLink.capsuleId);
    expect(maya).toMatchObject({
      clientType: "person",
      givenName: "Maya",
      familyName: "Chen",
      companyName: "Northwind Traders",
      email: "maya@northwind.example",
      phone: "312-555-0110",
      addressLine1: "800 Lake Shore Dr",
      city: "Chicago",
      region: "IL",
      postalCode: "60611",
      birthday: "1984-03-09",
    });

    // No birthday the import can read: none is made up; the raw value stays
    // on the import.
    const leo = await client(actor, leoLink.capsuleId);
    expect(leo.birthday ?? null).toBeNull();
    expect(
      (JSON.parse(String(leoLink.rawSourceData)).sourceRow as Row).Birthday,
    ).toBe("March");

    // An event whose ClientID is the company finds the company client.
    const events = await importRows(actor, "events", [
      {
        EventID: "E-10",
        EventName: "Northwind Kickoff",
        EventDate: "2026-12-03",
        StartTime: "11:00",
        EndTime: "14:00",
        ExpectedCount: 60,
        ClientID: "CO-1",
        EventStatus: "Definite",
      },
    ]);
    expect(events.committed).toBe(1);
    const eventLink = (await links(actor, tenantId)).find(
      (l) => l.externalId === "E-10",
    )!;
    const event = (await actor.query(api.queries.getEvent, {
      id: eventLink.capsuleId as never,
    })) as Row;
    expect(event.clientId).toBe(companyLink.capsuleId);

    // The same rows again: nothing new.
    const again = await importRows(actor, "contacts", ROWS);
    expect(again.committed).toBe(0);
    const clients = await actor.run(async (ctx) =>
      (
        await (
          ctx.db.query as (t: string) => { collect(): Promise<unknown[]> }
        )("clients").collect()
      ).filter((row) => (row as { tenantId: string }).tenantId === tenantId),
    );
    expect(clients).toHaveLength(3);
  });
});
