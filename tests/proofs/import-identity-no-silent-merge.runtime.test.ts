/**
 * Runtime proof (AC-058, PL-SOURCE-IDENTITY): an exact old-system id matches
 * by itself; same-name people, a shared email address and a renamed venue are
 * never joined. Each look-alike is added as its own record and only that
 * record waits on the match list, with the reason.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  client,
  ensureEncryptionKey,
  importRows,
  links,
  ownerOf,
  tableRows,
} from "./source-identity.runtime.helpers";

beforeAll(ensureEncryptionKey);

describe("runtime proof: no silent merge of look-alike source records (AC-058)", () => {
  it("same-name and shared-email source records stay separate pending an operator decision", async () => {
    const tenantId = "tenant-identity-no-silent-merge";
    const actor = ownerOf(tenantId);

    const first = await importRows(actor, "contacts", [
      {
        ContactID: "C-1",
        FirstName: "Ana",
        LastName: "Lopez",
        Email: "ana@a.example",
      },
      {
        ContactID: "C-2",
        FirstName: "Ana",
        LastName: "Lopez",
        Email: "ana.l@b.example",
      },
      {
        ContactID: "C-3",
        FirstName: "Ben",
        LastName: "Ortiz",
        Email: "family@c.example",
      },
      {
        ContactID: "C-4",
        FirstName: "Bea",
        LastName: "Ortiz",
        Email: "Family@C.example",
      },
      {
        ContactID: "C-5",
        FirstName: "Cal",
        LastName: "Diaz",
        Email: "cal@d.example",
      },
    ]);
    // C-1, C-3 and C-5 are plain; C-2 (same name) and C-4 (same email) wait.
    expect(first).toMatchObject({ committed: 3, pending: 2 });

    const all = await links(actor, tenantId);
    const byId = (id: string) => all.find((l) => l.externalId === id)!;
    const clients = (await tableRows(actor, "clients", tenantId)).filter(
      (c) => c.deletedAt == null,
    );
    // Five rows, five clients: nothing was joined.
    expect(clients).toHaveLength(5);
    expect(new Set(all.map((l) => l.capsuleId)).size).toBe(5);

    for (const id of ["C-1", "C-3", "C-5"]) {
      expect(byId(id).conflictStatus).toBe("resolved");
    }
    const sameName = byId("C-2");
    expect(sameName.conflictStatus).toBe("pending_conflict");
    expect(String(sameName.resolutionNote)).toContain(
      `Same name as Ana Lopez (${String(byId("C-1").capsuleId)})`,
    );
    const sameEmail = byId("C-4");
    expect(sameEmail.conflictStatus).toBe("pending_conflict");
    expect(String(sameEmail.resolutionNote)).toContain(
      "Same email as Ben Ortiz",
    );
    // The waiting records are real, readable clients of their own.
    expect(await client(actor, sameName.capsuleId)).toMatchObject({
      givenName: "Ana",
      familyName: "Lopez",
      email: "ana.l@b.example",
    });

    // Exact id match: the same rows again make no new client and do not
    // reopen any decision.
    const again = await importRows(actor, "contacts", [
      {
        ContactID: "C-1",
        FirstName: "Ana",
        LastName: "Lopez",
        Email: "ana@a.example",
      },
      {
        ContactID: "C-2",
        FirstName: "Ana",
        LastName: "Lopez",
        Email: "ana.l@b.example",
      },
    ]);
    expect(again).toMatchObject({ committed: 0, pending: 0 });
    expect(
      (await tableRows(actor, "clients", tenantId)).filter(
        (c) => c.deletedAt == null,
      ),
    ).toHaveLength(5);
  });

  it("a renamed venue at the same address and a same-name venue wait for a decision", async () => {
    const tenantId = "tenant-identity-venue-rename";
    const actor = ownerOf(tenantId);

    const result = await importRows(actor, "venues", [
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
      {
        VenueID: "V-3",
        VenueName: "the grand  hall",
        Address: "99 Elm Ave",
        ZipCode: "60602",
      },
      {
        VenueID: "V-4",
        VenueName: "Lakeside Barn",
        Address: "5 Shore Rd",
        ZipCode: "60603",
      },
    ]);
    expect(result).toMatchObject({ committed: 2, pending: 2 });

    const all = await links(actor, tenantId);
    const byId = (id: string) => all.find((l) => l.externalId === id)!;
    expect(new Set(all.map((l) => l.capsuleId)).size).toBe(4);
    expect(byId("V-1").conflictStatus).toBe("resolved");
    expect(byId("V-4").conflictStatus).toBe("resolved");
    expect(byId("V-2").conflictStatus).toBe("pending_conflict");
    expect(String(byId("V-2").resolutionNote)).toContain(
      "Same address as The Grand Hall",
    );
    expect(byId("V-3").conflictStatus).toBe("pending_conflict");
    expect(String(byId("V-3").resolutionNote)).toContain(
      "Same name as The Grand Hall",
    );
  });
});
