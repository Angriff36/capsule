/**
 * AC-122 (PR09-01): a manager pauses and restores a worker from the app.
 * Pausing takes away the worker's access on the sign-in they already have,
 * and keeps their event assignments, approved time and payroll lines exactly
 * as they were; restoring gives the same sign-in its access back. A workforce
 * manager cannot pause or restore an owner.
 * Synthetic workspace.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";

const tenantId = "tenant-worker-lifecycle";

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

async function refusal(call: () => Promise<unknown>): Promise<string | null> {
  try {
    await call();
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

async function seed(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const base = {
      tenantId,
      familyName: "Proof",
      employmentType: "full_time",
      status: "active",
      deletedAt: null,
      version: 1,
    };
    const person = async (givenName: string, role: string, subject: string) =>
      (await ctx.db.insert("people", {
        ...base,
        givenName,
        email: `${subject}@example.test`,
        role,
        authSubjectId: subject,
      } as never)) as Id<"people">;
    const ownerId = await person("Olive", "owner", "life-owner");
    const hrId = await person("Hana", "workforce_manager", "life-hr");
    const cookId = await person("Cody", "staff", "life-cook");
    const eventId = (await ctx.db.insert("events", {
      tenantId,
      title: "Lifecycle dinner",
      eventType: "dinner",
      stage: "planning",
      deletedAt: null,
      version: 1,
    } as never)) as Id<"events">;
    const assignmentId = await ctx.db.insert("eventAssignments", {
      tenantId,
      eventId,
      personId: cookId,
      role: "cook",
      status: "confirmed",
      deletedAt: null,
      version: 1,
    });
    const timeId = await ctx.db.insert("timeRecords", {
      tenantId,
      personId: cookId,
      eventId,
      clockInAt: Date.parse("2026-09-01T14:00:00Z"),
      clockOutAt: Date.parse("2026-09-01T22:00:00Z"),
      status: "closed",
      deletedAt: null,
      version: 1,
    });
    const payrollId = await ctx.db.insert("payrollInputs", {
      tenantId,
      personId: cookId,
      eventId,
      periodStart: Date.parse("2026-09-01T00:00:00Z"),
      periodEnd: Date.parse("2026-09-07T23:59:59Z"),
      regularMinutes: 480,
      overtimeMinutes: 0,
      totalMinutes: 480,
      hourlyRate: "20.00",
      grossAmount: "160.00",
      status: "finalized",
      deletedAt: null,
      version: 1,
    });
    return { ownerId, hrId, cookId, assignmentId, timeId, payrollId };
  });
}

function signIn(t: ReturnType<typeof convexTest>, subject: string) {
  // The IdP still carries company claims after a pause; they must not
  // outlive it.
  return t.withIdentity({
    subject,
    tokenIdentifier: `proof|${subject}`,
    role: "org:member",
    tenantId,
  });
}

describe("AC-122 pause and restore a worker without losing their history", () => {
  it("pausing blocks the sign-in and keeps assignments, time and payroll; restoring gives the same sign-in back", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    const hr = signIn(t, "life-hr");
    const cook = signIn(t, "life-cook");

    expect(await cook.query(api.authStatus.getAuthStatus, {})).toMatchObject({
      hasTenant: true,
      role: "staff",
    });
    const before = await t.run(async (ctx) => ({
      assignment: await ctx.db.get(ids.assignmentId),
      time: await ctx.db.get(ids.timeId),
      payroll: await ctx.db.get(ids.payrollId),
    }));

    await hr.mutation(api.mutations.Person_deactivate, {
      docId: ids.cookId,
      version: 1,
    });

    expect(await cook.query(api.authStatus.getAuthStatus, {})).toMatchObject({
      hasTenant: false,
      role: "anonymous",
    });
    expect(await cook.query(api.queries.listEventAssignment, {})).toEqual([]);

    const during = await t.run(async (ctx) => ({
      person: await ctx.db.get(ids.cookId),
      assignment: await ctx.db.get(ids.assignmentId),
      time: await ctx.db.get(ids.timeId),
      payroll: await ctx.db.get(ids.payrollId),
    }));
    expect(during.person).toMatchObject({
      status: "inactive",
      authSubjectId: "life-cook",
      deletedAt: null,
    });
    expect(during.assignment).toEqual(before.assignment);
    expect(during.time).toEqual(before.time);
    expect(during.payroll).toEqual(before.payroll);

    // Paused people cannot be sent a new sign-in either.
    expect(
      await refusal(() =>
        hr.action(api.authProvision.provisionStaffSignIn, {
          personId: ids.cookId,
        }),
      ),
    ).not.toBeNull();

    await hr.mutation(api.mutations.Person_reactivate, {
      docId: ids.cookId,
      version: 2,
    });
    expect(await cook.query(api.authStatus.getAuthStatus, {})).toMatchObject({
      hasTenant: true,
      role: "staff",
    });
    const after = await t.run(async (ctx) => ({
      person: await ctx.db.get(ids.cookId),
      assignment: await ctx.db.get(ids.assignmentId),
      time: await ctx.db.get(ids.timeId),
      payroll: await ctx.db.get(ids.payrollId),
    }));
    expect(after.person).toMatchObject({
      status: "active",
      authSubjectId: "life-cook",
    });
    expect(after.assignment).toEqual(before.assignment);
    expect(after.time).toEqual(before.time);
    expect(after.payroll).toEqual(before.payroll);
  });

  it("a workforce manager cannot pause or restore an owner; an owner can pause and restore a manager", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    const hr = signIn(t, "life-hr");
    const owner = signIn(t, "life-owner");

    expect(
      await refusal(() =>
        hr.mutation(api.mutations.Person_deactivate, {
          docId: ids.ownerId,
          version: 1,
        }),
      ),
    ).not.toBeNull();
    await t.run(async (ctx) =>
      ctx.db.patch(ids.ownerId, { status: "inactive", version: 2 }),
    );
    expect(
      await refusal(() =>
        hr.mutation(api.mutations.Person_reactivate, {
          docId: ids.ownerId,
          version: 2,
        }),
      ),
    ).not.toBeNull();
    await t.run(async (ctx) =>
      ctx.db.patch(ids.ownerId, { status: "active", version: 3 }),
    );

    // The owner can pause and restore the workforce manager.
    await owner.mutation(api.mutations.Person_deactivate, {
      docId: ids.hrId,
      version: 1,
    });
    await owner.mutation(api.mutations.Person_reactivate, {
      docId: ids.hrId,
      version: 2,
    });
    const hrRow = await t.run(async (ctx) => ctx.db.get(ids.hrId));
    expect(hrRow).toMatchObject({ status: "active", authSubjectId: "life-hr" });
  });
});
