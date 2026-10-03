/**
 * Runtime proof: a company row or a pack list imported again from the old
 * system is compared with what Capsule holds (PL-SOURCE-DATASETS open leg,
 * same three-way rule as PL-SOURCE-DELTA AC-272 / AC-273).
 *
 * - Company: a changed billing address follows the old system unless a
 *   person changed it in Capsule; a changed name or payment terms waits on
 *   the review list; no second company is made.
 * - Pack list: a new line is added and a changed amount follows the old
 *   system; a line a packer changed, or a line the old system dropped, waits
 *   on the review list; Capsule's own lines are never compared; the same
 *   list again changes nothing.
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
type ImportResult = {
  committed: number;
  skipped: number;
  pending: number;
  updated?: number;
  conflicted?: number;
};

async function importRows(actor: Actor, datasetType: string, rows: unknown[]) {
  return (await (actor as unknown as ActionRunner).action(
    api.quickImport.importFile,
    { datasetType, sourceSystem: "tpp_legacy", rows },
  )) as ImportResult;
}

async function table(actor: Actor, name: string, tenantId: string) {
  return (await actor.run(async (ctx) =>
    (
      await (ctx.db.query as (t: string) => { collect(): Promise<unknown[]> })(
        name,
      ).collect()
    ).filter(
      (row) =>
        (row as { tenantId: string }).tenantId === tenantId &&
        (row as { deletedAt?: number | null }).deletedAt == null,
    ),
  )) as Row[];
}

const COMPANY = {
  CompanyID: "CO-7",
  CompanyName: "Northwind Traders",
  ClientType: "Corporate",
  BillingAddress: "1 Wacker Dr",
  City: "Chicago",
  State: "IL",
  ZipCode: "60606",
  PaymentTerms: "Net 15",
};

describe("runtime proof: company and pack list repeat imports", () => {
  it("a changed company row moves the untouched address and puts the name and terms on the review list", async () => {
    const tenantId = "tenant-company-delta";
    const owner = harness().asRole({
      subject: "company-delta-owner",
      role: "owner",
      tenantId,
    });
    expect((await importRows(owner, "contacts", [COMPANY])).committed).toBe(1);
    const link = (await table(owner, "externalRecordLinks", tenantId)).find(
      (l) => l.recordType === "company",
    )!;
    expect(JSON.parse(String(link.appliedValues)).city).toBe("Chicago");

    // The old system moves the office and renames the company, new terms.
    const revised = {
      ...COMPANY,
      CompanyName: "Northwind Foods",
      BillingAddress: "200 Main St",
      City: "Evanston",
      ZipCode: "60201",
      PaymentTerms: "Net 30",
    };
    const second = await importRows(owner, "contacts", [revised]);
    expect(second.committed).toBe(0);
    expect(second.conflicted).toBe(1);
    expect(await table(owner, "clients", tenantId)).toHaveLength(1);

    const company = (await owner.query(api.queries.getClient, {
      id: link.capsuleId as never,
    })) as Row;
    expect(company).toMatchObject({
      companyName: "Northwind Traders",
      addressLine1: "200 Main St",
      city: "Evanston",
      postalCode: "60201",
      paymentTermsDays: 15,
    });
    const fields = (await table(owner, "importConflicts", tenantId))
      .map((c) => c.field)
      .sort();
    expect(fields).toEqual(["companyName", "paymentTermsDays"]);

    // A person corrects the city; the old system changes it again: kept.
    await owner.mutation(api.mutations.Client_changeContact, {
      docId: link.capsuleId as never,
      addressLine1: "200 Main St",
      city: "Evanston North",
      region: "IL",
      postalCode: "60201",
    });
    const third = await importRows(owner, "contacts", [
      { ...revised, City: "Skokie" },
    ]);
    expect(third.conflicted).toBe(1);
    const after = (await owner.query(api.queries.getClient, {
      id: link.capsuleId as never,
    })) as Row;
    expect(after.city).toBe("Evanston North");
    const city = (await table(owner, "importConflicts", tenantId)).find(
      (c) => c.field === "city",
    )!;
    expect(JSON.parse(String(city.sourceValue))).toBe("Skokie");

    // "Use the new value" works for the address, not for the name.
    await (owner as unknown as ActionRunner).action(
      api.importSourceDelta.takeSourceValue,
      { conflictId: city._id },
    );
    expect(
      (
        (await owner.query(api.queries.getClient, {
          id: link.capsuleId as never,
        })) as Row
      ).city,
    ).toBe("Skokie");
    const name = (await table(owner, "importConflicts", tenantId)).find(
      (c) => c.field === "companyName",
    )!;
    await expect(
      (owner as unknown as ActionRunner).action(
        api.importSourceDelta.takeSourceValue,
        { conflictId: name._id },
      ),
    ).rejects.toThrow(/Company name on the record/);
  });

  it("a changed pack list adds new lines and new amounts, and holds a packer's change and dropped lines for review", async () => {
    const tenantId = "tenant-packlist-delta";
    const owner = harness().asRole({
      subject: "packlist-delta-owner",
      role: "owner",
      tenantId,
    });
    await importRows(owner, "contacts", [
      { ContactID: "C-900", FirstName: "Ana", LastName: "Hollis" },
    ]);
    await importRows(owner, "events", [
      {
        EventID: "E-900",
        EventName: "Hollis Wedding",
        EventDate: "2026-06-20",
        StartTime: "16:00",
        EndTime: "23:00",
        ExpectedCount: 120,
        ClientID: "C-900",
        EventStatus: "Definite",
      },
    ]);
    const packRow = (items: unknown[]) => ({
      SourceEventID: "E-900",
      SourcePage: "eventpacklist.aspx?EventSak=900",
      ExtractedAt: "2026-03-02T15:04:00Z",
      Name: "Hollis wedding pack",
      Items: items,
    });
    const firstItems = [
      { Item: "Chafing dish", Quantity: 6, Unit: "each" },
      { Item: "Sterno", Quantity: 12, Unit: "each" },
      { Item: "Linen 120 round", Quantity: 10, Unit: "each" },
      { Item: "Water pitcher", Quantity: 8, Unit: "each" },
    ];
    expect(
      (await importRows(owner, "pack_list", [packRow(firstItems)])).committed,
    ).toBe(1);
    const items = async () => await table(owner, "packListItems", tenantId);
    const line = async (description: string) =>
      (await items()).find((item) => item.description === description)!;
    const packListId = String((await line("Sterno")).packListId);

    // A packer raises the linens to 12; someone adds a line of their own.
    const linen = await line("Linen 120 round");
    await owner.mutation(api.mutations.PackListItem_adjustQuantity, {
      docId: linen._id as never,
      requiredQuantity: 12,
    });
    await owner.mutation(api.mutations.PackListItem_createViaAddItem, {
      packListId: packListId as never,
      description: "Extra tongs",
      requiredQuantity: 4,
      unit: "each",
    });

    // The old system: more sterno, linens 14, pitchers dropped, a new cake stand.
    const revised = packRow([
      { Item: "Chafing dish", Quantity: 6, Unit: "each" },
      { Item: "Sterno", Quantity: 18, Unit: "each" },
      { Item: "Linen 120 round", Quantity: 14, Unit: "each" },
      { Item: "Cake stand", Quantity: 1, Unit: "each" },
    ]);
    const second = await importRows(owner, "pack_list", [revised]);
    expect(second.committed).toBe(0);
    expect(second.conflicted).toBe(1);
    expect(await table(owner, "packLists", tenantId)).toHaveLength(1);

    expect(Number((await line("Sterno")).requiredQuantity)).toBe(18);
    expect(Number((await line("Cake stand")).requiredQuantity)).toBe(1);
    expect(Number((await line("Linen 120 round")).requiredQuantity)).toBe(12);
    expect(await line("Water pitcher")).toBeDefined();
    expect(Number((await line("Extra tongs")).requiredQuantity)).toBe(4);

    const conflicts = await table(owner, "importConflicts", tenantId);
    expect(conflicts.map((c) => c.field).sort()).toEqual([
      "line:Linen 120 round",
      "line:Water pitcher",
    ]);
    const linenItem = conflicts.find(
      (c) => c.field === "line:Linen 120 round",
    )!;
    expect(JSON.parse(String(linenItem.capsuleValue))).toBe("12 each");
    expect(JSON.parse(String(linenItem.sourceValue))).toBe("14 each");

    // The same list again: nothing new is written or raised.
    const count = (await items()).length;
    const third = await importRows(owner, "pack_list", [revised]);
    expect(third.updated ?? 0).toBe(0);
    expect(third.conflicted ?? 0).toBe(0);
    expect((await items()).length).toBe(count);
    expect(await table(owner, "importConflicts", tenantId)).toHaveLength(2);

    // "Use the new value" takes the old system's linen count.
    await (owner as unknown as ActionRunner).action(
      api.importSourceDelta.takeSourceValue,
      { conflictId: linenItem._id },
    );
    expect(Number((await line("Linen 120 round")).requiredQuantity)).toBe(14);
    // A dropped line is not removed by the import; a person decides.
    const dropped = conflicts.find((c) => c.field === "line:Water pitcher")!;
    await expect(
      (owner as unknown as ActionRunner).action(
        api.importSourceDelta.takeSourceValue,
        { conflictId: dropped._id },
      ),
    ).rejects.toThrow(/Pack line "Water pitcher" on the record/);
  });
});
