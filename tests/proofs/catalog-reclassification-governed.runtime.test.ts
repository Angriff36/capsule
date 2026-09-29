/**
 * Runtime proof (governed writes, 2026-09-29): catalog reclassification
 * writes its suggestion links only through generated ExternalRecordLink
 * commands, run by the tenant system runner so the access the seam grants
 * stays exactly as it was.
 *
 * - kitchen_staff holds kitchenAccess but not importAccess, and can still
 *   record, refresh, decide and apply suggestions (the seam's gate);
 *   sales_staff is still refused.
 * - Each step is a command with its event: ExternalRecordLinked (resolved,
 *   so the reconcile queue never sees it), ExternalRecordSuggestionRefreshed,
 *   ExternalRecordReclassificationDecided (decidedByUserId is the person,
 *   not the system), ExternalRecordReclassified, ExternalRecordReclassifyFailed.
 * - The generated commands refuse a kitchen_staff caller directly, so the
 *   runner is the only path that elevates.
 * - A decided suggestion is kept on re-record; an apply rerun is a no-op.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";
import { ensureTestFieldEncryptionKey } from "./test-field-encryption-key";

const TENANT = "tenant-catalog-governed";

function harness() {
  return createManifestTestContext({
    convexTest: convexTest as never,
    schema,
    modules,
  });
}

beforeAll(ensureTestFieldEncryptionKey);

type Row = Record<string, unknown> & { _id: string };

const base = {
  confidence: 1,
  ready: true,
  category: null,
  tpp: null,
  sourceText: null,
  notes: [],
  parents: [],
  existing: { componentId: null, dishTaskIds: [] },
};

describe("runtime proof: governed catalog reclassification links", () => {
  it("keeps kitchen_staff access and records every link change as a command", async () => {
    const proof = harness();
    const staff = proof.asRole({
      subject: "catalog-governed-staff",
      role: "kitchen_staff",
      tenantId: TENANT,
    });
    const sales = proof.asRole({
      subject: "catalog-governed-sales",
      role: "sales_staff",
      tenantId: TENANT,
    });

    const introduce = async (name: string) =>
      (
        (await proof.executeCommand(
          staff,
          api.mutations.Dish_createViaIntroduce,
          {
            name,
            portionSize: 1,
            portionUnit: "portion",
          },
        )) as { docId: string }
      ).docId;
    const plasticware = await introduce("Portion plasticware");
    const vanished = await introduce("Portion vanished");

    const suggestion = (dishId: string, externalId: string, kind: string) => ({
      ...base,
      dishId,
      externalId,
      kind,
      source: "rule:tpp-prep-list",
    });
    const record = (actor: typeof staff, suggestions: unknown[]) =>
      actor.mutation(api.catalogReclassification.recordSuggestions, {
        suggestions,
      });

    await expect(
      record(sales, [suggestion(plasticware, "portion_plasticware", "supply")]),
    ).rejects.toThrow();

    expect(
      await record(staff, [
        suggestion(plasticware, "portion_plasticware", "supply"),
        suggestion(vanished, "portion_vanished", "orphan"),
      ]),
    ).toMatchObject({ inserted: 2 });
    const links = async () =>
      (await staff.run(async (ctx) =>
        (await ctx.db.query("externalRecordLinks").collect()).filter(
          (link) => link.role === "reclassify",
        ),
      )) as Row[];
    let rows = await links();
    expect(rows).toHaveLength(2);
    for (const link of rows) {
      expect(link).toMatchObject({
        decision: "suggested",
        conflictStatus: "resolved",
        verified: false,
        deletedAt: null,
      });
    }
    const events = async (type: string) =>
      (await staff.run(async (ctx) =>
        (await ctx.db.query("manifestEvents").collect()).filter(
          (row) => row.type === type,
        ),
      )) as Row[];
    expect(await events("ExternalRecordLinked")).toHaveLength(2);

    // The generated command itself still refuses kitchen_staff directly.
    await expect(
      staff.mutation(api.mutations.ExternalRecordLink_refreshSuggestion, {
        docId: rows[0]._id,
        capsuleEntity: "dish",
        metadata: "{}",
        suggestedBy: "x",
      }),
    ).rejects.toThrow("Staff may see import matches");

    // Refresh re-records the suggestion through its command.
    expect(
      await record(staff, [
        suggestion(plasticware, "portion_plasticware", "supply"),
      ]),
    ).toMatchObject({ inserted: 0, refreshed: 1 });
    expect(await events("ExternalRecordSuggestionRefreshed")).toHaveLength(1);

    const linkFor = (externalId: string) =>
      rows.find((link) => link.externalId === externalId)!._id;
    await staff.mutation(api.catalogReclassification.decide, {
      linkIds: [linkFor("portion_plasticware"), linkFor("portion_vanished")],
      decision: "approved",
    });
    rows = await links();
    for (const link of rows) {
      expect(link).toMatchObject({
        decision: "approved",
        decidedByUserId: "catalog-governed-staff",
        // Approving a cleanup suggestion is not an import identity.
        verified: false,
      });
    }
    const decided = await events("ExternalRecordReclassificationDecided");
    expect(decided).toHaveLength(2);
    expect(decided[0].payload).toMatchObject({
      decidedByUserId: "catalog-governed-staff",
    });

    // A decided suggestion is kept when the planner records it again.
    expect(
      await record(staff, [
        suggestion(plasticware, "portion_plasticware", "supply"),
      ]),
    ).toMatchObject({ kept: 1, refreshed: 0 });

    // The vanished dish is gone before apply: that row fails with a note.
    await staff.run(async (ctx) => {
      await ctx.db.patch(vanished as never, { deletedAt: Date.now() });
    });
    const applied = (await staff.mutation(api.catalogReclassification.apply, {
      operationKey: "proof:governed:1",
      linkIds: [linkFor("portion_plasticware"), linkFor("portion_vanished")],
    })) as { outcomes: { outcome: string; error?: string }[] };
    expect(applied.outcomes.map((o) => o.outcome)).toEqual([
      "kind=supply",
      "failed",
    ]);
    rows = await links();
    const plasticLink = rows.find(
      (link) => link.externalId === "portion_plasticware",
    )!;
    expect(plasticLink).toMatchObject({
      capsuleEntity: "dish",
      capsuleId: plasticware,
      appliedValues: "kind=supply",
      resolutionNote: `dish:${plasticware}`,
    });
    expect(typeof plasticLink.appliedAt).toBe("number");
    const failedLink = rows.find(
      (link) => link.externalId === "portion_vanished",
    )!;
    expect(failedLink.appliedAt ?? null).toBeNull();
    expect(String(failedLink.resolutionNote)).toBe(
      `dish:${vanished} failed: Dish not found`,
    );
    expect(await events("ExternalRecordReclassified")).toHaveLength(1);
    expect(await events("ExternalRecordReclassifyFailed")).toHaveLength(1);

    // Same operation key: the receipt answers and nothing is written again.
    await staff.mutation(api.catalogReclassification.apply, {
      operationKey: "proof:governed:1",
      linkIds: [linkFor("portion_plasticware"), linkFor("portion_vanished")],
    });
    expect(await events("ExternalRecordReclassified")).toHaveLength(1);
    expect(await events("ExternalRecordReclassifyFailed")).toHaveLength(1);
  });
});
