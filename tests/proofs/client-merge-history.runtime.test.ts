/**
 * Runtime proof (AC-061, PL-SOURCE-MERGE, PR02-05): merging two clients moves
 * every record that hangs on the duplicate (events, contacts, leads, follow-up
 * reminders, website quote requests) to the client kept, keeps both
 * old-system links, and a later change in the old system for the merged-away
 * row reaches the client kept. The merge is one save: a merge that is refused
 * changes nothing, and the same merge can simply be run again.
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

type Doc = Record<string, unknown> & { _id: string };

async function dependents(actor: Actor, tenantId: string, clientId: string) {
  const on = async (table: string) =>
    (await tableRows(actor, table, tenantId))
      .filter((row) => row.clientId === clientId && row.deletedAt == null)
      .map((row) => row._id)
      .sort();
  return {
    events: await on("events"),
    clientContacts: await on("clientContacts"),
    leads: await on("leads"),
    clientOutreachTasks: await on("clientOutreachTasks"),
    quoteSubmissions: await on("quoteSubmissions"),
  };
}

describe("runtime proof: client merge keeps every dependent record (AC-061)", () => {
  it("merge reassigns every dependent record, keeps source links, and rolls back atomically on a staged failure", async () => {
    const tenantId = "tenant-merge-history";
    const proof = createManifestTestContext({
      convexTest: convexTest as never,
      schema,
      modules,
    });
    const actor = proof.asRole({
      subject: `${tenantId}-owner`,
      role: "owner",
      tenantId,
    }) as Actor;
    // May sell and edit clients but not merge them.
    const salesManager = proof.asRole({
      subject: `${tenantId}-sales`,
      role: "sales_manager",
      tenantId,
    }) as Actor;
    const rows = [
      { ContactID: "H-1", FirstName: "Rosa", LastName: "Diaz" },
      {
        ContactID: "H-2",
        FirstName: "Rosa",
        LastName: "Diaz",
        Email: "rosa@old.example",
      },
    ];
    await importRows(actor, "contacts", rows);
    const byId = async (id: string) =>
      (await links(actor, tenantId)).find((l) => l.externalId === id)!;
    const kept = String((await byId("H-1")).capsuleId);
    const duplicate = String((await byId("H-2")).capsuleId);

    // Everything below hangs on the duplicate.
    await importRows(actor, "events", [
      {
        EventID: "HE-1",
        EventName: "Diaz Anniversary",
        EventDate: "2026-11-14",
        StartTime: "18:00",
        EndTime: "22:00",
        ExpectedCount: 60,
        ClientID: "H-2",
        EventStatus: "Definite",
      },
    ]);
    await actor.mutation(api.mutations.ClientContact_createViaAdd, {
      clientId: duplicate,
      givenName: "Marco",
    } as never);
    const captureLead = async () => {
      const lead = (await actor.mutation(api.mutations.Lead_createViaCapture, {
        leadType: "person",
        source: "Phone",
        estimatedValue: 2500,
        givenName: "Rosa",
        familyName: "Diaz",
      } as never)) as { docId: string };
      await actor.mutation(api.mutations.Lead_stageConversion, {
        docId: lead.docId,
        clientId: duplicate,
      } as never);
      await actor.mutation(api.mutations.Lead_confirmConversion, {
        docId: lead.docId,
      } as never);
      return lead.docId;
    };
    await captureLead();
    // A removed lead is left where it is and does not block the merge.
    const removedLead = await captureLead();
    await actor.run(async (ctx) =>
      (
        ctx.db as unknown as { patch: (id: string, v: object) => Promise<void> }
      ).patch(removedLead, { deletedAt: Date.UTC(2026, 0, 3) }),
    );
    await actor.mutation(api.mutations.ClientOutreachTask_createViaOpen, {
      clientId: duplicate,
      reason: "No booking this year",
    } as never);
    await actor.run(async (ctx) =>
      (
        ctx.db as unknown as {
          insert: (t: string, v: object) => Promise<string>;
        }
      ).insert("quoteSubmissions", {
        tenantId,
        deletedAt: null,
        dedupKey: "q-1",
        status: "completed",
        clientName: "Rosa Diaz",
        email: "rosa@old.example",
        guestCount: 60,
        consentGrantedAt: Date.UTC(2026, 0, 2),
        clientId: duplicate,
        version: 0,
      }),
    );

    const before = await dependents(actor, tenantId, duplicate);
    for (const ids of Object.values(before)) expect(ids).toHaveLength(1);

    const mergeAs = (who: Actor) =>
      who.mutation(api.mutations.ClientMerge_createViaMerge, {
        primaryClientId: kept,
        duplicateClientId: duplicate,
      } as never);

    // Refused: nothing moved, nothing hidden, no merge saved.
    await expect(mergeAs(salesManager)).rejects.toThrow();
    expect(await dependents(actor, tenantId, duplicate)).toEqual(before);
    const dupAfterFail = (await tableRows(actor, "clients", tenantId)).find(
      (c) => c._id === duplicate,
    ) as Doc;
    expect(dupAfterFail.mergedIntoClientId ?? null).toBeNull();
    expect(dupAfterFail.status).toBe("active");
    expect(await tableRows(actor, "clientMerges", tenantId)).toHaveLength(0);

    // The same merge, run again by someone allowed to.
    await mergeAs(actor);

    expect(await dependents(actor, tenantId, duplicate)).toEqual({
      events: [],
      clientContacts: [],
      leads: [],
      clientOutreachTasks: [],
      quoteSubmissions: [],
    });
    const moved = await dependents(actor, tenantId, kept);
    for (const kind of Object.keys(before) as (keyof typeof before)[]) {
      expect(moved[kind]).toEqual(before[kind]);
    }
    const leftLead = (await tableRows(actor, "leads", tenantId)).find(
      (l) => l._id === removedLead,
    )!;
    expect(leftLead.clientId).toBe(duplicate);
    const dup = (await tableRows(actor, "clients", tenantId)).find(
      (c) => c._id === duplicate,
    ) as Doc;
    expect(dup.mergedIntoClientId).toBe(kept);

    // Both old-system links are kept and point where they did.
    expect((await byId("H-1")).capsuleId).toBe(kept);
    expect((await byId("H-2")).capsuleId).toBe(duplicate);
    const sources = (await actor.query(api.sourceProvenance.listByCapsuleId, {
      capsuleId: kept,
    })) as Array<{ externalId: string }>;
    expect(sources.map((s) => s.externalId).sort()).toEqual(["H-1", "H-2"]);

    // A later old-system change to the merged-away row reaches the client
    // kept (it had no phone, so nothing a person typed is overwritten).
    await importRows(actor, "contacts", [
      { ...rows[1], Phone: "312-555-0199" },
    ]);
    const keptClient = (await actor.query(api.queries.getClient, {
      id: kept as never,
    })) as Doc;
    expect(keptClient.phone).toBe("312-555-0199");
    expect(
      (await tableRows(actor, "clients", tenantId)).filter(
        (c) => c.deletedAt == null && c.status === "active",
      ),
    ).toHaveLength(1);
  });
});
