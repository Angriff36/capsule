/**
 * Runtime proof (AC-282, AC-278): an imported pack list exposes where it came
 * from - the old event id, the page it was read from, when, each line's group
 * and what the reader could not read - through the same read the pack list
 * page uses, and importing the same event again makes no second pack list.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";
import { packGroups } from "../../src/features/logistics/PackListSourcePanel";

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

async function table(actor: Actor, name: string, tenantId: string) {
  return (await actor.run(async (ctx) =>
    (
      await (ctx.db.query as (t: string) => { collect(): Promise<unknown[]> })(
        name,
      ).collect()
    ).filter((row) => (row as { tenantId: string }).tenantId === tenantId),
  )) as Row[];
}

const PACK_ROW = {
  SourceEventID: "E-500",
  SourcePage: "eventpacklist.aspx?EventSak=500 (printed 2026-03-02)",
  ExtractedAt: "2026-03-02T15:04:00Z",
  Name: "Hollis wedding pack",
  Items: [
    { Item: "Chafing dish", Quantity: 6, Unit: "each", Group: "Buffet" },
    { Item: "Sterno", Quantity: 12, Unit: "each", Group: "Buffet" },
    { Item: "Linen 120 round", Quantity: 10, Group: "Tables" },
  ],
  ExtractionErrors: ['Line 4: quantity unreadable ("a few")'],
};

describe("runtime proof: pack list extraction provenance (AC-282, AC-278)", () => {
  it("an imported pack list exposes source event id, page/version, extraction time, grouping and any extraction errors, and re-importing the same event creates no second pack list", async () => {
    const tenantId = "tenant-packlist-provenance";
    const actor = harness().asRole({
      subject: "packlist-provenance-owner",
      role: "owner",
      tenantId,
    });

    expect(
      (
        await importRows(actor, "contacts", [
          { ContactID: "C-500", FirstName: "Ana", LastName: "Hollis" },
        ])
      ).committed,
    ).toBe(1);
    expect(
      (
        await importRows(actor, "events", [
          {
            EventID: "E-500",
            EventName: "Hollis Wedding",
            EventDate: "2026-06-20",
            StartTime: "16:00",
            EndTime: "23:00",
            ExpectedCount: 120,
            ClientID: "C-500",
            EventStatus: "Definite",
          },
        ])
      ).committed,
    ).toBe(1);

    const first = await importRows(actor, "pack_list", [PACK_ROW]);
    expect(first.committed).toBe(1);
    const packLists = await table(actor, "packLists", tenantId);
    expect(packLists).toHaveLength(1);
    const items = await table(actor, "packListItems", tenantId);
    expect(items.map((item) => item.description).sort()).toEqual([
      "Chafing dish",
      "Linen 120 round",
      "Sterno",
    ]);

    // The same read the pack list page's "From the old system" panel uses.
    const links = (await actor.query(api.sourceProvenance.listByCapsuleId, {
      capsuleId: String(packLists[0]!._id),
    })) as Array<{ externalId: string; rawSourceData?: string | null }>;
    expect(links).toHaveLength(1);
    expect(links[0]!.externalId).toBe("E-500");
    const imported = JSON.parse(String(links[0]!.rawSourceData)) as {
      sourceEventId: string;
      sourcePage: string;
      extractedAt: string;
      items: Array<{ description: string; group?: string }>;
      extractionErrors: string[];
    };
    expect(imported.sourceEventId).toBe("E-500");
    expect(imported.sourcePage).toBe(PACK_ROW.SourcePage);
    expect(imported.extractedAt).toBe(PACK_ROW.ExtractedAt);
    expect(imported.extractionErrors).toEqual(PACK_ROW.ExtractionErrors);
    expect(packGroups(imported.items)).toEqual([
      ["Buffet", 2],
      ["Tables", 1],
    ]);

    // The same event again: no second pack list, no extra lines.
    const again = await importRows(actor, "pack_list", [PACK_ROW]);
    expect(again.committed).toBe(0);
    expect(await table(actor, "packLists", tenantId)).toHaveLength(1);
    expect(await table(actor, "packListItems", tenantId)).toHaveLength(3);
  });
});
