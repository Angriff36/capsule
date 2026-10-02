/**
 * Runtime proof: the documented TPP field maps are executed (PL-SOURCE-DATASETS).
 *
 * - AC-279: an imported venue row lands with its address, capacity, contact,
 *   access / catering notes, load-in instructions and parking.
 * - AC-276: an imported closed lead keeps its old stage word for word, its
 *   event date and its close date; an open lead stays open.
 * - AC-274: every event field the documented map sends to the event lands on
 *   it (notes and special requirements both), and the literal EventStatus and
 *   every column stay on the import link.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";
import { TPP_FIELD_DISPOSITIONS } from "../../src/lib/tppFieldDisposition";

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
  )) as { committed: number; pending: number };
}

async function tableRows(actor: Actor, table: string, tenantId: string) {
  const rows = await actor.run(async (ctx) =>
    (
      await (ctx.db.query as (t: string) => { collect(): Promise<unknown[]> })(
        table,
      ).collect()
    ).filter((row) => (row as { tenantId: string }).tenantId === tenantId),
  );
  return rows as Row[];
}

async function linkFor(actor: Actor, tenantId: string, externalId: string) {
  const link = (await tableRows(actor, "externalRecordLinks", tenantId)).find(
    (l) => l.externalId === externalId,
  );
  if (!link) throw new Error(`no link for ${externalId}`);
  return link;
}

function owner(tenantId: string) {
  return harness().asRole({
    subject: `${tenantId}-owner`,
    role: "owner",
    tenantId,
  });
}

describe("runtime proof: documented TPP field maps are executed", () => {
  it("an imported venue row materializes a Venue with its address, capacity, contact and notes intact", async () => {
    const tenantId = "tenant-import-venue-values";
    const actor = owner(tenantId);
    const result = await importRows(actor, "venues", [
      {
        VenueID: "V-900",
        VenueName: "Lakeside Barn",
        VenueType: "Office",
        Address: "12 Shore Lane",
        City: "Madison",
        State: "WI",
        ZipCode: "53703",
        Capacity: 180,
        ContactName: "Dana Holt",
        ContactPhone: "608-555-0101",
        ContactEmail: "dana@lakeside.example",
        AccessNotes: "Gate code 4411",
        CateringNotes: "No open flame in the barn",
        LoadInInstructions: "Back door by the silo, ramp only",
        ParkingInfo: "Vans on the gravel lot, not the lawn",
        CreatedDate: "2025-04-02",
      },
    ]);
    expect(result.committed).toBe(1);
    const link = await linkFor(actor, tenantId, "V-900");
    const venue = (await actor.query(api.queries.getVenue, {
      id: link.capsuleId as never,
    })) as Row;
    expect(venue).toMatchObject({
      name: "Lakeside Barn",
      addressLine1: "12 Shore Lane",
      city: "Madison",
      region: "WI",
      postalCode: "53703",
      capacity: 180,
      contactName: "Dana Holt",
      contactPhone: "608-555-0101",
      contactEmail: "dana@lakeside.example",
      accessNotes: "Gate code 4411",
      cateringNotes: "No open flame in the barn",
      loadInInstructions: "Back door by the silo, ramp only",
      logisticsNotes: "Vans on the gravel lot, not the lawn",
    });
  });

  it("an imported closed lead keeps stage, rawStage, closeDate and source, and an open lead stays open", async () => {
    const tenantId = "tenant-import-lead-history";
    const actor = owner(tenantId);
    const result = await importRows(actor, "leads", [
      {
        LeadID: "L-1",
        OpportunityName: "Garcia Wedding",
        ClientID: "C-1",
        Stage: "Closed Won",
        Probability: 100,
        EstimatedValue: 18000,
        EventDate: "2025-06-14",
        Source: "Website",
        CloseDate: "2025-02-01",
      },
      {
        LeadID: "L-2",
        OpportunityName: "Acme Holiday Party",
        ClientID: "C-2",
        Stage: "Qualified",
        Probability: 40,
        EstimatedValue: 6500,
        EventDate: "2026-12-12",
        Source: "Referral",
      },
    ]);
    expect(result.committed).toBe(2);
    const leads = await tableRows(actor, "leads", tenantId);
    const closed = leads.find((lead) => lead.companyName === "Garcia Wedding")!;
    const open = leads.find(
      (lead) => lead.companyName === "Acme Holiday Party",
    )!;

    expect(closed.sourceStage).toBe("Closed Won");
    expect(closed.closedAt).toBe(new Date("2025-02-01T00:00:00").getTime());
    expect(closed.eventDate).toBe(new Date("2025-06-14T00:00:00").getTime());
    expect(closed.source).toBe("Website");
    expect(closed.estimatedValue).toBe(18000);

    expect(open.closedAt ?? null).toBeNull();
    expect(open.stage).toBe("qualified");
    expect(open.sourceStage).toBe("Qualified");
    expect(open.source).toBe("Referral");
    expect(open.notes).toBe("TPP client C-2");
  });

  it("the executed event mapping covers the documented fields and preserves literal EventStatus", async () => {
    const tenantId = "tenant-import-event-mapping";
    const actor = owner(tenantId);
    expect(
      (
        await importRows(actor, "contacts", [
          {
            ContactID: "C-77",
            FirstName: "Rosa",
            LastName: "Diaz",
            Email: "rosa@example.com",
          },
        ])
      ).committed,
    ).toBe(1);
    expect(
      (
        await importRows(actor, "venues", [
          { VenueID: "V-77", VenueName: "Old Mill" },
        ])
      ).committed,
    ).toBe(1);

    const row = {
      EventID: "E-77",
      EventName: "Diaz Anniversary",
      EventType: "Anniversary",
      ServiceStyle: "Buffet",
      EventDate: "2026-11-07",
      StartTime: "17:00",
      EndTime: "22:00",
      SetupTime: "15:30",
      TeardownTime: "23:00",
      GuaranteedCount: 80,
      ExpectedCount: 85,
      ActualCount: 82,
      VenueID: "V-77",
      VenueName: "Old Mill",
      LocationAddress: "4 Mill Road",
      LocationCity: "Stowe",
      LocationState: "VT",
      LocationZip: "05672",
      ClientID: "C-77",
      PrimaryContactID: "C-77",
      SalespersonID: "S-3",
      TotalRevenue: 9800,
      DepositAmount: 2000,
      BudgetAmount: 10000,
      EventStatus: "Definite",
      Probability: 90,
      EventNotes: "Surprise for the couple; keep quiet on calls",
      SpecialRequirements: "Two high chairs",
      AccessibilityNeeds: "Wheelchair",
      CreatedDate: "2026-01-04",
      ModifiedDate: "2026-02-10",
    };
    const result = await importRows(actor, "events", [row]);
    expect(result.committed).toBe(1);

    const link = await linkFor(actor, tenantId, "E-77");
    const event = (await actor.query(api.queries.getEvent, {
      id: link.capsuleId as never,
    })) as Row;
    const venueLink = await linkFor(actor, tenantId, "V-77");
    const clientLink = await linkFor(actor, tenantId, "C-77");

    expect(event.title).toBe("Diaz Anniversary");
    expect(event.eventType).toBe("anniversary");
    expect(event.startsAt).toBe(new Date("2026-11-07T17:00:00").getTime());
    expect(event.endsAt).toBe(new Date("2026-11-07T22:00:00").getTime());
    expect(event.expectedHeadcount).toBe(85);
    expect(event.venueId).toBe(venueLink.capsuleId);
    expect(event.venueName).toBe("Old Mill");
    expect(event.venueAddress).toBe("4 Mill Road, Stowe, VT, 05672");
    expect(event.clientId).toBe(clientLink.capsuleId);
    expect(event.quotedPrice).toBe(9800);
    expect(event.budgetAmount).toBe(10000);
    expect(event.operationalRequirements).toBe(
      "Two high chairs\n\nSurprise for the couple; keep quiet on calls",
    );
    expect(event.accessibilityNeeds).toEqual(["Wheelchair"]);

    // Every documented event field that is not on the record is on the link,
    // as received; the old status is kept word for word.
    const raw = JSON.parse(String(link.rawSourceData)) as Record<
      string,
      unknown
    >;
    expect(raw.rawEventStatus).toBe("Definite");
    const sourceRow = raw.sourceRow as Record<string, unknown>;
    for (const [field, home] of Object.entries(
      TPP_FIELD_DISPOSITIONS.TPP_EVENT_MAPPINGS!,
    )) {
      if (home.to === "link") {
        expect(sourceRow[field], field).toEqual(row[field as keyof typeof row]);
      }
    }
  });
});
