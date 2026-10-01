/**
 * Runtime proof (AC-630, BE-16.2, PL-SOURCE-IDENTITY): the whole source
 * identity contract in one tenant.
 *
 * 1. A stable old-system id is used first: the same row again is the same
 *    record.
 * 2. With no id, a stable identity is built from the row's own details.
 * 3. A look-alike (same name or email) is not joined by any match score: it
 *    is made on its own and waits on the match list.
 * 4. A merge keeps the old-system links and the moved history.
 * 5. A person's edit in Capsule wins over a later old-system change unless
 *    someone applies the reviewed source value.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import { isDerivedSourceId } from "../../convex/lib/importIdentity";
import {
  client,
  ensureEncryptionKey,
  importRows,
  links,
  ownerOf,
  tableRows,
} from "./source-identity.runtime.helpers";

beforeAll(ensureEncryptionKey);

describe("runtime proof: backend source identity (AC-630)", () => {
  it("source identity satisfies the full source contract", async () => {
    const tenantId = "tenant-backend-source-identity";
    const actor = ownerOf(tenantId);
    const activeClients = async () =>
      (await tableRows(actor, "clients", tenantId)).filter(
        (c) => c.deletedAt == null && c.status !== "archived",
      );

    const rows = [
      {
        ContactID: "S-1",
        FirstName: "Omar",
        LastName: "Haddad",
        Email: "omar@h.example",
      },
      { FirstName: "Lena", LastName: "Ruiz", Phone: "555-0199" },
      {
        ContactID: "S-2",
        FirstName: "Omar",
        LastName: "Haddad",
        Email: "o.haddad@x.example",
      },
    ];
    const first = await importRows(actor, "contacts", rows);
    expect(first).toMatchObject({ committed: 2, pending: 1 });

    // (1) + (2): replay finds every record by its id or its built identity.
    const again = await importRows(actor, "contacts", rows);
    expect(again).toMatchObject({ committed: 0, pending: 0 });
    expect(await activeClients()).toHaveLength(3);
    const all = await links(actor, tenantId);
    const derived = all.filter((l) => isDerivedSourceId(String(l.externalId)));
    expect(derived).toHaveLength(1);

    // (3): the look-alike waits; it was not joined to S-1.
    const s1 = all.find((l) => l.externalId === "S-1")!;
    const s2 = all.find((l) => l.externalId === "S-2")!;
    expect(s2.capsuleId).not.toBe(s1.capsuleId);
    expect(s2.conflictStatus).toBe("pending_conflict");

    // A person decides they are the same and merges; an event on the
    // duplicate moves with it, and both links stay with the client kept.
    await importRows(actor, "events", [
      {
        EventID: "SE-1",
        EventName: "Haddad Dinner",
        EventDate: "2026-11-12",
        StartTime: "18:00",
        EndTime: "21:00",
        ExpectedCount: 20,
        ClientID: "S-2",
        EventStatus: "Definite",
      },
    ]);
    await actor.mutation(api.mutations.ClientMerge_createViaMerge, {
      primaryClientId: s1.capsuleId,
      duplicateClientId: s2.capsuleId,
    } as never);
    // (4)
    const eventLink = (await links(actor, tenantId)).find(
      (l) => l.externalId === "SE-1",
    )!;
    const event = (await actor.query(api.queries.getEvent, {
      id: eventLink.capsuleId as never,
    })) as { clientId: string };
    expect(event.clientId).toBe(s1.capsuleId);
    const sources = (await actor.query(api.sourceProvenance.listByCapsuleId, {
      capsuleId: s1.capsuleId,
    })) as Array<{ externalId: string }>;
    expect(sources.map((s) => s.externalId).sort()).toEqual(["S-1", "S-2"]);

    // (5): a person's edit wins over a later old-system change.
    await actor.mutation(api.mutations.Client_changeContact, {
      docId: s1.capsuleId as never,
      email: "omar.haddad@capsule.example",
    });
    const changed = await importRows(actor, "contacts", [
      { ...rows[0], Email: "omar@new-old-system.example" },
    ]);
    expect(changed.committed).toBe(0);
    expect((await client(actor, s1.capsuleId))!.email).toBe(
      "omar.haddad@capsule.example",
    );
  });
});
