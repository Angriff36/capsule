/**
 * Runtime proof (PL-AUTH, AC-210 / AC-372 import run actor): the person an
 * import step records as the one who did it comes from the sign-in, never
 * from the caller. The ImportRun commands used to take an optional actorId,
 * so any caller could write another name onto the import run and its
 * history. Now a supplied actorId is refused and every step records the
 * signed-in person. Synthetic workspaces and records only.
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

type RunRow = { actorId: string; status: string };
type EventRow = { type: string; payload: { actorId?: string } };

async function readRun(actor: Actor, importRunId: string) {
  return (await actor.run(async (ctx) => {
    const db = (
      ctx as unknown as {
        db: {
          get: (id: string) => Promise<RunRow | null>;
          query: (table: string) => { collect: () => Promise<EventRow[]> };
        };
      }
    ).db;
    const run = await db.get(importRunId);
    const events = (await db.query("manifestEvents").collect()).filter((row) =>
      row.type.startsWith("ImportRun"),
    );
    return { run, events };
  })) as { run: RunRow | null; events: EventRow[] };
}

async function refused(call: () => Promise<unknown>) {
  try {
    await call();
    return false;
  } catch {
    return true;
  }
}

describe("runtime proof: import steps record the signed-in person (AC-210 / AC-372)", () => {
  it("refuses a supplied actorId and records who is signed in", async () => {
    const proof = harness();
    const tenantId = "tenant-import-run-actor";
    const owner = proof.asRole({
      subject: "import-run-actor-owner",
      role: "owner",
      tenantId,
    });
    const manager = proof.asRole({
      subject: "import-run-actor-manager",
      role: "kitchen_manager",
      tenantId,
    });

    const { importRunId } = (await owner.mutation(
      api.importCoordinator.startImport,
      { sourceSystem: "tpp_legacy", datasetType: "events" },
    )) as { importRunId: string };
    expect((await readRun(owner, importRunId)).run?.actorId).toBe(
      "import-run-actor-owner",
    );

    // A caller can no longer name someone else as the one who did the step.
    expect(
      await refused(() =>
        manager.mutation(api.mutations.ImportRun_recordParse, {
          docId: importRunId,
          recordCounts: "{}",
          actorId: "import-run-actor-owner",
        } as never),
      ),
    ).toBe(true);
    let state = await readRun(owner, importRunId);
    expect(state.run?.status).toBe("started");
    expect(state.run?.actorId).toBe("import-run-actor-owner");

    // Without it, the step records the signed-in manager, on the run and in
    // the history entry of the step.
    await manager.mutation(api.mutations.ImportRun_recordParse, {
      docId: importRunId,
      recordCounts: "{}",
    } as never);
    state = await readRun(owner, importRunId);
    expect(state.run?.status).toBe("parsing");
    expect(state.run?.actorId).toBe("import-run-actor-manager");
    const parsed = state.events.find((row) => row.type === "ImportRunParsed");
    expect(parsed?.payload.actorId).toBe("import-run-actor-manager");

    // The same holds for a step with no other inputs, and for marking the
    // import failed.
    expect(
      await refused(() =>
        owner.mutation(api.mutations.ImportRun_validate, {
          docId: importRunId,
          actorId: "import-run-actor-manager",
        } as never),
      ),
    ).toBe(true);
    await owner.mutation(api.mutations.ImportRun_validate, {
      docId: importRunId,
    } as never);
    expect((await readRun(owner, importRunId)).run?.actorId).toBe(
      "import-run-actor-owner",
    );
    expect(
      await refused(() =>
        owner.mutation(api.mutations.ImportRun_markFailed, {
          docId: importRunId,
          failureDetails: "Wrong file",
          actorId: "import-run-actor-manager",
        } as never),
      ),
    ).toBe(true);
    await manager.mutation(api.mutations.ImportRun_markFailed, {
      docId: importRunId,
      failureDetails: "Wrong file",
    } as never);
    state = await readRun(owner, importRunId);
    expect(state.run?.status).toBe("failed");
    expect(state.run?.actorId).toBe("import-run-actor-manager");
    const failed = state.events.find((row) => row.type === "ImportRunFailed");
    expect(failed?.payload.actorId).toBe("import-run-actor-manager");
  });
});
