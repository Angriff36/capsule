/**
 * Runtime proof: repeat imports apply source changes as reviewed deltas
 * (PL-SOURCE-DELTA, AC-272 / AC-273, spec CF-6.1-04 / CF-6.1-05).
 *
 * - A changed source row for a record nobody touched in Capsule updates that
 *   record in place (no second copy).
 * - A manual edit to a linked record followed by a re-import of a changed
 *   source row lands in the review list with both values visible, and the
 *   manual value is not overwritten.
 * - The same source revision again changes nothing and raises nothing new;
 *   the three-way baseline lives on the link and moves only when Capsule
 *   took a value.
 * - "Use the new value" writes the source value as the signed-in person and
 *   settles the item; a later repeat does not raise it again.
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
const asActions = (actor: Actor) => actor as unknown as ActionRunner;

type ImportResult = {
  importRunId: string;
  committed: number;
  skipped: number;
  pending: number;
  updated?: number;
  conflicted?: number;
};

type Row = Record<string, unknown> & { _id: string };

const venueRow = (n: number, over: Record<string, unknown> = {}) => ({
  VenueID: `V-70${n}`,
  VenueName: `Harbor Hall ${n}`,
  VenueType: "Office",
  Address: `${n} Pier Road`,
  City: "Seattle",
  State: "WA",
  ZipCode: "98101",
  Capacity: 100 + n,
  CreatedDate: "2026-05-01",
  ...over,
});

async function importRows(
  actor: Actor,
  datasetType: string,
  rows: unknown[],
): Promise<ImportResult> {
  return (await asActions(actor).action(api.quickImport.importFile, {
    datasetType,
    sourceSystem: "tpp_legacy",
    rows,
  })) as ImportResult;
}

async function tableRows(actor: Actor, table: string, tenantId: string) {
  const rows = await actor.run(async (ctx) =>
    (
      await (ctx.db.query as (t: string) => { collect(): Promise<unknown[]> })(
        table,
      ).collect()
    ).filter(
      (row) =>
        (row as { tenantId: string }).tenantId === tenantId &&
        (row as { deletedAt?: number | null }).deletedAt == null,
    ),
  );
  return rows as Row[];
}

async function linkFor(
  actor: Actor,
  tenantId: string,
  externalId: string,
): Promise<Row> {
  const links = await tableRows(actor, "externalRecordLinks", tenantId);
  const link = links.find((l) => l.externalId === externalId);
  if (!link) throw new Error(`no link for ${externalId}`);
  return link;
}

async function readVenue(actor: Actor, id: string) {
  return (await actor.query(api.queries.getVenue, { id: id as never })) as Row;
}

describe("runtime proof: import field ownership conflict (AC-272, AC-273)", () => {
  it("a manual edit followed by a changed re-import lands in the review list and is not overwritten", async () => {
    const tenantId = "tenant-import-field-ownership";
    const proof = harness();
    const owner = proof.asRole({
      subject: "import-ownership-owner",
      role: "owner",
      tenantId,
    });

    // First import: two venues.
    const first = await importRows(owner, "venues", [venueRow(1), venueRow(2)]);
    expect(first.committed).toBe(2);
    const link1 = await linkFor(owner, tenantId, "V-701");
    const link2 = await linkFor(owner, tenantId, "V-702");
    expect(JSON.parse(String(link1.appliedValues)).city).toBe("Seattle");

    // A person corrects venue 1's city in Capsule.
    const before = await readVenue(owner, String(link1.capsuleId));
    await owner.mutation(api.mutations.Venue_updateDetails, {
      docId: link1.capsuleId as never,
      name: String(before.name),
      venueType: before.venueType,
      addressLine1: before.addressLine1 as string,
      city: "Bellevue",
      region: before.region as string,
      postalCode: before.postalCode as string,
    });

    // The old system changes venue 1's city AND zip, and venue 2's capacity.
    const revised = [
      venueRow(1, { City: "Tacoma", ZipCode: "98402" }),
      venueRow(2, { Capacity: 250 }),
    ];
    const second = await importRows(owner, "venues", revised);
    expect(second.committed).toBe(0);
    expect(second.updated).toBe(1);
    expect(second.conflicted).toBe(1);
    expect(second.skipped).toBe(0);

    // No second copy of either venue.
    expect(await tableRows(owner, "venues", tenantId)).toHaveLength(2);

    // Venue 1: the person's city stays; the untouched zip takes the source.
    const venue1 = await readVenue(owner, String(link1.capsuleId));
    expect(venue1.city).toBe("Bellevue");
    expect(venue1.postalCode).toBe("98402");
    // Venue 2: nobody touched it, so the new capacity applied.
    const venue2 = await readVenue(owner, String(link2.capsuleId));
    expect(venue2.capacity).toBe(250);

    // The review list holds the city with all three values.
    const conflicts = await tableRows(owner, "importConflicts", tenantId);
    expect(conflicts).toHaveLength(1);
    const cityConflict = conflicts[0]!;
    expect(cityConflict.field).toBe("city");
    expect(cityConflict.status).toBe("pending");
    expect(cityConflict.externalRecordLinkId).toBe(link1._id);
    expect(JSON.parse(String(cityConflict.appliedValue))).toBe("Seattle");
    expect(JSON.parse(String(cityConflict.capsuleValue))).toBe("Bellevue");
    expect(JSON.parse(String(cityConflict.sourceValue))).toBe("Tacoma");

    // The baseline moved for the zip, not for the city.
    const link1After = await linkFor(owner, tenantId, "V-701");
    const applied = JSON.parse(String(link1After.appliedValues));
    expect(applied.postalCode).toBe("98402");
    expect(applied.city).toBe("Seattle");
    expect(link1After.sourceImportRunId).toBe(first.importRunId);
    expect(link1After.lastSeenImportRunId).toBe(second.importRunId);

    // Same source revision again (another device, a restarted worker):
    // nothing changes and nothing new is raised.
    const third = await importRows(owner, "venues", revised);
    expect(third.committed).toBe(0);
    expect(third.updated).toBe(0);
    expect(third.conflicted).toBe(0);
    expect(third.skipped).toBe(2);
    expect(await tableRows(owner, "importConflicts", tenantId)).toHaveLength(1);
    expect((await readVenue(owner, String(link1.capsuleId))).city).toBe(
      "Bellevue",
    );

    // A person takes the source value from the review list.
    await asActions(owner).action(api.importSourceDelta.takeSourceValue, {
      conflictId: cityConflict._id,
    });
    expect((await readVenue(owner, String(link1.capsuleId))).city).toBe(
      "Tacoma",
    );
    const settled = await tableRows(owner, "importConflicts", tenantId);
    expect(settled).toHaveLength(1);
    expect(settled[0]!.status).toBe("take_source");

    // And a later repeat of that revision raises nothing again.
    const fourth = await importRows(owner, "venues", revised);
    expect(fourth.skipped).toBe(2);
    expect(fourth.conflicted).toBe(0);
    const finalConflicts = await tableRows(owner, "importConflicts", tenantId);
    expect(finalConflicts).toHaveLength(1);
    expect(finalConflicts[0]!.status).toBe("take_source");
  });

  it("a client field no import may write waits for a person instead of being changed", async () => {
    const tenantId = "tenant-import-field-ownership-contacts";
    const proof = harness();
    const owner = proof.asRole({
      subject: "import-ownership-contacts-owner",
      role: "owner",
      tenantId,
    });
    const contact = {
      ContactID: "C-501",
      FirstName: "Dana",
      LastName: "Lee",
      Email: "dana@example.com",
      Phone: "206-555-0100",
    };
    expect((await importRows(owner, "contacts", [contact])).committed).toBe(1);
    const link = await linkFor(owner, tenantId, "C-501");

    // A person changes the email in Capsule.
    await owner.mutation(api.mutations.Client_changeContact, {
      docId: link.capsuleId as never,
      email: "dana.lee@example.com",
      phone: "206-555-0100",
    });

    // The old system changes the first name, email and phone.
    const revised = {
      ...contact,
      FirstName: "Danielle",
      Email: "dlee@example.com",
      Phone: "206-555-0199",
    };
    const second = await importRows(owner, "contacts", [revised]);
    expect(second.committed).toBe(0);
    expect(second.conflicted).toBe(1);
    expect(await tableRows(owner, "clients", tenantId)).toHaveLength(1);

    const client = (await owner.query(api.queries.getClient, {
      id: link.capsuleId as never,
    })) as Row;
    // The untouched phone takes the source; the person's email stays; the
    // name is not changed by an import.
    expect(client.phone).toBe("206-555-0199");
    expect(client.email).toBe("dana.lee@example.com");
    expect(client.givenName).toBe("Dana");

    const conflicts = await tableRows(owner, "importConflicts", tenantId);
    expect(conflicts.map((c) => c.field).sort()).toEqual([
      "email",
      "givenName",
    ]);
    const nameConflict = conflicts.find((c) => c.field === "givenName")!;
    expect(JSON.parse(String(nameConflict.sourceValue))).toBe("Danielle");
    expect(JSON.parse(String(nameConflict.capsuleValue))).toBe("Dana");
    await expect(
      asActions(owner).action(api.importSourceDelta.takeSourceValue, {
        conflictId: nameConflict._id,
      }),
    ).rejects.toThrow(/First name on the record/);
  });

  it("an event changed in the old system moves its time and guest count unless a person changed them", async () => {
    const tenantId = "tenant-import-field-ownership-events";
    const proof = harness();
    const owner = proof.asRole({
      subject: "import-ownership-events-owner",
      role: "owner",
      tenantId,
    });
    await importRows(owner, "contacts", [
      { ContactID: "C-601", FirstName: "Ana", LastName: "Ruiz" },
    ]);
    const eventRow = (id: string, over: Record<string, unknown> = {}) => ({
      EventID: id,
      EventName: `Gala ${id}`,
      ClientID: "C-601",
      EventDate: "2026-11-14",
      StartTime: "18:00",
      ExpectedCount: 40,
      EventStatus: "Proposal",
      ...over,
    });
    const first = await importRows(owner, "events", [
      eventRow("E-601"),
      eventRow("E-602"),
    ]);
    expect(first.committed).toBe(2);
    const link1 = await linkFor(owner, tenantId, "E-601");
    const link2 = await linkFor(owner, tenantId, "E-602");
    const readEvent = async (id: unknown) =>
      (await owner.query(api.queries.getEvent, { id: id as never })) as Row;
    const before1 = await readEvent(link1.capsuleId);

    // The client tells the planner 55 guests; the planner saves it.
    await owner.mutation(api.mutations.Event_changeHeadcount, {
      docId: link1.capsuleId as never,
      newHeadcount: 55,
    });

    // The old system says 60 guests and an hour later for E-601, 30 for E-602.
    const revised = [
      eventRow("E-601", { ExpectedCount: 60, StartTime: "19:00" }),
      eventRow("E-602", { ExpectedCount: 30 }),
    ];
    const second = await importRows(owner, "events", revised);
    expect(second.committed).toBe(0);
    expect(second.updated).toBe(1);
    expect(second.conflicted).toBe(1);
    expect(await tableRows(owner, "events", tenantId)).toHaveLength(2);

    const after1 = await readEvent(link1.capsuleId);
    expect(after1.expectedHeadcount).toBe(55);
    expect(after1.startsAt).toBe(Number(before1.startsAt) + 3_600_000);
    expect((await readEvent(link2.capsuleId)).expectedHeadcount).toBe(30);

    const conflicts = await tableRows(owner, "importConflicts", tenantId);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.field).toBe("expectedHeadcount");
    expect(JSON.parse(String(conflicts[0]!.appliedValue))).toBe(40);
    expect(JSON.parse(String(conflicts[0]!.capsuleValue))).toBe(55);
    expect(JSON.parse(String(conflicts[0]!.sourceValue))).toBe(60);

    // Keep the planner's number; the same revision later raises nothing.
    await owner.mutation(api.mutations.ImportConflict_settle, {
      docId: conflicts[0]!._id as never,
      resolution: "keep_capsule",
    });
    const third = await importRows(owner, "events", revised);
    expect(third.skipped).toBe(2);
    expect(third.conflicted).toBe(0);
    const kept = await tableRows(owner, "importConflicts", tenantId);
    expect(kept).toHaveLength(1);
    expect(kept[0]!.status).toBe("keep_capsule");
    expect((await readEvent(link1.capsuleId)).expectedHeadcount).toBe(55);
  });

  it("a source row that blanks a time Capsule needs leaves the event as it is and raises nothing later (#409)", async () => {
    const tenantId = "tenant-import-field-ownership-blank";
    const proof = harness();
    const owner = proof.asRole({
      subject: "import-ownership-blank-owner",
      role: "owner",
      tenantId,
    });
    await importRows(owner, "contacts", [
      { ContactID: "C-651", FirstName: "Ana", LastName: "Ruiz" },
    ]);
    const eventRow = (over: Record<string, unknown> = {}) => ({
      EventID: "E-651",
      EventName: "Gala E-651",
      ClientID: "C-651",
      EventDate: "2026-11-14",
      StartTime: "18:00",
      ExpectedCount: 40,
      EventStatus: "Proposal",
      ...over,
    });
    expect((await importRows(owner, "events", [eventRow()])).committed).toBe(1);
    const link = await linkFor(owner, tenantId, "E-651");
    const readEvent = async () =>
      (await owner.query(api.queries.getEvent, {
        id: link.capsuleId as never,
      })) as Row;
    const before = await readEvent();

    // The old system loses the date: Capsule keeps its time, no review item.
    const blank = await importRows(owner, "events", [
      eventRow({ EventDate: "", StartTime: "" }),
    ]);
    expect(blank.conflicted ?? 0).toBe(0);
    expect((await readEvent()).startsAt).toBe(before.startsAt);

    // Then a real new date arrives: it is taken, not a false review item.
    const moved = await importRows(owner, "events", [
      eventRow({ EventDate: "2026-11-21" }),
    ]);
    expect(moved.conflicted ?? 0).toBe(0);
    expect(moved.updated).toBe(1);
    expect((await readEvent()).startsAt).toBe(
      Number(before.startsAt) + 7 * 86_400_000,
    );
    expect(await tableRows(owner, "importConflicts", tenantId)).toEqual([]);
  });

  it("dishes and leads take untouched changes; allergens and a chef's edit wait for a person", async () => {
    const tenantId = "tenant-import-field-ownership-dishes";
    const proof = harness();
    const owner = proof.asRole({
      subject: "import-ownership-dishes-owner",
      role: "owner",
      tenantId,
    });
    const dish = {
      MenuItemID: "M-801",
      Name: "Herb Chicken",
      Description: "Roasted thigh",
      Category: "Entree",
      PortionSizeDescription: "1 piece",
      Allergens: "",
    };
    expect((await importRows(owner, "menus", [dish])).committed).toBe(1);
    const dishLink = await linkFor(owner, tenantId, "M-801");
    const readDish = async () =>
      (await owner.query(api.queries.getDish, {
        id: dishLink.capsuleId as never,
      })) as Row;
    const before = await readDish();

    // The chef rewrites the description in Capsule.
    await owner.mutation(api.mutations.Dish_reviseDetails, {
      docId: dishLink.capsuleId as never,
      name: String(before.name),
      description: "Roasted thigh, lemon jus",
      category: before.category as string,
    });

    // The old system changes the description, the category and adds an allergen.
    const second = await importRows(owner, "menus", [
      {
        ...dish,
        Description: "Grilled thigh",
        Category: "Main",
        Allergens: "Milk",
      },
    ]);
    expect(second.committed).toBe(0);
    expect(second.conflicted).toBe(1);
    const after = await readDish();
    expect(after.description).toBe("Roasted thigh, lemon jus");
    expect(after.category).toBe("Main");
    expect(after.allergenSummary ?? []).toEqual(before.allergenSummary ?? []);
    const fields = (await tableRows(owner, "importConflicts", tenantId))
      .map((c) => c.field)
      .sort();
    expect(fields).toEqual(["allergenSummary", "description"]);
    expect(await tableRows(owner, "dishes", tenantId)).toHaveLength(1);

    // A lead renamed in the old system, untouched in Capsule, takes the name.
    const lead = {
      LeadID: "L-801",
      OpportunityName: "Spring Gala",
      ClientID: "C-801",
      Stage: "New",
      EstimatedValue: 5000,
    };
    expect((await importRows(owner, "leads", [lead])).committed).toBe(1);
    const leadResult = await importRows(owner, "leads", [
      { ...lead, OpportunityName: "Spring Gala 2027" },
    ]);
    expect(leadResult.updated).toBe(1);
    const leadLink = await linkFor(owner, tenantId, "L-801");
    const leadDoc = (await owner.query(api.queries.getLead, {
      id: leadLink.capsuleId as never,
    })) as Row;
    expect(leadDoc.companyName).toBe("Spring Gala 2027");
    expect(await tableRows(owner, "leads", tenantId)).toHaveLength(1);
  });
});
