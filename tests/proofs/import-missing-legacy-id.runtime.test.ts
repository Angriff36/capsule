/**
 * Runtime proof (AC-179, PL-SOURCE-IDENTITY): a source row with no old-system
 * id still gets a stable identity in its own tenant, built from what the row
 * says, with the raw row kept. It is never dressed up as an old-system id, and
 * the same row gives the same identity on every run.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { isDerivedSourceId } from "../../convex/lib/importIdentity";
import {
  ensureEncryptionKey,
  importRows,
  links,
  ownerOf,
  tableRows,
} from "./source-identity.runtime.helpers";

beforeAll(ensureEncryptionKey);

const CONTACTS = [
  {
    FirstName: "Nia",
    LastName: "Ward",
    Email: "nia@w.example",
    Phone: "555-0101",
  },
  { FirstName: "Nia", LastName: "Ward", Email: "nia.ward@other.example" },
];
const VENUES = [
  { VenueName: "Old Mill", Address: "2 River Rd", ZipCode: "60610" },
];

describe("runtime proof: id-less source rows (AC-179)", () => {
  it("an id-less source row gains a stable slug identity with provenance, stable across replays", async () => {
    const tenantId = "tenant-missing-legacy-id";
    const actor = ownerOf(tenantId);

    const first = await importRows(actor, "contacts", CONTACTS);
    // Two different people with one name: both made, the second waits.
    expect(first).toMatchObject({ committed: 1, pending: 1 });
    await importRows(actor, "venues", VENUES);

    const before = await links(actor, tenantId);
    expect(before).toHaveLength(3);
    for (const link of before) {
      expect(isDerivedSourceId(String(link.externalId))).toBe(true);
      expect(String(link.externalId)).not.toMatch(/^\d+$/);
      expect(link.tenantId).toBe(tenantId);
      // Provenance: the raw row as imported stays on the link.
      const raw = JSON.parse(String(link.rawSourceData)) as {
        identitySource?: string;
        sourceRow?: Record<string, unknown>;
      };
      expect(raw.identitySource).toBe("derived");
      expect(raw.sourceRow).toBeDefined();
    }
    expect(
      String(before.find((l) => l.recordType === "venue")!.externalId),
    ).toBe("no-id:old mill~2 river rd~60610");

    // Replay: the same rows find the same identities; nothing new is made.
    const again = await importRows(actor, "contacts", CONTACTS);
    expect(again).toMatchObject({ committed: 0, pending: 0 });
    await importRows(actor, "venues", VENUES);
    const after = await links(actor, tenantId);
    expect(after.map((l) => l.externalId).sort()).toEqual(
      before.map((l) => l.externalId).sort(),
    );
    expect(
      (await tableRows(actor, "clients", tenantId)).filter(
        (c) => c.deletedAt == null,
      ),
    ).toHaveLength(2);
    expect(await tableRows(actor, "venues", tenantId)).toHaveLength(1);
  });
});
