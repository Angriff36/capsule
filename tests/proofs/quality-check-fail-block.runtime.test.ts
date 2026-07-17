/**
 * Runtime proof: QualityCheck_fail → QualityCheckFailed → PrepTask.markBlocked
 * Executes the public generated mutation (not internals).
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import {
  createManifestTestContext,
  type ManifestConvexTestHarness,
} from "@angriff36/manifest/proof-kit/convex-test";
import { QUALITY_FAIL_BLOCK_SCENARIO as S } from "../fixtures/quality-fail-block-scenario";
import { modules } from "./convex-test-modules";

function harness() {
  return createManifestTestContext({
    convexTest: convexTest as never,
    schema,
    modules,
  });
}

async function seedPerson(
  actor: ManifestConvexTestHarness,
  tenantId: string,
  role: string,
): Promise<string> {
  return (await actor.run(async (ctx) =>
    ctx.db.insert("people", {
      tenantId,
      givenName: "Proof",
      familyName: "Cook",
      email: `${role}@proof.example`,
      role: role as never,
      employmentType: "full_time",
      status: "active",
      version: 0,
    }),
  )) as string;
}

async function seedPendingQualityOnPrep(
  actor: ManifestConvexTestHarness,
  tenantId: string,
  personId: string,
) {
  return actor.run(async (ctx) => {
    const clientId = await ctx.db.insert("clients", {
      tenantId,
      clientType: "company",
      companyName: "Quality Proof Co",
      taxExempt: false,
      paymentTermsDays: 30,
      status: "active",
      version: 0,
    });
    const eventId = await ctx.db.insert("events", {
      tenantId,
      clientId,
      title: S.eventTitle,
      eventType: "proof",
      expectedHeadcount: 10,
      budgetAmount: 1000,
      quotedPrice: 1200,
      stage: "approved",
      version: 0,
    });
    const ingredientId = await ctx.db.insert("ingredients", {
      tenantId,
      name: S.ingredientName,
      unit: S.unit,
      costPerUnit: 4,
      status: "active",
      allergens: [],
      version: 0,
    });
    const prepTaskId = await ctx.db.insert("prepTasks", {
      tenantId,
      eventId,
      ingredientId,
      quantity: S.quantity,
      unit: S.unit,
      station: S.station,
      status: "in_progress",
      claimedAt: Date.now(),
      startedAt: Date.now(),
      assignedToId: personId as never,
      version: 0,
    });
    const qualityCheckId = await ctx.db.insert("qualityChecks", {
      tenantId,
      prepTaskId,
      status: "pending",
      openedAt: Date.now(),
      version: 0,
    });
    return { prepTaskId, qualityCheckId, eventId, ingredientId };
  });
}

describe("runtime proof: QualityCheck_fail → PrepTask.markBlocked", () => {
  it("allows kitchen_lead, blocks prep, emits events, bumps versions", async () => {
    const proof = harness();
    const bootstrap = proof.asRole({
      subject: "bootstrap",
      role: S.allowedRole,
      tenantId: S.tenantA,
    });
    const personId = await seedPerson(bootstrap, S.tenantA, S.allowedRole);
    const allowed = proof.asRole({
      subject: personId,
      role: S.allowedRole,
      tenantId: S.tenantA,
    });

    const { prepTaskId, qualityCheckId } = await seedPendingQualityOnPrep(
      allowed,
      S.tenantA,
      personId,
    );

    const beforeCheck = await allowed.run(async (ctx) =>
      ctx.db.get(qualityCheckId),
    );
    const beforePrep = await allowed.run(async (ctx) => ctx.db.get(prepTaskId));
    expect(beforeCheck?.status).toBe("pending");
    expect(beforeCheck?.version).toBe(0);
    expect(beforePrep?.status).toBe("in_progress");
    expect(beforePrep?.version).toBe(0);

    const result = (await proof.executeCommand(
      allowed,
      api.mutations.QualityCheck_fail,
      { docId: qualityCheckId, version: 0 },
    )) as { status: string; version: number; tenantId: string };

    expect(result.status).toBe("failed");
    expect(result.version).toBe(1);
    expect(result.tenantId).toBe(S.tenantA);

    const afterPrep = await allowed.run(async (ctx) => ctx.db.get(prepTaskId));
    expect(afterPrep?.status).toBe("blocked");
    expect(afterPrep?.blockReason).toBe("Quality check failed");
    expect(afterPrep?.version).toBe(1);
    expect(afterPrep?.tenantId).toBe(S.tenantA);

    await proof.expectEvent(allowed, {
      type: "QualityCheckFailed",
      tenantId: S.tenantA,
      predicate: (payload) =>
        payload.qualityCheckId === qualityCheckId &&
        payload.prepTaskId === prepTaskId &&
        payload.status === "failed",
    });
    await proof.expectEvent(allowed, {
      type: "PrepTaskBlocked",
      tenantId: S.tenantA,
      predicate: (payload) =>
        payload.prepTaskId === prepTaskId &&
        payload.status === "blocked" &&
        payload.reason === "Quality check failed",
    });

    const listed = (await allowed.query(api.queries.listPrepTask, {})) as Array<
      Record<string, unknown>
    >;
    expect(listed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tenantId: S.tenantA,
          status: "blocked",
          blockReason: "Quality check failed",
        }),
      ]),
    );
  });

  it("denies kitchen_staff when reaction requires kitchenLeadAccess", async () => {
    const proof = harness();
    const seeder = proof.asRole({
      subject: "bootstrap-seed",
      role: S.allowedRole,
      tenantId: S.tenantA,
    });
    const leadPersonId = await seedPerson(seeder, S.tenantA, S.allowedRole);
    const staffPersonId = await seedPerson(seeder, S.tenantA, S.deniedRole);
    const denied = proof.asRole({
      subject: staffPersonId,
      role: S.deniedRole,
      tenantId: S.tenantA,
    });
    const lead = proof.asRole({
      subject: leadPersonId,
      role: S.allowedRole,
      tenantId: S.tenantA,
    });
    const { qualityCheckId, prepTaskId } = await seedPendingQualityOnPrep(
      lead,
      S.tenantA,
      leadPersonId,
    );

    await expect(
      proof.executeCommand(denied, api.mutations.QualityCheck_fail, {
        docId: qualityCheckId,
        version: 0,
      }),
    ).rejects.toThrow(/Guard 2 failed|Kitchen staff|Lead/i);

    const after = await lead.run(async (ctx) => ({
      check: await ctx.db.get(qualityCheckId),
      prep: await ctx.db.get(prepTaskId),
    }));
    expect(after.check?.status).toBe("pending");
    expect(after.prep?.status).toBe("in_progress");
  });

  it("hides blocked PrepTask from another tenant via public list", async () => {
    const proof = harness();
    const bootstrapA = proof.asRole({
      subject: "bootstrap-a",
      role: S.allowedRole,
      tenantId: S.tenantA,
    });
    const personA = await seedPerson(bootstrapA, S.tenantA, S.allowedRole);
    const tenantA = proof.asRole({
      subject: personA,
      role: S.allowedRole,
      tenantId: S.tenantA,
    });
    const tenantB = proof.asRole({
      subject: "user-b",
      role: S.allowedRole,
      tenantId: S.tenantB,
    });

    const { qualityCheckId } = await seedPendingQualityOnPrep(
      tenantA,
      S.tenantA,
      personA,
    );
    await proof.executeCommand(tenantA, api.mutations.QualityCheck_fail, {
      docId: qualityCheckId,
      version: 0,
    });

    const foreign = (await tenantB.query(
      api.queries.listPrepTask,
      {},
    )) as unknown[];
    expect(foreign).toEqual([]);

    const own = (await tenantA.query(api.queries.listPrepTask, {})) as Array<{
      tenantId: string;
      status: string;
    }>;
    expect(
      own.some((row) => row.tenantId === S.tenantA && row.status === "blocked"),
    ).toBe(true);
  });
});
