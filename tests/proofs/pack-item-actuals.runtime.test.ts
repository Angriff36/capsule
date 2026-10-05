/**
 * Runtime proof (PL-PACK-ACTUALS, AC-134 / PR10-04): packing records what
 * really happened on a phone - a short count, a stand-in, a missing line -
 * with who did it, a retried tap never counts twice, and packing weeks
 * before the event is allowed.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  createPlannedEvent,
  harness,
  line,
  openPackList,
  packLines,
  readRow,
  rolesFor,
  runner,
  version,
} from "./pack-rules.runtime.helpers";

const M = api.mutations;

beforeAll(() => {
  process.env.CONVEX_FIELD_ENCRYPTION_KEY ||=
    "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
});

type Actual = {
  status: string;
  packedQuantity: number;
  requiredQuantity: number;
  packedByPersonId?: string | null;
  missingByPersonId?: string | null;
  sentInstead?: string | null;
  sentInsteadByPersonId?: string | null;
  version: number;
};

describe("runtime proof: packing actuals", () => {
  it("partial packed quantities, a missing item and a zero-block early pack record actor and survive offline replay", async () => {
    const proof = harness();
    const tenantId = "tenant-pack-actuals";
    const roles = rolesFor(proof, tenantId);
    // The event is weeks away; packing now is allowed.
    const { eventId } = await createPlannedEvent(
      proof,
      tenantId,
      "Pack actuals",
    );
    const packListId = await openPackList(
      proof,
      tenantId,
      eventId,
      "Actuals list",
    );
    const manager = runner(proof, roles.logistics);
    for (const [description, requiredQuantity] of [
      ["Chafers", 10],
      ["Sterno", 24],
      ["Tongs", 6],
    ] as const)
      await manager(M.PackListItem_createViaAddItem, {
        packListId,
        description,
        requiredQuantity,
        unit: "each",
      });

    const workforce = runner(
      proof,
      proof.asRole({
        subject: `wf-${tenantId}`,
        role: "workforce_manager",
        tenantId,
      }),
    );
    const packerPerson = await workforce(M.Person_createViaHire, {
      givenName: "Jo",
      familyName: "Packer",
      email: `jo-${tenantId}@proof.example`,
      role: "logistics_staff",
      employmentType: "part_time",
      authSubjectId: `packer-${tenantId}`,
    });
    const packerRole = proof.asRole({
      subject: `packer-${tenantId}`,
      role: "logistics_staff",
      tenantId,
    });
    const packer = runner(proof, packerRole);
    await packer(M.PackList_startPacking, {
      docId: packListId,
      version: await version(roles.owner, packListId),
    });

    let lines = await packLines(roles.owner, tenantId, packListId);
    const chafers = line(lines, "Chafers");
    // A short count sent twice with the same key (the phone lost the answer).
    const shortCount = {
      docId: chafers._id,
      version: chafers.version,
      packedQuantity: 7,
      idempotencyKey: `count-${chafers._id}`,
    };
    await packer(M.PackListItem_recordPackedCount, shortCount);
    await packer(M.PackListItem_recordPackedCount, shortCount);
    const counted = await readRow<Actual>(roles.owner, chafers._id);
    expect(counted).toMatchObject({
      status: "listed",
      packedQuantity: 7,
      packedByPersonId: packerPerson.docId,
    });
    expect(counted.version).toBe(chafers.version + 1);

    // A stand-in went out for the tongs, and the sterno is missing.
    await packer(M.PackListItem_recordSentInstead, {
      docId: line(lines, "Tongs")._id,
      sentInstead: "Spring tongs",
    });
    await packer(M.PackListItem_markMissing, {
      docId: line(lines, "Sterno")._id,
      idempotencyKey: `missing-${tenantId}`,
    });
    await packer(M.PackListItem_markMissing, {
      docId: line(lines, "Sterno")._id,
      idempotencyKey: `missing-${tenantId}`,
    });

    lines = await packLines(roles.owner, tenantId, packListId);
    expect(line(lines, "Tongs") as unknown as Actual).toMatchObject({
      sentInstead: "Spring tongs",
      sentInsteadByPersonId: packerPerson.docId,
      status: "listed",
    });
    expect(line(lines, "Sterno") as unknown as Actual).toMatchObject({
      status: "missing",
      missingByPersonId: packerPerson.docId,
      packedQuantity: 0,
    });
    // Nothing generated or recorded claims more than was counted.
    expect(line(lines, "Chafers").packedQuantity).toBe(7);
    expect(line(lines, "Tongs").packedQuantity).toBe(0);
  });

  it("a line goes on a truck of its own event only (truck-load view, AC-540)", async () => {
    const proof = harness();
    const tenantId = "tenant-pack-truck";
    const roles = rolesFor(proof, tenantId);
    const { eventId } = await createPlannedEvent(proof, tenantId, "Truck mine");
    const other = await createPlannedEvent(proof, tenantId, "Truck other");
    const packListId = await openPackList(
      proof,
      tenantId,
      eventId,
      "Truck list",
    );
    const run = runner(proof, roles.logistics);
    const item = await run(M.PackListItem_createViaAddItem, {
      packListId,
      description: "Chafers",
      requiredQuantity: 4,
      unit: "each",
    });
    const mine = await run(M.EventVehicleAssignment_createViaAssign, {
      eventId,
      vendorName: "Party Rentals truck",
    });
    const theirs = await run(M.EventVehicleAssignment_createViaAssign, {
      eventId: other.eventId,
      vendorName: "Other truck",
    });

    await expect(
      run(M.PackListItem_assignLoad, {
        docId: item.docId,
        loadAssignmentId: theirs.docId,
      }),
    ).rejects.toThrow(/not on this event/);
    await run(M.PackListItem_assignLoad, {
      docId: item.docId,
      loadAssignmentId: mine.docId,
    });
    expect(
      (await readRow<{ loadAssignmentId?: string }>(roles.owner, item.docId))
        .loadAssignmentId,
    ).toBe(mine.docId);
    await run(M.PackListItem_assignLoad, { docId: item.docId });
    expect(
      (
        await readRow<{ loadAssignmentId?: string | null }>(
          roles.owner,
          item.docId,
        )
      ).loadAssignmentId ?? null,
    ).toBeNull();
  });
});
