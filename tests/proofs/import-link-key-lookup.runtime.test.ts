/**
 * Runtime proof: importCommit link lookups use the canonical linkKey index.
 *
 * findLink/upsertLink used to read `by_tenantId` and `.filter` on
 * sourceSystem/recordType/externalId — a scan of every tenant link row per
 * imported row (9.36 GB + 7.76 GB Database I/O on prod, 2026-09-14). They now
 * look up `by_linkKey` with the key from `buildLinkKey` and keep the tenant
 * check. Rows written before linkKey existed become reachable through the
 * one-time `backfillLinkKeys` migration, not through a scan fallback.
 */
import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";
import { internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { buildLinkKey } from "../../convex/lib/culinaryModel/importMapping";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";

type TestConvex = ReturnType<typeof convexTest>;

const venue = {
  sourceSystem: "tpp_legacy",
  recordType: "venue",
  externalId: "V-100",
} as const;

const canonicalKey = (externalId: string) =>
  buildLinkKey({
    sourceSystem: venue.sourceSystem,
    sourceAccount: null,
    recordType: venue.recordType,
    externalId,
    role: null,
    ordinal: 0,
  });

function setup(): TestConvex {
  return convexTest(schema, modules);
}

async function seedRun(
  t: TestConvex,
  tenantId: string,
): Promise<Id<"importRuns">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("importRuns", {
      tenantId,
      sourceSystem: "tpp_legacy",
      datasetType: "venues",
      status: "committing",
      recordCounts: "{}",
      actorId: "proof-actor",
      deletedAt: null,
      version: 0,
    }),
  );
}

function upsertArgs(
  tenantId: string,
  runId: Id<"importRuns">,
  capsuleId = "venue-doc-1",
  externalId: string = venue.externalId,
) {
  return {
    tenantId,
    ...venue,
    externalId,
    capsuleEntity: "venue",
    capsuleId,
    sourceImportRunId: runId,
    rawSourceData: JSON.stringify({ externalId }),
    conflictStatus: "resolved" as const,
  };
}

async function linkRows(t: TestConvex) {
  return await t.run(async (ctx) =>
    ctx.db.query("externalRecordLinks").collect(),
  );
}

async function insertLegacyLink(
  t: TestConvex,
  tenantId: string,
  externalId: string,
): Promise<Id<"externalRecordLinks">> {
  // Shape of a row committed before linkKey existed: no linkKey field.
  return await t.run(async (ctx) =>
    ctx.db.insert("externalRecordLinks", {
      tenantId,
      sourceSystem: "tpp_legacy",
      recordType: venue.recordType,
      externalId,
      capsuleEntity: "venue",
      capsuleId: `legacy-${externalId}`,
      verified: false,
      conflictStatus: "resolved",
      deletedAt: null,
      version: 0,
    }),
  );
}

describe("importCommit link lookup by canonical linkKey", () => {
  it("finds an existing link by its canonical key", async () => {
    const t = setup();
    const runId = await seedRun(t, "tenant-a");
    const id = await t.mutation(
      internal.importCommit.upsertLink,
      upsertArgs("tenant-a", runId),
    );

    const found = await t.query(internal.importCommit.findLink, {
      tenantId: "tenant-a",
      ...venue,
    });
    expect(found?._id).toBe(id);
    expect(found?.linkKey).toBe(canonicalKey(venue.externalId));
  });

  it("a new link upserts exactly once", async () => {
    const t = setup();
    const runId = await seedRun(t, "tenant-a");
    await t.mutation(
      internal.importCommit.upsertLink,
      upsertArgs("tenant-a", runId),
    );

    const rows = await linkRows(t);
    expect(rows).toHaveLength(1);
    expect(rows[0].linkKey).toBe(canonicalKey(venue.externalId));
  });

  it("a repeated upsert updates the same row instead of duplicating", async () => {
    const t = setup();
    const runId = await seedRun(t, "tenant-a");
    const first = await t.mutation(
      internal.importCommit.upsertLink,
      upsertArgs("tenant-a", runId, "venue-doc-1"),
    );
    const second = await t.mutation(
      internal.importCommit.upsertLink,
      upsertArgs("tenant-a", runId, "venue-doc-2"),
    );

    expect(second).toBe(first);
    const rows = await linkRows(t);
    expect(rows).toHaveLength(1);
    expect(rows[0].capsuleId).toBe("venue-doc-2");
    expect(rows[0].version).toBe(1);
  });

  it("keeps tenants isolated when they share an external identity", async () => {
    const t = setup();
    const runA = await seedRun(t, "tenant-a");
    const runB = await seedRun(t, "tenant-b");
    const linkA = await t.mutation(
      internal.importCommit.upsertLink,
      upsertArgs("tenant-a", runA, "venue-a"),
    );

    expect(
      await t.query(internal.importCommit.findLink, {
        tenantId: "tenant-b",
        ...venue,
      }),
    ).toBeNull();

    const linkB = await t.mutation(
      internal.importCommit.upsertLink,
      upsertArgs("tenant-b", runB, "venue-b"),
    );
    expect(linkB).not.toBe(linkA);
    expect(await linkRows(t)).toHaveLength(2);

    const foundA = await t.query(internal.importCommit.findLink, {
      tenantId: "tenant-a",
      ...venue,
    });
    expect(foundA?._id).toBe(linkA);
    expect(foundA?.capsuleId).toBe("venue-a");
  });

  it("legacy rows without linkKey become usable after the backfill", async () => {
    const t = setup();
    const runId = await seedRun(t, "tenant-a");
    const legacyOne = await insertLegacyLink(t, "tenant-a", "V-OLD-1");
    const legacyTwo = await insertLegacyLink(t, "tenant-a", "V-OLD-2");

    // No scan fallback: before the backfill the index cannot see them.
    expect(
      await t.query(internal.importCommit.findLink, {
        tenantId: "tenant-a",
        ...venue,
        externalId: "V-OLD-1",
      }),
    ).toBeNull();

    vi.useFakeTimers();
    try {
      // batchSize 1 forces the self-scheduled second page.
      await t.mutation(internal.importCommit.backfillLinkKeys, {
        batchSize: 1,
      });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
    } finally {
      vi.useRealTimers();
    }

    const rows = await linkRows(t);
    expect(rows.map((row) => row.linkKey).sort()).toEqual(
      [canonicalKey("V-OLD-1"), canonicalKey("V-OLD-2")].sort(),
    );
    const foundOne = await t.query(internal.importCommit.findLink, {
      tenantId: "tenant-a",
      ...venue,
      externalId: "V-OLD-1",
    });
    expect(foundOne?._id).toBe(legacyOne);

    // Re-importing a backfilled identity patches the legacy row.
    const patched = await t.mutation(
      internal.importCommit.upsertLink,
      upsertArgs("tenant-a", runId, "venue-new", "V-OLD-2"),
    );
    expect(patched).toBe(legacyTwo);
    expect(await linkRows(t)).toHaveLength(2);
  });
});
