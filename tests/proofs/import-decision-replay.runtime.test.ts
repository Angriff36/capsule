/**
 * Runtime proof (AC-065, PL-SOURCE-RESOLUTION, PR02-09): a decision made on
 * the import match list (checked, skipped, or matched) survives a reload and
 * an identical replay of the same file, and an imported record goes through
 * the same list, edit and archive paths as one typed into Capsule.
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
    kitchenManager: proof.asRole({
      subject: `${tenantId}-kitchen`,
      role: "kitchen_manager",
      tenantId,
    }) as Actor,
  };
}

// The decision fields a replay must leave exactly as the person left them.
const decision = (link: Record<string, unknown>) => ({
  capsuleId: link.capsuleId,
  conflictStatus: link.conflictStatus,
  verified: link.verified,
  verifiedByUserId: link.verifiedByUserId,
  resolvedByUserId: link.resolvedByUserId,
  resolutionNote: link.resolutionNote,
  decision: link.decision,
});

describe("runtime proof: mapping decisions survive reload and replay (AC-065)", () => {
  it("a resolved or verified mapping survives an identical replay unchanged", async () => {
    const tenantId = "tenant-decision-replay";
    const { owner } = tenant(tenantId);
    const rows = [
      { ContactID: "C-1", FirstName: "Ana", LastName: "Lopez" },
      { ContactID: "C-2", FirstName: "Ana", LastName: "Lopez" },
    ];
    await importRows(owner, "contacts", rows);
    const lookAlike = (await links(owner, tenantId)).find(
      (l) => l.externalId === "C-2",
    )!;
    expect(lookAlike.conflictStatus).toBe("pending_conflict");

    // A person checks it: a different Ana Lopez.
    await owner.mutation(api.mutations.ExternalRecordLink_verifyLink, {
      docId: lookAlike._id as never,
      verified: true,
    });
    // Reload: the decision is read back from the link.
    const reloaded = (await links(owner, tenantId)).map(
      (l) => [l.externalId, decision(l)] as const,
    );
    expect(Object.fromEntries(reloaded)["C-2"]).toMatchObject({
      conflictStatus: "resolved",
      verified: true,
    });

    const replay = await importRows(owner, "contacts", rows);
    expect(replay).toMatchObject({ committed: 0, pending: 0 });
    const after = Object.fromEntries(
      (await links(owner, tenantId)).map(
        (l) => [l.externalId, decision(l)] as const,
      ),
    );
    expect(after).toEqual(Object.fromEntries(reloaded));
    expect(
      (await tableRows(owner, "clients", tenantId)).filter(
        (c) => c.deletedAt == null,
      ),
    ).toHaveLength(2);
  });

  it("a row a person skipped stays skipped on the next import", async () => {
    const tenantId = "tenant-decision-skip";
    const { owner, kitchenManager } = tenant(tenantId);
    const rows = [{ ContactID: "C-9", FirstName: "Old", LastName: "Test" }];
    // This person cannot add clients, so the row waits with no record.
    await expect(
      importRows(kitchenManager, "contacts", rows),
    ).rejects.toThrow();
    const waiting = (await links(owner, tenantId))[0]!;
    expect(waiting.capsuleId).toBe("");

    await owner.mutation(api.mutations.ExternalRecordLink_resolveConflict, {
      docId: waiting._id as never,
      conflictStatus: "resolved",
      resolutionNote: "Skipped while matching leftover items",
    });
    const skipped = decision((await links(owner, tenantId))[0]!);

    // The owner could add the client, but the skip is the person's answer.
    const replay = await importRows(owner, "contacts", rows);
    expect(replay).toMatchObject({ committed: 0, pending: 0, skipped: 1 });
    expect(await tableRows(owner, "clients", tenantId)).toHaveLength(0);
    expect(decision((await links(owner, tenantId))[0]!)).toEqual(skipped);
  });

  it("an imported client is listed, edited and archived like any other", async () => {
    const tenantId = "tenant-decision-native";
    const { owner } = tenant(tenantId);
    await importRows(owner, "contacts", [
      { ContactID: "C-1", FirstName: "Ana", LastName: "Lopez" },
    ]);
    const id = (await links(owner, tenantId))[0]!.capsuleId as string;

    const listed = (await owner.query(api.queries.listClient, {})) as {
      _id: string;
    }[];
    expect(listed.map((c) => c._id)).toContain(id);

    await owner.mutation(api.mutations.Client_changeContact, {
      docId: id as never,
      email: "ana@example.com",
    });
    await owner.mutation(api.mutations.Client_archive, {
      docId: id as never,
      reason: "Moved away",
    });
    const row = (await owner.query(api.queries.getClient, {
      id: id as never,
    })) as Record<string, unknown> | null;
    expect(row).toMatchObject({ email: "ana@example.com" });
    expect(row?.status).not.toBe("active");
  });
});
