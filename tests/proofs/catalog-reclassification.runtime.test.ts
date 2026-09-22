/**
 * Runtime proof (catalog reclassification, 2026-09-21): an imported TPP menu
 * row that is really a supply gets its kind; a row that is really a prep
 * step already tracked as a dish task is retired and its link points at the
 * task; an orphan prep item is retired with a reason; a rerun of the same
 * apply is a no-op; a row nobody approved is untouched.
 * Design: docs/systems/culinary-catalog-reclassification.md
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const TENANT = "tenant-catalog-cleanup";

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
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

type Row = Record<string, unknown> & { _id: string };

describe("runtime proof: catalog reclassification", () => {
  it("applies approved suggestions through governed commands and keeps history", async () => {
    const proof = harness();
    const kitchen = proof.asRole({
      subject: "kitchen-cleanup",
      role: "kitchen_manager",
      tenantId: TENANT,
    });

    const introduce = async (name: string, category?: string) =>
      (await proof.executeCommand(
        kitchen,
        api.mutations.Dish_createViaIntroduce,
        {
          name,
          portionSize: 1,
          portionUnit: "portion",
          ...(category ? { category } : {}),
        },
      )) as { docId: string };

    const parent = await introduce("Caesar Salad", "Finish at Kitchen");
    const plasticware = await introduce("Portion plasticware");
    const prep = await introduce("Portion croutons");
    const orphan = await introduce("Portion sea salt flakes");
    const untouched = await introduce("Chicken Marsala");

    const task = (await proof.executeCommand(
      kitchen,
      api.mutations.DishTask_createViaAdd,
      {
        dishId: parent.docId,
        name: "Portion croutons",
        category: "Finish at Kitchen",
      },
    )) as { docId: string };

    // The menus import links each Dish to its TPP row (recordType "menu").
    const now = Date.now();
    await kitchen.run(async (ctx) => {
      for (const [externalId, dishId] of [
        ["portion_plasticware", plasticware.docId],
        ["portion_croutons", prep.docId],
        ["portion_sea_salt_flakes", orphan.docId],
        ["chicken_marsala", untouched.docId],
      ] as const) {
        await ctx.db.insert("externalRecordLinks", {
          tenantId: TENANT,
          sourceSystem: "tpp_legacy",
          recordType: "menu",
          externalId,
          linkKey: `tpp_legacy||menu|${externalId}||0`,
          capsuleEntity: "menu",
          capsuleId: dishId,
          verified: false,
          conflictStatus: "resolved",
          deletedAt: null,
          createdAt: now,
          updatedAt: now,
          version: 0,
        });
      }
    });

    const candidates = (await kitchen.query(
      api.catalogReclassification.candidates,
      {},
    )) as {
      rows: { dishId: string; externalId: string }[];
      dishTasks: { dishTaskId: string; name: string }[];
    };
    expect(candidates.rows.map((r) => r.externalId).sort()).toEqual([
      "chicken_marsala",
      "portion_croutons",
      "portion_plasticware",
      "portion_sea_salt_flakes",
    ]);

    const base = {
      confidence: 1,
      ready: true,
      category: null,
      tpp: null,
      sourceText: null,
      notes: [],
    };
    const recorded = (await kitchen.mutation(
      api.catalogReclassification.recordSuggestions,
      {
        suggestions: [
          {
            ...base,
            dishId: plasticware.docId,
            externalId: "portion_plasticware",
            kind: "supply",
            source: "rule:tpp-prep-list",
            parents: [],
            existing: { componentId: null, dishTaskIds: [] },
          },
          {
            ...base,
            dishId: prep.docId,
            externalId: "portion_croutons",
            kind: "prep_step",
            source: "rule:tpp-prep-list",
            parents: [{ sak: "1", name: "Caesar Salad", dishId: parent.docId }],
            existing: { componentId: null, dishTaskIds: [task.docId] },
          },
          {
            ...base,
            dishId: orphan.docId,
            externalId: "portion_sea_salt_flakes",
            kind: "orphan",
            source: "rule:tpp-prep-list",
            parents: [],
            existing: { componentId: null, dishTaskIds: [] },
          },
          {
            ...base,
            dishId: untouched.docId,
            externalId: "chicken_marsala",
            kind: "food",
            source: "jev",
            confidence: 0.6,
            ready: false,
            category: "Finish at Event",
            parents: [],
            existing: { componentId: null, dishTaskIds: [] },
          },
        ],
      },
    )) as { inserted: number };
    expect(recorded.inserted).toBe(4);

    // Recording again is a no-op refresh, never a duplicate.
    const again = (await kitchen.mutation(
      api.catalogReclassification.recordSuggestions,
      {
        suggestions: [
          {
            ...base,
            dishId: plasticware.docId,
            externalId: "portion_plasticware",
            kind: "supply",
            source: "rule:tpp-prep-list",
            parents: [],
            existing: { componentId: null, dishTaskIds: [] },
          },
        ],
      },
    )) as { inserted: number; refreshed: number };
    expect(again).toMatchObject({ inserted: 0, refreshed: 1 });

    const plan = (await kitchen.query(
      api.catalogReclassification.plan,
      {},
    )) as {
      groups: {
        kind: string;
        ready: number;
        needsLook: number;
        rows: { linkId: string; name: string }[];
      }[];
    };
    const byKind = Object.fromEntries(plan.groups.map((g) => [g.kind, g]));
    expect(byKind.supply.ready).toBe(1);
    expect(byKind.food.needsLook).toBe(1);
    const approveIds = ["supply", "prep_step", "orphan"].map(
      (k) => byKind[k]!.rows[0]!.linkId,
    );

    await kitchen.mutation(api.catalogReclassification.decide, {
      linkIds: approveIds,
      decision: "approved",
    });
    const applied = (await kitchen.mutation(api.catalogReclassification.apply, {
      operationKey: "proof:cleanup:1",
      linkIds: approveIds,
    })) as { outcomes: { kind: string; outcome: string; error?: string }[] };
    expect(applied.outcomes.map((o) => o.error ?? null)).toEqual([
      null,
      null,
      null,
    ]);

    const dish = async (id: string) =>
      (await kitchen.run(async (ctx) => ctx.db.get(id))) as Row;
    expect((await dish(plasticware.docId)).kind).toBe("supply");
    expect((await dish(plasticware.docId)).status).toBe("active");

    const retiredPrep = await dish(prep.docId);
    expect(retiredPrep.status).toBe("retired");
    expect(String(retiredPrep.retirementReason)).toMatch(/prep step/i);

    const retiredOrphan = await dish(orphan.docId);
    expect(retiredOrphan.status).toBe("retired");
    expect(String(retiredOrphan.retirementReason)).toMatch(/no parent dish/i);

    expect((await dish(untouched.docId)).status).toBe("active");
    expect((await dish(untouched.docId)).kind ?? null).toBeNull();

    // The prep row's link now names the existing dish task and remembers the dish.
    const links = (await kitchen.run(async (ctx) =>
      ctx.db.query("externalRecordLinks").collect(),
    )) as Row[];
    const prepLink = links.find(
      (l) => l.role === "reclassify" && l.externalId === "portion_croutons",
    )!;
    expect(prepLink.capsuleEntity).toBe("dish_task");
    expect(prepLink.capsuleId).toBe(task.docId);
    expect(String(prepLink.resolutionNote)).toBe(`dish:${prep.docId}`);
    expect(prepLink.appliedAt).not.toBeNull();

    // Same operation key → the receipt answers, nothing runs twice.
    const rerun = (await kitchen.mutation(api.catalogReclassification.apply, {
      operationKey: "proof:cleanup:1",
      linkIds: approveIds,
    })) as { outcomes: unknown[] };
    expect(rerun.outcomes).toHaveLength(3);
    const after = (await kitchen.query(
      api.catalogReclassification.plan,
      {},
    )) as {
      groups: { kind: string; applied: number }[];
    };
    expect(
      after.groups
        .filter((g) => g.applied === 1)
        .map((g) => g.kind)
        .sort(),
    ).toEqual(["orphan", "prep_step", "supply"]);
  });
});
