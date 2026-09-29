/**
 * Runtime proof (governed writes, 2026-09-29): TPP report favorites and
 * assistant upload registrations change only through generated commands.
 *
 * - convex/tppReportFavorites.ts `setFavorite` → TppReportFavorite.create /
 *   unfavorite (soft delete) / refavorite, owner-only.
 * - convex/assistantConfig.ts `registerUpload` → AssistantUpload.register as
 *   the caller tenant's system role, naming the caller; a direct call cannot
 *   claim a blob.
 */
import { convexTest } from "convex-test";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import { TPP_DEFAULT_FAVORITES } from "../../src/features/reports/tpp/catalog";
import { modules } from "./convex-test-modules";
import { ensureTestFieldEncryptionKey } from "./test-field-encryption-key";

beforeAll(ensureTestFieldEncryptionKey);

const TENANT = "tenant-favorites-governed";

function harness() {
  const t = convexTest(schema, modules);
  const proof = createManifestTestContext({
    convexTest: (() => t) as never,
    schema,
    modules,
  });
  return { t, proof };
}
type Harness = ReturnType<typeof harness>;

async function addStaff(
  { t }: Harness,
  subject: string,
): Promise<Id<"people">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("people", {
      tenantId: TENANT,
      givenName: "Pat",
      familyName: subject,
      email: `${subject}@example.test`,
      role: "kitchen_staff",
      employmentType: "full_time",
      status: "active",
      authSubjectId: subject,
      version: 1,
    }),
  );
}

const as = (h: Harness, subject: string) =>
  h.proof.asRole({ subject, role: "kitchen_staff", tenantId: TENANT });

async function eventTypes({ t }: Harness): Promise<string[]> {
  return await t.run(async (ctx) =>
    (await ctx.db.query("manifestEvents").collect()).map((row) => row.type),
  );
}

describe("TPP report favorites", () => {
  it("first use seeds the defaults; unfavorite and favorite again reuse one row", async () => {
    const h = harness();
    await addStaff(h, "cook");
    const cook = as(h, "cook");
    const reportId = TPP_DEFAULT_FAVORITES[0]!;

    await cook.mutation(api.tppReportFavorites.setFavorite, {
      reportId,
      favorite: false,
    });
    let mine = (await cook.query(api.tppReportFavorites.listMine, {})) as {
      initialized: boolean;
      reportIds: string[];
    };
    expect(mine.initialized).toBe(true);
    expect(mine.reportIds).toEqual(
      TPP_DEFAULT_FAVORITES.filter((id) => id !== reportId),
    );

    await cook.mutation(api.tppReportFavorites.setFavorite, {
      reportId,
      favorite: true,
    });
    await cook.mutation(api.tppReportFavorites.setFavorite, {
      reportId,
      favorite: true,
    });
    mine = (await cook.query(api.tppReportFavorites.listMine, {})) as {
      initialized: boolean;
      reportIds: string[];
    };
    expect([...mine.reportIds].sort()).toEqual(
      [...TPP_DEFAULT_FAVORITES].sort(),
    );

    const rows = await h.t.run(async (ctx) =>
      ctx.db.query("tppReportFavorites").collect(),
    );
    // The marker plus one row per default; the unfavorited one was restored.
    expect(rows).toHaveLength(TPP_DEFAULT_FAVORITES.length + 1);
    expect(rows.every((row) => row.deletedAt == null)).toBe(true);
    const types = await eventTypes(h);
    expect(
      types.filter((type) => type === "TppReportUnfavorited"),
    ).toHaveLength(1);
    expect(types.filter((type) => type === "TppReportFavorited")).toHaveLength(
      TPP_DEFAULT_FAVORITES.length + 2,
    );
  });

  it("only the owner changes a favorite, and a report is a favorite once", async () => {
    const h = harness();
    await addStaff(h, "cook");
    await addStaff(h, "server");
    const reportId = TPP_DEFAULT_FAVORITES[0]!;
    await as(h, "cook").mutation(api.tppReportFavorites.setFavorite, {
      reportId,
      favorite: true,
    });
    const row = await h.t.run(async (ctx) =>
      (await ctx.db.query("tppReportFavorites").collect()).find(
        (candidate) => candidate.reportId === reportId,
      ),
    );

    await expect(
      as(h, "server").mutation(api.mutations.TppReportFavorite_unfavorite, {
        docId: row!._id,
      }),
    ).rejects.toThrow(/their own report favorites/);
    await expect(
      as(h, "cook").mutation(api.mutations.TppReportFavorite_create, {
        reportId,
      }),
    ).rejects.toThrow(/already a favorite/);
    await expect(
      h.t.mutation(api.mutations.TppReportFavorite_create, { reportId }),
    ).rejects.toThrow(/Link your account/);
    await expect(
      h.t.mutation(api.tppReportFavorites.setFavorite, {
        reportId,
        favorite: true,
      }),
    ).rejects.toThrow(/Sign in/);
  });
});

describe("assistant upload registration", () => {
  it("registers an orphan blob to the caller once, through the command", async () => {
    const h = harness();
    await addStaff(h, "cook");
    const storageId = await h.t.run(async (ctx) =>
      String(await ctx.storage.store(new Blob(["menu notes"]))),
    );
    const cook = as(h, "cook");

    await cook.mutation(api.assistantConfig.registerUpload, {
      storageId,
      name: "notes.txt",
    });
    await cook.mutation(api.assistantConfig.registerUpload, {
      storageId,
      name: "notes.txt",
    });

    const rows = await h.t.run(async (ctx) =>
      ctx.db.query("assistantUploads").collect(),
    );
    expect(rows).toEqual([
      expect.objectContaining({
        tenantId: TENANT,
        storageId,
        uploadedByAuthSubjectId: "cook",
        name: "notes.txt",
      }),
    ]);
    const events = await h.t.run(async (ctx) =>
      (await ctx.db.query("manifestEvents").collect()).filter(
        (row) => row.type === "AssistantUploadRegistered",
      ),
    );
    expect(events.map((row) => row.payload)).toEqual([
      { assistantUploadId: rows[0]!._id, tenantId: TENANT, storageId },
    ]);
  });

  it("a direct call cannot claim a blob, and a signed-out caller cannot register", async () => {
    const h = harness();
    await addStaff(h, "cook");
    const storageId = await h.t.run(async (ctx) =>
      String(await ctx.storage.store(new Blob(["someone's file"]))),
    );

    await expect(
      as(h, "cook").mutation(api.mutations.AssistantUpload_createViaRegister, {
        storageId,
        name: "stolen.pdf",
        uploadedBy: "cook",
      }),
    ).rejects.toThrow(/Guard 0 failed/);
    await expect(
      h.t.mutation(api.assistantConfig.registerUpload, {
        storageId,
        name: "x",
      }),
    ).rejects.toThrow(/Sign in first/);
    expect(
      await h.t.run(async (ctx) => ctx.db.query("assistantUploads").collect()),
    ).toEqual([]);
  });
});
