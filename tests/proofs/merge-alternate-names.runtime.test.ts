/**
 * Runtime proof (AC-181, PL-SOURCE-IDENTITY): when two imported clients are
 * merged, the client kept still shows the other one's earlier name and keeps
 * both old-system links, so a later import of either row still finds its
 * client and makes no new one. A merge chain keeps every earlier name.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  ensureEncryptionKey,
  importRows,
  links,
  ownerOf,
  tableRows,
} from "./source-identity.runtime.helpers";

beforeAll(ensureEncryptionKey);

type SourceLink = { externalId: string; mergedFromName: string | null };

describe("runtime proof: merges keep earlier names and source links (AC-181)", () => {
  it("after a merge the surviving record shows the duplicate's prior names and keeps both source links", async () => {
    const tenantId = "tenant-merge-alternate-names";
    const actor = ownerOf(tenantId);

    await importRows(actor, "contacts", [
      { ContactID: "M-1", FirstName: "Katherine", LastName: "Reyes" },
      { ContactID: "M-2", FirstName: "Kate", LastName: "Reyes-Moss" },
      { ContactID: "M-3", FirstName: "Katie", LastName: "Moss" },
    ]);
    const all = await links(actor, tenantId);
    const idOf = (ext: string) =>
      String(all.find((l) => l.externalId === ext)!.capsuleId);
    const kept = idOf("M-1");

    const merge = (duplicateClientId: string, primaryClientId: string) =>
      actor.mutation(api.mutations.ClientMerge_createViaMerge, {
        primaryClientId,
        duplicateClientId,
      } as never);
    // M-3 into M-2, then M-2 into M-1: a chain.
    await merge(idOf("M-3"), idOf("M-2"));
    await merge(idOf("M-2"), kept);

    const earlier = (await actor.query(api.sourceProvenance.listMergedClients, {
      clientId: kept,
    })) as Array<{ name: string }>;
    expect(earlier.map((row) => row.name).sort()).toEqual([
      "Kate Reyes-Moss",
      "Katie Moss",
    ]);

    const sources = (await actor.query(api.sourceProvenance.listByCapsuleId, {
      capsuleId: kept,
    })) as SourceLink[];
    expect(
      Object.fromEntries(sources.map((s) => [s.externalId, s.mergedFromName])),
    ).toEqual({
      "M-1": null,
      "M-2": "Kate Reyes-Moss",
      "M-3": "Katie Moss",
    });

    // The links themselves are untouched, so a later import of the merged
    // rows finds them and adds no client.
    const again = await importRows(actor, "contacts", [
      { ContactID: "M-2", FirstName: "Kate", LastName: "Reyes-Moss" },
    ]);
    expect(again).toMatchObject({ committed: 0, pending: 0 });
    const active = (await tableRows(actor, "clients", tenantId)).filter(
      (c) => c.deletedAt == null && c.status !== "archived",
    );
    expect(active.map((c) => c._id)).toEqual([kept]);

    // An old-system event for the merged-away client lands on the client kept.
    await importRows(actor, "events", [
      {
        EventID: "ME-1",
        EventName: "Moss Shower",
        EventDate: "2026-10-20",
        StartTime: "11:00",
        EndTime: "14:00",
        ExpectedCount: 30,
        ClientID: "M-3",
        EventStatus: "Definite",
      },
    ]);
    const eventLink = (await links(actor, tenantId)).find(
      (l) => l.externalId === "ME-1",
    )!;
    const event = (await actor.query(api.queries.getEvent, {
      id: eventLink.capsuleId as never,
    })) as { clientId: string };
    expect(event.clientId).toBe(kept);
  });
});
