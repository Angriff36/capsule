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
});
