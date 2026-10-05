/**
 * Runtime proof (PL-AUTH, AC-210 / AC-372 import match actor): the person an
 * import match step records as the one who checked, approved or settled it
 * comes from the sign-in, never from the caller. ExternalRecordLink link,
 * decide, verifyLink, resolveConflict and unlinkExternalRecord and
 * ImportConflict settle used to take that name from the caller, so any staff
 * member with import access could write another person as the one who
 * approved a match. Now a supplied name is refused and every step records
 * the signed-in person. Synthetic workspaces and records only.
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

type Row = Record<string, unknown>;
type EventRow = { type: string; payload: Record<string, unknown> };

async function read(actor: Actor, id: string) {
  return (await actor.run(async (ctx) => {
    const db = (
      ctx as unknown as {
        db: {
          get: (id: string) => Promise<Row | null>;
          query: (table: string) => { collect: () => Promise<EventRow[]> };
        };
      }
    ).db;
    const row = await db.get(id);
    const events = await db.query("manifestEvents").collect();
    return { row, events };
  })) as { row: Row | null; events: EventRow[] };
}

async function refused(call: () => Promise<unknown>) {
  try {
    await call();
    return false;
  } catch {
    return true;
  }
}

const linkArgs = (externalId: string) => ({
  sourceSystem: "tpp_legacy",
  recordType: "client",
  externalId,
  capsuleEntity: "client",
  capsuleId: `capsule-${externalId}`,
});

describe("runtime proof: import match steps record the signed-in person (AC-210 / AC-372)", () => {
  it("refuses a supplied name and records who is signed in", async () => {
    const proof = harness();
    const tenantId = "tenant-import-match-actor";
    const owner = proof.asRole({
      subject: "import-match-actor-owner",
      role: "owner",
      tenantId,
    });
    const manager = proof.asRole({
      subject: "import-match-actor-manager",
      role: "kitchen_manager",
      tenantId,
    });

    // link: a caller can no longer name who checked the match.
    expect(
      await refused(() =>
        manager.mutation(api.mutations.ExternalRecordLink_createViaLink, {
          ...linkArgs("ext-1"),
          verified: true,
          verifiedByUserId: "import-match-actor-owner",
        } as never),
      ),
    ).toBe(true);
    const { docId: linkId } = (await manager.mutation(
      api.mutations.ExternalRecordLink_createViaLink,
      { ...linkArgs("ext-1"), verified: true } as never,
    )) as { docId: string };
    let state = await read(owner, linkId);
    expect(state.row?.verifiedByUserId).toBe("import-match-actor-manager");

    // decide: approval records the signed-in owner as decider, checker and
    // resolver.
    expect(
      await refused(() =>
        owner.mutation(api.mutations.ExternalRecordLink_decide, {
          docId: linkId,
          decision: "approved",
          decidedByUserId: "import-match-actor-manager",
        } as never),
      ),
    ).toBe(true);
    state = await read(owner, linkId);
    expect(state.row?.decision).toBe("suggested");
    await owner.mutation(api.mutations.ExternalRecordLink_decide, {
      docId: linkId,
      decision: "approved",
    } as never);
    state = await read(owner, linkId);
    expect(state.row?.decision).toBe("approved");
    expect(state.row?.decidedByUserId).toBe("import-match-actor-owner");
    expect(state.row?.verifiedByUserId).toBe("import-match-actor-owner");
    expect(state.row?.resolvedByUserId).toBe("import-match-actor-owner");

    // verifyLink: the check and its history entry name the signed-in person.
    const { docId: secondId } = (await owner.mutation(
      api.mutations.ExternalRecordLink_createViaLink,
      linkArgs("ext-2") as never,
    )) as { docId: string };
    expect(
      await refused(() =>
        manager.mutation(api.mutations.ExternalRecordLink_verifyLink, {
          docId: secondId,
          verified: true,
          verifiedByUserId: "import-match-actor-owner",
        } as never),
      ),
    ).toBe(true);
    state = await read(owner, secondId);
    expect(state.row?.verified).toBe(false);
    await manager.mutation(api.mutations.ExternalRecordLink_verifyLink, {
      docId: secondId,
      verified: true,
    } as never);
    state = await read(owner, secondId);
    expect(state.row?.verified).toBe(true);
    expect(state.row?.verifiedByUserId).toBe("import-match-actor-manager");
    const verifiedEvent = state.events.find(
      (row) =>
        row.type === "ExternalRecordVerified" &&
        row.payload.externalRecordLinkId === secondId,
    );
    expect(verifiedEvent?.payload.verifiedByUserId).toBe(
      "import-match-actor-manager",
    );

    // resolveConflict: the skip or payment match names the signed-in person.
    const { docId: thirdId } = (await owner.mutation(
      api.mutations.ExternalRecordLink_createViaLink,
      linkArgs("ext-3") as never,
    )) as { docId: string };
    expect(
      await refused(() =>
        manager.mutation(api.mutations.ExternalRecordLink_resolveConflict, {
          docId: thirdId,
          conflictStatus: "resolved",
          resolvedByUserId: "import-match-actor-owner",
        } as never),
      ),
    ).toBe(true);
    await manager.mutation(api.mutations.ExternalRecordLink_resolveConflict, {
      docId: thirdId,
      conflictStatus: "resolved",
      resolutionNote: "Skipped while matching leftover items",
    } as never);
    state = await read(owner, thirdId);
    expect(state.row?.conflictStatus).toBe("resolved");
    expect(state.row?.resolvedByUserId).toBe("import-match-actor-manager");

    // unlinkExternalRecord: the history entry names the signed-in person.
    expect(
      await refused(() =>
        owner.mutation(api.mutations.ExternalRecordLink_unlinkExternalRecord, {
          docId: thirdId,
          reason: "Wrong client",
          unlinkedByUserId: "import-match-actor-manager",
        } as never),
      ),
    ).toBe(true);
    await owner.mutation(
      api.mutations.ExternalRecordLink_unlinkExternalRecord,
      { docId: thirdId, reason: "Wrong client" } as never,
    );
    state = await read(owner, thirdId);
    const unlinked = state.events.find(
      (row) =>
        row.type === "ExternalRecordUnlinked" &&
        row.payload.externalRecordLinkId === thirdId,
    );
    expect(unlinked?.payload.unlinkedByUserId).toBe("import-match-actor-owner");

    // ImportConflict.settle: the person who settles a disagreement is the
    // signed-in person.
    const { docId: conflictId } = (await owner.mutation(
      api.mutations.ImportConflict_createViaRaise,
      {
        externalRecordLinkId: linkId,
        field: "name",
        appliedValue: "Old",
        capsuleValue: "Mine",
        sourceValue: "New",
      } as never,
    )) as { docId: string };
    expect(
      await refused(() =>
        manager.mutation(api.mutations.ImportConflict_settle, {
          docId: conflictId,
          resolution: "keep_capsule",
          resolvedByUserId: "import-match-actor-owner",
        } as never),
      ),
    ).toBe(true);
    state = await read(owner, conflictId);
    expect(state.row?.status).toBe("pending");
    await manager.mutation(api.mutations.ImportConflict_settle, {
      docId: conflictId,
      resolution: "keep_capsule",
    } as never);
    state = await read(owner, conflictId);
    expect(state.row?.status).toBe("keep_capsule");
    expect(state.row?.resolvedByUserId).toBe("import-match-actor-manager");
  });
});
