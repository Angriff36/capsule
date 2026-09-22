/**
 * Runtime proof: AC-224 — the documented TPP EventStatus → Capsule stage
 * mapping is preserved, and imported status history keeps the ORIGINAL TPP
 * status readable after the commit.
 *
 * Two claims, each proven against real code:
 *
 * 1. `mapTppEventStage` (convex/tppParser.ts) is EXACTLY the documented ten
 *    pairs — no invented keys ("Confirmed", "2- Sales Lock") and no new
 *    fallback. An unknown status falls back to "planning", the same fallback
 *    the function ships with.
 *
 * 2. After a real quickImport.importFile commit (one contact + two events),
 *    each event ExternalRecordLink carries rawSourceData whose parsed JSON
 *    still holds the literal TPP EventStatus (`rawEventStatus`) alongside
 *    the mapped `stage` — status history is not lost — while the created
 *    Event row stays at `planning` (Event_createViaPlanEngagement hardcodes
 *    planning; the TPP stage lives on the link only). A second import of the
 *    same EventIDs is an idempotent skip (foreign-run links) and does not
 *    wipe the stored raw status.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";
import { mapTppEventStage } from "../../convex/tppParser";

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
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5GqU=";
  }
});

type Actor = ReturnType<ReturnType<typeof harness>["asRole"]>;

/** The proof-kit harness type declares mutations only; the underlying
 * convex-test instance also runs actions (quickImport.importFile). */
type ActionRunner = {
  action: (fn: unknown, args?: unknown) => Promise<unknown>;
};
function asActions(actor: Actor): ActionRunner {
  return actor as unknown as ActionRunner;
}

type LinkRow = {
  _id: string;
  externalId: string;
  capsuleId: string;
  conflictStatus: string;
  rawSourceData: string;
};

async function eventLinks(owner: Actor, tenantId: string): Promise<LinkRow[]> {
  const rows = await owner.run(async (ctx) =>
    (await ctx.db.query("externalRecordLinks").collect()).filter(
      (row) =>
        (row as { tenantId: string }).tenantId === tenantId &&
        (row as { recordType: string }).recordType === "event" &&
        (row as { deletedAt?: number | null }).deletedAt == null,
    ),
  );
  return rows as unknown as LinkRow[];
}

