/**
 * Runtime proof (PL-PACK-RULES): AC-539 an excluded must-have keeps its
 * reason and what covers it, and readiness fails while nothing does;
 * AC-527 a pack list cannot be marked packed while a missing line or an
 * uncovered must-have is open, and a draft list blocks nothing else.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  createPlannedEvent,
  defineRule,
  harness,
  line,
  openPackList,
  packLines,
  readRow,
  rolesFor,
  runner,
  version,
  type PackLine,
} from "./pack-rules.runtime.helpers";

const M = api.mutations;

beforeAll(() => {
  process.env.CONVEX_FIELD_ENCRYPTION_KEY ||=
    "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
});

type Excluded = PackLine & {
  exclusionReason?: string;
  replacementDescription?: string;
  coveredBy?: string;
};

async function seed(tenantId: string) {
  const proof = harness();
  const roles = rolesFor(proof, tenantId);
  const { eventId } = await createPlannedEvent(
    proof,
    tenantId,
    "Pack readiness",
  );
  await defineRule(proof, tenantId, {
    trigger: "guest_count",
    description: "Handwashing station",
    category: "handwashing",
    baseQuantity: 1,
    requiredCapability: true,
  });
  const packListId = await openPackList(
    proof,
    tenantId,
    eventId,
    "Readiness list",
  );
  const run = runner(proof, roles.logistics);
  await run(M.PackListItem_createViaAddItem, {
    packListId,
    description: "Tongs",
    requiredQuantity: 6,
    unit: "each",
  });
  return { proof, roles, run, eventId, packListId };
}

describe("runtime proof: exclusions and pack readiness", () => {
  it("an exclusion records reason and accepted replacement and readiness fails while unresolved (AC-539)", async () => {
    const { proof, roles, run, packListId } = await seed(
      "tenant-pack-exclusion",
    );
    let lines = await packLines(
      roles.owner,
      "tenant-pack-exclusion",
      packListId,
    );
    const station = line(lines, "Handwashing station");
    await run(M.PackListItem_exclude, {
      docId: station._id,
      reason: "Venue has sinks by the kitchen",
    });
    await run(M.PackList_startPacking, {
      docId: packListId,
      version: await version(roles.owner, packListId),
    });
    await expect(
      run(M.PackList_markPacked, {
        docId: packListId,
        version: await version(roles.owner, packListId),
      }),
    ).rejects.toThrow(
      /"Handwashing station" was left off but it is a must-have/,
    );

    await run(M.PackListItem_exclude, {
      docId: station._id,
      reason: "Venue has sinks by the kitchen",
      replacementDescription: "Venue sinks",
      coveredBy: "equivalent",
    });
    const excluded = await readRow<Excluded>(roles.owner, station._id);
    expect(excluded).toMatchObject({
      exclusionReason: "Venue has sinks by the kitchen",
      replacementDescription: "Venue sinks",
      coveredBy: "equivalent",
    });
    expect(excluded.excludedAt).toEqual(expect.any(Number));
    await run(M.PackList_markPacked, {
      docId: packListId,
      version: await version(roles.owner, packListId),
    });
    expect(
      (await readRow<{ status: string }>(roles.owner, packListId)).status,
    ).toBe("packed");

    // A refresh keeps the exclusion.
    await proof.executeCommand(
      roles.logistics,
      api.lib.safeMaterialization.refreshPackRules,
      { packListId } as never,
    );
    lines = await packLines(roles.owner, "tenant-pack-exclusion", packListId);
    expect((line(lines, "Handwashing station") as Excluded).coveredBy).toBe(
      "equivalent",
    );
  });

  it("markPacked is refused while a required item is missing without an accepted replacement and allowed once resolved (AC-527)", async () => {
    const tenantId = "tenant-pack-readiness";
    const { proof, roles, run, eventId, packListId } = await seed(tenantId);
    const lines = await packLines(roles.owner, tenantId, packListId);
    await run(M.PackList_startPacking, {
      docId: packListId,
      version: await version(roles.owner, packListId),
    });
    await run(M.PackListItem_markPacked, {
      docId: line(lines, "Handwashing station")._id,
      packedQuantity: 1,
    });
    await run(M.PackListItem_markMissing, { docId: line(lines, "Tongs")._id });

    // A missing line on a list still being packed blocks no other work.
    await runner(proof, roles.events)(M.Event_changeHeadcount, {
      docId: eventId,
      newHeadcount: 45,
      version: await version(roles.owner, eventId),
    });

    await expect(
      run(M.PackList_markPacked, {
        docId: packListId,
        version: await version(roles.owner, packListId),
      }),
    ).rejects.toThrow(/"Tongs" is marked missing/);
    expect(
      (await readRow<{ status: string }>(roles.owner, packListId)).status,
    ).toBe("packing");

    await run(M.PackListItem_recordSentInstead, {
      docId: line(lines, "Tongs")._id,
      sentInstead: "Spring tongs",
    });
    await run(M.PackList_markPacked, {
      docId: packListId,
      version: await version(roles.owner, packListId),
    });
    expect(
      (await readRow<{ status: string }>(roles.owner, packListId)).status,
    ).toBe("packed");
  });
});
