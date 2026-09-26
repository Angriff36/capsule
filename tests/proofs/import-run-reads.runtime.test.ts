/**
 * Runtime proof (PL-AUTH, AC-212 import run reads): the hand-written import
 * run reads in convex/importCoordinator.ts give the same answer as the
 * ImportRun read policy (importAccess) and the generated reads. A manager
 * sees the run; a field staff member of the same workspace, a person from
 * another workspace, and anyone after the run is removed see nothing.
 * Synthetic workspaces and records only.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

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

type Actor = ReturnType<ReturnType<typeof harness>["asRole"]>;

async function statusOutcome(actor: Actor, importRunId: string) {
  try {
    const run = (await actor.query(api.importCoordinator.getImportRunStatus, {
      importRunId: importRunId as never,
    })) as { id: string };
    return { id: run.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { error: message.includes("Import run not found") };
  }
}

async function listedIds(actor: Actor) {
  const rows = (await actor.query(api.importCoordinator.listImportRuns, {
    status: "started",
  })) as Array<{ id: string }>;
  return rows.map((row) => row.id);
}

describe("runtime proof: import run reads follow the ImportRun read policy (AC-212)", () => {
  it("only an import manager of the workspace reads a live run", async () => {
    const proof = harness();
    const tenantId = "tenant-import-run-reads";
    const owner = proof.asRole({
      subject: "import-run-reads-owner",
      role: "owner",
      tenantId,
    });
    const staff = proof.asRole({
      subject: "import-run-reads-staff",
      role: "event_staff",
      tenantId,
    });
    const outsider = proof.asRole({
      subject: "import-run-reads-outsider",
      role: "owner",
      tenantId: "tenant-import-run-reads-other",
    });

    const { importRunId } = (await owner.mutation(
      api.importCoordinator.startImport,
      { sourceSystem: "tpp_legacy", datasetType: "events" },
    )) as { importRunId: string };

    // Control: the owner reads the run, and the status filter matches it.
    expect(await statusOutcome(owner, importRunId)).toEqual({
      id: importRunId,
    });
    expect(await listedIds(owner)).toEqual([importRunId]);

    // Field staff of the same workspace: no importAccess, so nothing.
    expect(await statusOutcome(staff, importRunId)).toEqual({ error: true });
    expect(await listedIds(staff)).toEqual([]);

    // Another workspace: not found, and its list is empty.
    expect(await statusOutcome(outsider, importRunId)).toEqual({
      error: true,
    });
    expect(await listedIds(outsider)).toEqual([]);

    // A removed run answers not found and leaves the list, for the owner too.
    await owner.run(async (ctx) => {
      const db = (
        ctx as unknown as {
          db: { patch: (id: string, value: object) => Promise<void> };
        }
      ).db;
      await db.patch(importRunId, { deletedAt: Date.now() });
    });
    expect(await statusOutcome(owner, importRunId)).toEqual({ error: true });
    expect(await listedIds(owner)).toEqual([]);
  });
});