describe("runtime proof: TPP status mapping preserved (AC-224)", () => {
  it("mapTppEventStage is exactly the documented ten pairs with the planning fallback", () => {
    expect(mapTppEventStage("Quote")).toBe("quote");
    expect(mapTppEventStage("Planning")).toBe("planning");
    expect(mapTppEventStage("Pending Approval")).toBe("pending_approval");
    expect(mapTppEventStage("Approved")).toBe("approved");
    expect(mapTppEventStage("Sales Lock")).toBe("sales_lock");
    expect(mapTppEventStage("Executing")).toBe("executing");
    expect(mapTppEventStage("Final")).toBe("final");
    expect(mapTppEventStage("Complete")).toBe("completed");
    expect(mapTppEventStage("Cancelled")).toBe("cancelled");
    expect(mapTppEventStage("Closed Out")).toBe("closed_out");
    // Unknown TPP statuses fall back — no new mapper keys are invented.
    expect(mapTppEventStage("Confirmed")).toBe("planning");
    expect(mapTppEventStage("2- Sales Lock")).toBe("planning");
  });

  it("after commit the link keeps the literal rawEventStatus + mapped stage while Event.stage stays planning", async () => {
    const tenantId = "tenant-ac224-tpp-status";
    const proof = harness();
    const owner = proof.asRole({
      subject: "ac224-owner",
      role: "owner",
      tenantId,
    });

    const contactImport = (await asActions(owner).action(
      api.quickImport.importFile,
      {
        datasetType: "contacts",
        sourceSystem: "tpp_legacy",
        rows: [
          {
            ContactID: "C-224",
            FirstName: "Status",
            LastName: "Proof",
            Email: "ac224@example.com",
            Phone: "555-0224",
          },
        ],
      },
    )) as { committed: number };
    expect(contactImport.committed).toBe(1);

    const eventsImport = (await asActions(owner).action(
      api.quickImport.importFile,
      {
        datasetType: "events",
        sourceSystem: "tpp_legacy",
        rows: [
          {
            EventID: "E-224-A",
            EventName: "Status Mapping Event A",
            ClientID: "C-224",
            EventDate: "2026-10-15",
            StartTime: "18:00",
            ExpectedCount: 40,
            TotalRevenue: "1500.00",
            EventStatus: "Sales Lock",
          },
          {
            EventID: "E-224-B",
            EventName: "Status Mapping Event B",
            ClientID: "C-224",
            EventDate: "2026-11-20",
            StartTime: "17:00",
            ExpectedCount: 25,
            TotalRevenue: "900.00",
            EventStatus: "Complete",
          },
        ],
      },
    )) as { committed: number };
    expect(eventsImport.committed).toBe(2);

    const links = await eventLinks(owner, tenantId);
    expect(links).toHaveLength(2);
    expect(
      links.every(
        (link) => link.conflictStatus === "resolved" && link.capsuleId !== "",
      ),
    ).toBe(true);

    const expected = [
      { externalId: "E-224-A", raw: "Sales Lock", stage: "sales_lock" },
      { externalId: "E-224-B", raw: "Complete", stage: "completed" },
    ];
    for (const want of expected) {
      const link = links.find((row) => row.externalId === want.externalId);
      expect(link).toBeTruthy();
      const raw = JSON.parse(link!.rawSourceData) as {
        rawEventStatus?: string;
        stage?: string;
      };
      // Literal TPP status survives the commit (status history is kept)…
      expect(raw.rawEventStatus).toBe(want.raw);
      // …and the mapped stage is stored on the LINK only.
      expect(raw.stage).toBe(want.stage);
      // The created Event row stays at planning — the create command does
      // not apply the TPP stage.
      const event = (await owner.run(async (ctx) =>
        ctx.db.get(link!.capsuleId as never),
      )) as { stage: string } | null;
      expect(event?.stage).toBe("planning");
    }
  });

  it("a second import of the same EventIDs skips idempotently and keeps the stored rawEventStatus", async () => {
    const tenantId = "tenant-ac224-tpp-status-reimport";
    const proof = harness();
    const owner = proof.asRole({
      subject: "ac224-reimport-owner",
      role: "owner",
      tenantId,
    });

    await asActions(owner).action(api.quickImport.importFile, {
      datasetType: "contacts",
      sourceSystem: "tpp_legacy",
      rows: [
        {
          ContactID: "C-224",
          FirstName: "Status",
          LastName: "Proof",
          Email: "ac224-reimport@example.com",
          Phone: "555-0224",
        },
      ],
    });

    const eventRow = {
      EventID: "E-224-R",
      EventName: "Reimport Status Event",
      ClientID: "C-224",
      EventDate: "2026-10-15",
      StartTime: "18:00",
      ExpectedCount: 40,
      TotalRevenue: "1500.00",
      EventStatus: "Sales Lock",
    };
    const first = (await asActions(owner).action(api.quickImport.importFile, {
      datasetType: "events",
      sourceSystem: "tpp_legacy",
      rows: [eventRow],
    })) as { committed: number };
    expect(first.committed).toBe(1);

    // Foreign-run links count as skipped — no second Event, no link rewrite.
    const second = (await asActions(owner).action(api.quickImport.importFile, {
      datasetType: "events",
      sourceSystem: "tpp_legacy",
      rows: [eventRow],
    })) as { committed: number; skipped: number };
    expect(second.committed).toBe(0);
    expect(second.skipped).toBe(1);

    const links = await eventLinks(owner, tenantId);
    expect(links).toHaveLength(1);
    const raw = JSON.parse(links[0].rawSourceData) as {
      rawEventStatus?: string;
      stage?: string;
    };
    expect(raw.rawEventStatus).toBe("Sales Lock");
    expect(raw.stage).toBe("sales_lock");
  });
});
