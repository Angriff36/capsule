/**
 * Runtime proof (AC-059, PL-SOURCE-RESOLUTION, PR02-03): on the import match
 * list a person adds a correctly typed record from an old-system row, or
 * points the row at a record Capsule already has. The choice is kept on the
 * row's link, so the same old-system row on a later import uses it and makes
 * nothing new.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";
import {
  ensureEncryptionKey,
  importRows,
  links,
  tableRows,
  type Actor,
} from "./source-identity.runtime.helpers";

beforeAll(ensureEncryptionKey);

function tenant(tenantId: string) {
  const proof = createManifestTestContext({
    convexTest: convexTest as never,
    schema,
    modules,
  });
  return {
    owner: proof.asRole({
      subject: `${tenantId}-owner`,
      role: "owner",
      tenantId,
    }) as Actor,
    // Runs imports but may not add clients, so its contact rows wait.
    kitchenManager: proof.asRole({
      subject: `${tenantId}-kitchen`,
      role: "kitchen_manager",
      tenantId,
    }) as Actor,
  };
}

const liveClients = async (actor: Actor, tenantId: string) =>
  (await tableRows(actor, "clients", tenantId)).filter(
    (c) => c.deletedAt == null,
  );

describe("runtime proof: settle an import item beside its source row (AC-059)", () => {
  it("operator creates a typed record from a pending link and reuses the resolution for the same source identity", async () => {
    const tenantId = "tenant-reconcile-add";
    const { owner, kitchenManager } = tenant(tenantId);
    const rows = [
      { ContactID: "C-1", FirstName: "Ana", LastName: "Lopez" },
      { ContactID: "C-2", FirstName: "Harbor", LastName: "Foods" },
    ];

    // Neither row could be added by this person: both wait with no record.
    await expect(
      importRows(kitchenManager, "contacts", rows),
    ).rejects.toThrow();
    const waiting = await links(owner, tenantId);
    expect(waiting).toHaveLength(2);
    for (const link of waiting) {
      expect(link.capsuleId).toBe("");
      expect(link.conflictStatus).toBe("pending_conflict");
    }
    const linkOf = (id: string) => waiting.find((l) => l.externalId === id)!;

    // C-1 is a person; C-2 is really a company (the right type is chosen).
    const person = (await owner.mutation(
      api.importResolution.addRecordForItem,
      { linkId: linkOf("C-1")._id as never },
    )) as { id: string; label: string };
    const company = (await owner.mutation(
      api.importResolution.addRecordForItem,
      { linkId: linkOf("C-2")._id as never, clientType: "company" },
    )) as { id: string; label: string };
    expect(person.label).toBe("Ana Lopez");
    expect(company.label).toBe("Harbor Foods");

    const clients = await liveClients(owner, tenantId);
    expect(clients).toHaveLength(2);
    expect(clients.find((c) => c._id === person.id)).toMatchObject({
      clientType: "person",
      givenName: "Ana",
      familyName: "Lopez",
    });
    expect(clients.find((c) => c._id === company.id)).toMatchObject({
      clientType: "company",
      companyName: "Harbor Foods",
    });

    const settled = await links(owner, tenantId);
    for (const [externalId, id] of [
      ["C-1", person.id],
      ["C-2", company.id],
    ] as const) {
      expect(settled.find((l) => l.externalId === externalId)).toMatchObject({
        capsuleId: id,
        conflictStatus: "resolved",
        decision: "approved",
        verified: true,
      });
    }

    // The same old-system rows again: the saved choice is used, nothing new.
    const again = await importRows(owner, "contacts", rows);
    expect(again).toMatchObject({ committed: 0, pending: 0 });
    expect(await liveClients(owner, tenantId)).toHaveLength(2);
    const after = await links(owner, tenantId);
    expect(after.find((l) => l.externalId === "C-1")?.capsuleId).toBe(
      person.id,
    );
    expect(after.find((l) => l.externalId === "C-2")?.capsuleId).toBe(
      company.id,
    );

    // An item that already has a record is not given a second one.
    await expect(
      owner.mutation(api.importResolution.addRecordForItem, {
        linkId: linkOf("C-1")._id as never,
      }),
    ).rejects.toThrow(/already has a Capsule record/);
  });

  it("operator points a look-alike row at the existing record; later imports follow it", async () => {
    const tenantId = "tenant-reconcile-choose";
    const { owner } = tenant(tenantId);
    const venues = [
      {
        VenueID: "V-1",
        VenueName: "The Grand Hall",
        Address: "10 Main St",
        ZipCode: "60601",
      },
      {
        VenueID: "V-2",
        VenueName: "Grand Hall at Main",
        Address: "10 Main St",
        ZipCode: "60601",
      },
    ];
    await importRows(owner, "venues", venues);
    const all = await links(owner, tenantId);
    const v1 = all.find((l) => l.externalId === "V-1")!;
    const v2 = all.find((l) => l.externalId === "V-2")!;
    expect(v2.conflictStatus).toBe("pending_conflict");

    // The page offers the existing venue by name.
    const found = (await owner.query(api.importResolution.findRecordsForItem, {
      linkId: v2._id as never,
      text: "Grand",
    })) as { id: string; label: string }[];
    expect(found.map((f) => f.id)).toContain(v1.capsuleId);

    const chosen = (await owner.mutation(
      api.importResolution.chooseExistingRecord,
      { linkId: v2._id as never, recordId: String(v1.capsuleId) },
    )) as { label: string; leftBehind: string | null };
    expect(chosen).toEqual({
      label: "The Grand Hall",
      leftBehind: "Grand Hall at Main",
    });
    const labels = (await owner.query(api.importResolution.itemRecordLabels, {
      linkIds: [v2._id as never],
    })) as Record<string, string>;
    expect(labels[String(v2._id)]).toBe("The Grand Hall");

    const settled = (await links(owner, tenantId)).find(
      (l) => l.externalId === "V-2",
    )!;
    expect(settled).toMatchObject({
      capsuleId: v1.capsuleId,
      conflictStatus: "resolved",
      decision: "approved",
      metadata: "{}",
    });
    expect(String(settled.resolutionNote)).toContain(
      "Matched to The Grand Hall",
    );

    // Replay: V-2 still means The Grand Hall; no third venue appears.
    const venuesBefore = (await tableRows(owner, "venues", tenantId)).length;
    const again = await importRows(owner, "venues", venues);
    expect(again).toMatchObject({ committed: 0, pending: 0 });
    expect((await tableRows(owner, "venues", tenantId)).length).toBe(
      venuesBefore,
    );
    expect(
      (await links(owner, tenantId)).find((l) => l.externalId === "V-2"),
    ).toMatchObject({ capsuleId: v1.capsuleId, conflictStatus: "resolved" });
  });

  it("a record from another company cannot be chosen", async () => {
    const tenantId = "tenant-reconcile-own";
    // One database, two companies.
    const proof = createManifestTestContext({
      convexTest: convexTest as never,
      schema,
      modules,
    });
    const owner = proof.asRole({
      subject: `${tenantId}-owner`,
      role: "owner",
      tenantId,
    }) as Actor;
    const otherOwner = proof.asRole({
      subject: "tenant-reconcile-other-owner",
      role: "owner",
      tenantId: "tenant-reconcile-other",
    }) as Actor;
    await importRows(otherOwner, "venues", [
      { VenueID: "X-1", VenueName: "Their Hall", Address: "1 A St" },
    ]);
    const theirVenue = (await links(otherOwner, "tenant-reconcile-other"))[0]!;
    expect(theirVenue.capsuleId).toBeTruthy();
    await importRows(owner, "venues", [
      { VenueID: "V-1", VenueName: "Our Hall", Address: "2 B St" },
    ]);
    const ours = (await links(owner, tenantId))[0]!;
    await expect(
      owner.mutation(api.importResolution.chooseExistingRecord, {
        linkId: ours._id as never,
        recordId: String(theirVenue.capsuleId),
      }),
    ).rejects.toThrow(/not in Capsule/);
  });
});
