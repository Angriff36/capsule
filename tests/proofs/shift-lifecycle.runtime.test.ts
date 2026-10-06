/**
 * Runtime proof: Shift.schedule -> Shift.start -> Shift.complete.
 * Seeds every record through public generated createVia mutations.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const S = {
  tenantA: "tenant-workforce-a",
  tenantB: "tenant-workforce-b",
  // Ahead of now, so starting the shift is a live clock-in.
  startsAt: Date.now() + 24 * 60 * 60_000,
  endsAt: Date.now() + 32 * 60 * 60_000,
} as const;

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

async function hireWorkforceStaff(
  proof: ReturnType<typeof harness>,
  tenantId: string,
) {
  const manager = proof.asRole({
    subject: `workforce-manager-${tenantId}`,
    role: "workforce_manager",
    tenantId,
  });
  const result = (await proof.executeCommand(
    manager,
    api.mutations.Person_createViaHire,
    {
      givenName: "Avery",
      familyName: "Rivera",
      email: `avery-${tenantId}@proof.example`,
      role: "workforce_staff",
      employmentType: "part_time",
      authSubjectId: `avery-${tenantId}`,
    },
  )) as { docId: string };
  return { manager, personId: result.docId };
}

describe("runtime proof: Shift schedule -> start -> complete", () => {
  it("creates a governed shift and lets the assigned person run its lifecycle", async () => {
    const proof = harness();
    const { manager, personId } = await hireWorkforceStaff(proof, S.tenantA);

    const created = (await proof.executeCommand(
      manager,
      api.mutations.Shift_createViaSchedule,
      {
        personId,
        startsAt: S.startsAt,
        endsAt: S.endsAt,
        role: "Event captain",
        notes: "Main room coverage",
      },
    )) as { docId: string };

    // Signs in through the staff profile link (spec 6.1 item 4), not with
    // the profile id as the sign-in id.
    const person = proof.asRole({
      subject: `avery-${S.tenantA}`,
      role: "workforce_staff",
      tenantId: S.tenantA,
    });
    const scheduled = await person.run(async (ctx) =>
      ctx.db.get(created.docId as never),
    );
    expect(scheduled).toMatchObject({
      tenantId: S.tenantA,
      personId,
      status: "scheduled",
      version: 1,
    });
    expect(scheduled?.scheduledAt).toEqual(expect.any(Number));

    await proof.expectEvent(person, {
      type: "ShiftScheduled",
      tenantId: S.tenantA,
      predicate: (payload) =>
        payload.shiftId === created.docId &&
        payload.personId === personId &&
        payload.status === "scheduled",
    });

    const started = (await proof.executeCommand(
      person,
      api.mutations.Shift_start,
      { docId: created.docId, version: 1 },
    )) as { status: string; startedAt?: number; version: number };
    expect(started).toMatchObject({ status: "started", version: 2 });
    expect(started.startedAt).toEqual(expect.any(Number));
    await proof.expectEvent(person, {
      type: "ShiftStarted",
      tenantId: S.tenantA,
      predicate: (payload) =>
        payload.shiftId === created.docId &&
        payload.personId === personId &&
        payload.status === "started",
    });

    const completed = (await proof.executeCommand(
      person,
      api.mutations.Shift_complete,
      { docId: created.docId, version: 2 },
    )) as { status: string; completedAt?: number; version: number };
    expect(completed).toMatchObject({ status: "completed", version: 3 });
    expect(completed.completedAt).toEqual(expect.any(Number));
    await proof.expectEvent(person, {
      type: "ShiftCompleted",
      tenantId: S.tenantA,
      predicate: (payload) =>
        payload.shiftId === created.docId &&
        payload.personId === personId &&
        payload.status === "completed",
    });

    // Start and finish alone record the worked time (one tap, not two).
    const records = await person.run(async (ctx) =>
      ctx.db.query("timeRecords").collect(),
    );
    expect(records).toEqual([
      expect.objectContaining({
        personId,
        shiftId: created.docId,
        status: "closed",
        clockInAt: expect.any(Number),
        clockOutAt: expect.any(Number),
      }),
    ]);
  });

  it("records no seconds-long entry when a finished shift is started after the fact", async () => {
    const proof = harness();
    const { manager, personId } = await hireWorkforceStaff(proof, S.tenantA);
    const created = (await proof.executeCommand(
      manager,
      api.mutations.Shift_createViaSchedule,
      {
        personId,
        startsAt: Date.now() - 10 * 60 * 60_000,
        endsAt: Date.now() - 2 * 60 * 60_000,
      },
    )) as { docId: string };
    await proof.executeCommand(manager, api.mutations.Shift_start, {
      docId: created.docId,
      version: 1,
    });
    await proof.executeCommand(manager, api.mutations.Shift_complete, {
      docId: created.docId,
      version: 2,
    });
    expect(
      await manager.run(async (ctx) => ctx.db.query("timeRecords").collect()),
    ).toEqual([]);
  });

  it("denies kitchen staff and leaves no partial shift", async () => {
    const proof = harness();
    const { manager, personId } = await hireWorkforceStaff(proof, S.tenantA);
    const denied = proof.asRole({
      subject: "kitchen-staff",
      role: "kitchen_staff",
      tenantId: S.tenantA,
    });

    await expect(
      proof.executeCommand(denied, api.mutations.Shift_createViaSchedule, {
        personId,
        startsAt: S.startsAt,
        endsAt: S.endsAt,
      }),
    ).rejects.toThrow(/Workforce staff|workforceManageAccess|Guard 4/i);

    expect(await manager.query(api.queries.listShift, {})).toEqual([]);
  });

  it("isolates shifts by tenant through the public list query", async () => {
    const proof = harness();
    const { manager: tenantA, personId } = await hireWorkforceStaff(
      proof,
      S.tenantA,
    );
    const tenantB = proof.asRole({
      subject: "workforce-manager-b",
      role: "workforce_manager",
      tenantId: S.tenantB,
    });

    await proof.executeCommand(tenantA, api.mutations.Shift_createViaSchedule, {
      personId,
      startsAt: S.startsAt,
      endsAt: S.endsAt,
    });

    expect(await tenantB.query(api.queries.listShift, {})).toEqual([]);
    expect(await tenantA.query(api.queries.listShift, {})).toEqual([
      expect.objectContaining({ tenantId: S.tenantA, personId }),
    ]);
  });
});
