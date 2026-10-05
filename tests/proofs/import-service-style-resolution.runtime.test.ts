/**
 * Runtime proof (AC-064, PR02-08): unknown imported service styles stay
 * traceable and resolvable without blocking unrelated events.
 *
 * - A known style ("Buffet") is matched to the Capsule style on import.
 * - An unknown style ("Family Style") never blocks its event: the event
 *   imports with no style, and one matching-screen item names the old style.
 * - Matching that item to a Capsule style gives it to the imported events
 *   that named it and still have none; an event someone already gave a
 *   style keeps it, and events with other styles are untouched.
 * - A later import with the same old style uses the match at once.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const M = api.mutations;

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
type ActionRunner = { action: (fn: unknown, args?: unknown) => Promise<any> };
const asActions = (actor: Actor) => actor as unknown as ActionRunner;

const eventRow = (id: string, style?: string) => ({
  EventID: id,
  EventName: `Imported ${id}`,
  ClientID: "C-064",
  EventDate: "2026-10-15",
  StartTime: "18:00",
  ExpectedCount: 40,
  EventStatus: "Planning",
  ...(style ? { ServiceStyle: style } : {}),
});

async function importEvents(owner: Actor, rows: object[]) {
  return asActions(owner).action(api.quickImport.importFile, {
    datasetType: "events",
    sourceSystem: "tpp_legacy",
    rows,
  });
}

async function eventsByTitle(owner: Actor) {
  const rows = (await owner.run(async (ctx) =>
    ctx.db.query("events").collect(),
  )) as any[];
  return new Map(rows.map((row) => [row.title as string, row]));
}

async function styleItems(owner: Actor) {
  return (
    (await owner.run(async (ctx) =>
      ctx.db.query("externalRecordLinks").collect(),
    )) as any[]
  ).filter((row) => row.recordType === "service_style");
}

describe("imported service styles (AC-064)", () => {
  it("an unknown imported service style resolves to the catalog without touching earlier events", async () => {
    const tenantId = "tenant-ac064";
    const proof = harness();
    const owner = proof.asRole({ subject: "o-ac064", role: "owner", tenantId });
    const buffet = (await proof.executeCommand(
      owner,
      M.ServiceStyle_createViaRegister,
      { name: "Buffet", code: "buffet" },
    )) as { docId: string };
    await asActions(owner).action(api.quickImport.importFile, {
      datasetType: "contacts",
      sourceSystem: "tpp_legacy",
      rows: [
        {
          ContactID: "C-064",
          FirstName: "Style",
          LastName: "Proof",
          Email: "ac064@example.com",
        },
      ],
    });

    const first = await importEvents(owner, [
      eventRow("E-1", "Buffet"),
      eventRow("E-2", "Family Style"),
      eventRow("E-3"),
      eventRow("E-4", "Family Style"),
    ]);
    expect(first.committed).toBe(4);
    let events = await eventsByTitle(owner);
    expect(events.get("Imported E-1")).toMatchObject({
      serviceStyleId: buffet.docId,
      serviceStyleName: "Buffet",
    });
    expect(events.get("Imported E-2")?.serviceStyleId ?? null).toBeNull();
    expect(events.get("Imported E-3")?.serviceStyleId ?? null).toBeNull();

    const [item] = await styleItems(owner);
    expect(item).toMatchObject({
      externalId: "family_style",
      conflictStatus: "pending_conflict",
      capsuleId: "",
    });
    expect(item.resolutionNote).toContain('"family style"');
    expect(await styleItems(owner)).toHaveLength(1);

    // Someone already gave E-4 a style by hand before matching.
    const e4 = events.get("Imported E-4");
    await proof.executeCommand(owner, M.Event_changeServiceStyle, {
      docId: e4._id,
      serviceStyleId: buffet.docId,
      serviceStyleName: "Buffet",
    });

    const family = (await proof.executeCommand(
      owner,
      M.ServiceStyle_createViaRegister,
      { name: "Family-style dinner", code: "family_dinner" },
    )) as { docId: string };
    const result = await owner.mutation(
      api.importServiceStyle.resolveImportedServiceStyle,
      { linkId: item._id, serviceStyleId: family.docId },
    );
    expect(result).toEqual({ applied: 1 });

    events = await eventsByTitle(owner);
    expect(events.get("Imported E-2")).toMatchObject({
      serviceStyleId: family.docId,
      serviceStyleName: "Family-style dinner",
    });
    expect(events.get("Imported E-4")).toMatchObject({
      serviceStyleId: buffet.docId,
    });
    expect(events.get("Imported E-1")).toMatchObject({
      serviceStyleId: buffet.docId,
    });
    expect(events.get("Imported E-3")?.serviceStyleId ?? null).toBeNull();
    const [resolved] = await styleItems(owner);
    expect(resolved).toMatchObject({
      conflictStatus: "resolved",
      capsuleId: family.docId,
    });

    // A later import with the same old style uses the match at once.
    const later = await importEvents(owner, [eventRow("E-5", "Family Style")]);
    expect(later.committed).toBe(1);
    events = await eventsByTitle(owner);
    expect(events.get("Imported E-5")).toMatchObject({
      serviceStyleId: family.docId,
    });
    const items = await styleItems(owner);
    expect(
      items.filter((row) => row.conflictStatus === "pending_conflict"),
    ).toEqual([]);
  });
});
