/**
 * Issue #386: cutover provider readiness derives from the calling tenant
 * only — canonical connections and the tenant sync ledger — never from a
 * global event scan. Proven: events of another tenant cannot affect the
 * result of this tenant; an engaged provider that is disconnected,
 * erroring, or failing to sync stays unresolved; a provider the tenant
 * never engaged does not block cutover; sync evidence belongs to the
 * CURRENT connection — a clean sync from a previous engagement never
 * qualifies a reconnect, and a reconcile tagged with an old connectionId
 * is ignored; and a GO decision refuses while readiness is unresolved and
 * records once it holds.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const S = {
  tenantA: "tenant-cutover-a",
  tenantB: "tenant-cutover-b",
  tenantC: "tenant-cutover-c",
} as const;

function harness() {
  return createManifestTestContext({
    convexTest: convexTest as never,
    schema,
    modules,
  });
}

type Actor = ReturnType<ReturnType<typeof harness>["asRole"]>;

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

let clock = 1_000;
const nextTime = () => ++clock;

interface Readiness {
  canProceed: boolean;
  checks: { providerReadiness: { passed: boolean; message: string } };
  blockers: string[];
}

async function readiness(actor: Actor): Promise<Readiness> {
  return (await actor.query(
    api.cutover.validateCutoverReadiness,
    {},
  )) as Readiness;
}

async function ledgerEvent(
  actor: Actor,
  type: string,
  entity: string,
  tenantId: string,
  payload: Record<string, unknown>,
) {
  await actor.run(async (ctx) => {
    await ctx.db.insert("manifestEvents", {
      type,
      entity,
      entityId: tenantId,
      payload,
      createdAt: nextTime(),
    });
  });
}

describe("runtime proof: cutover provider readiness (#386)", () => {
  it("isolates tenants, keeps engaged-but-unresolved providers blocking, and gates GO", async () => {
    const proof = harness();
    const ownerA = proof.asRole({
      subject: "cutover-owner-a",
      role: "owner",
      tenantId: S.tenantA,
    });
    const ownerB = proof.asRole({
      subject: "cutover-owner-b",
      role: "owner",
      tenantId: S.tenantB,
    });
    const ownerC = proof.asRole({
      subject: "cutover-owner-c",
      role: "owner",
      tenantId: S.tenantC,
    });

    // Tenant C (another tenant) connects Calendar and QBO, and the QBO sync
    // fails. Under the old global scan these rows leaked into every tenant.
    await ledgerEvent(
      ownerC,
      "GoogleCalendarConnected",
      "GoogleCalendarConnection",
      S.tenantC,
      { connectionId: "gc-c", tenantId: S.tenantC },
    );
    await ledgerEvent(
      ownerC,
      "QuickBooksConnected",
      "QuickBooksConnection",
      S.tenantC,
      { connectionId: "qbo-c", tenantId: S.tenantC },
    );
    await ledgerEvent(
      ownerC,
      "QuickBooksReconciled",
      "QuickBooksConnection",
      S.tenantC,
      {
        connectionId: "qbo-c",
        tenantId: S.tenantC,
        status: "error",
        failed: 2,
        error: "QBO returned 401",
      },
    );

    // Tenant B never engaged any provider: nothing blocks, and the rows of
    // tenant C cannot leak in.
    const before = await readiness(ownerB);
    expect(before.checks.providerReadiness.passed).toBe(true);
    expect(before.checks.providerReadiness.message).toContain(
      "No outside services in use",
    );

    // Tenant A engages providers in every unresolved shape.
    await ledgerEvent(
      ownerA,
      "GoogleCalendarConnected",
      "GoogleCalendarConnection",
      S.tenantA,
      { connectionId: "gc-a", tenantId: S.tenantA },
    );
    await ledgerEvent(
      ownerA,
      "GoogleCalendarDisconnected",
      "GoogleCalendarConnection",
      S.tenantA,
      { tenantId: S.tenantA },
    );
    await ledgerEvent(
      ownerA,
      "QuickBooksConnected",
      "QuickBooksConnection",
      S.tenantA,
      { connectionId: "qbo-a", tenantId: S.tenantA },
    );
    await ledgerEvent(
      ownerA,
      "QuickBooksReconciled",
      "QuickBooksConnection",
      S.tenantA,
      {
        connectionId: "qbo-a",
        tenantId: S.tenantA,
        status: "error",
        failed: 1,
        error: "sync boom",
      },
    );
    await ownerA.run(async (ctx) => {
      await ctx.db.insert("integrationConnections", {
        tenantId: S.tenantA,
        provider: "stripe" as const,
        status: "connected" as const,
        chargesEnabled: false,
        payoutsEnabled: false,
        connectedAt: nextTime(),
        version: 1,
      });
      await ctx.db.insert("integrationConnections", {
        tenantId: S.tenantA,
        provider: "sms" as const,
        status: "connected" as const,
        chargesEnabled: false,
        payoutsEnabled: false,
        connectedAt: nextTime(),
        version: 1,
      });
    });

    const blocked = await readiness(ownerA);
    expect(blocked.checks.providerReadiness.passed).toBe(false);
    const joined = blocked.blockers.join("\n");
    expect(joined).toContain("Calendar is disconnected");
    expect(joined).toContain(
      "QuickBooks is connected but its latest sync failed",
    );
    expect(joined).toContain("Stripe is connected but cannot accept charges");
    expect(blocked.blockers.some((b) => b.startsWith("SMS"))).toBe(false);
    expect(blocked.canProceed).toBe(false);

    // Latest sync wins: a clean QBO reconcile clears only the QBO blocker.
    await ledgerEvent(
      ownerA,
      "QuickBooksReconciled",
      "QuickBooksConnection",
      S.tenantA,
      {
        connectionId: "qbo-a",
        tenantId: S.tenantA,
        status: "ok",
        failed: 0,
        error: null,
      },
    );
    const afterCleanSync = await readiness(ownerA);
    expect(
      afterCleanSync.blockers.some((b) => b.startsWith("QuickBooks")),
    ).toBe(false);
    expect(afterCleanSync.checks.providerReadiness.passed).toBe(false);

    // A sync from a PREVIOUS engagement never qualifies the current one:
    // disconnect QBO after its clean sync, reconnect (new connectionId), and
    // the connection is unsynced again — the stale pre-disconnect reconcile
    // cannot ride the reconnect.
    await ledgerEvent(
      ownerA,
      "QuickBooksDisconnected",
      "QuickBooksConnection",
      S.tenantA,
      { tenantId: S.tenantA },
    );
    await ledgerEvent(
      ownerA,
      "QuickBooksConnected",
      "QuickBooksConnection",
      S.tenantA,
      { connectionId: "qbo-a2", tenantId: S.tenantA },
    );
    const afterReconnect = await readiness(ownerA);
    expect(
      afterReconnect.blockers.some(
        (b) =>
          b.startsWith("QuickBooks") &&
          b.includes("no sync has completed since it was connected"),
      ),
    ).toBe(true);
    expect(afterReconnect.checks.providerReadiness.passed).toBe(false);

    // A clean sync tagged with the OLD connectionId does not qualify the
    // new connection either — sync evidence must belong to the current one.
    await ledgerEvent(
      ownerA,
      "QuickBooksReconciled",
      "QuickBooksConnection",
      S.tenantA,
      {
        connectionId: "qbo-a",
        tenantId: S.tenantA,
        status: "ok",
        failed: 0,
        error: null,
      },
    );
    const afterStaleIdReconcile = await readiness(ownerA);
    expect(
      afterStaleIdReconcile.blockers.some((b) => b.startsWith("QuickBooks")),
    ).toBe(true);

    // A clean sync of the CURRENT connection clears the blocker.
    await ledgerEvent(
      ownerA,
      "QuickBooksReconciled",
      "QuickBooksConnection",
      S.tenantA,
      {
        connectionId: "qbo-a2",
        tenantId: S.tenantA,
        status: "ok",
        failed: 0,
        error: null,
      },
    );
    expect(
      (await readiness(ownerA)).blockers.some((b) =>
        b.startsWith("QuickBooks"),
      ),
    ).toBe(false);

    // Reconnecting Calendar is not enough on its own: no sync has run on
    // the new connection.
    await ledgerEvent(
      ownerA,
      "GoogleCalendarConnected",
      "GoogleCalendarConnection",
      S.tenantA,
      { connectionId: "gc-a2", tenantId: S.tenantA },
    );
    const reconnected = await readiness(ownerA);
    expect(
      reconnected.blockers.some((b) =>
        b.includes("no sync has completed since it was connected"),
      ),
    ).toBe(true);
    expect(reconnected.checks.providerReadiness.passed).toBe(false);

    // Approvals, rollback plan, and a fresh import do not substitute for
    // provider readiness: GO still refuses.
    await ownerA.mutation(api.cutover.recordCutoverApprovals, {
      businessApproved: true,
      rollbackPlan: "Re-enable TPP writes and restore the pre-cutover backup.",
    });
    await ownerA.run(async (ctx) => {
      await ctx.db.insert("importRuns", {
        tenantId: S.tenantA,
        sourceSystem: "tpp_legacy" as const,
        datasetType: "events" as const,
        status: "completed" as const,
        recordCounts: "{}",
        actorId: "cutover-owner-a",
        startTime: Date.now(),
        completionTime: Date.now(),
        version: 1,
      });
    });
    await expect(
      ownerA.mutation(api.cutover.executeCutoverDecision, {
        decision: "go",
        reason: "attempting GO with unresolved providers",
      }),
    ).rejects.toThrow(
      /Can't switch yet:.*Fix the connections, or choose Don't switch yet/,
    );

    // Recovery: a clean Calendar sync and Stripe payout qualification clear
    // every blocker.
    await ledgerEvent(
      ownerA,
      "GoogleCalendarReconciled",
      "GoogleCalendarConnection",
      S.tenantA,
      {
        connectionId: "gc-a2",
        tenantId: S.tenantA,
        status: "ok",
        failed: 0,
        error: null,
      },
    );
    await ownerA.run(async (ctx) => {
      const db = ctx.db;
      if (!db) throw new Error("db unavailable in proof run");
      const all = (await db
        .query("integrationConnections")
        .collect()) as Array<{
        _id: string;
        provider: string;
      }>;
      const stripe = all.find((row) => row.provider === "stripe");
      if (!stripe) throw new Error("stripe row missing");
      await db.patch(stripe._id, {
        chargesEnabled: true,
        payoutsEnabled: true,
      });
    });

    const ready = await readiness(ownerA);
    expect(ready.checks.providerReadiness.passed).toBe(true);
    expect(ready.canProceed).toBe(true);

    // The owner GO decision records once readiness holds, and tenant B is
    // still untouched by anything tenant A or C did.
    const decided = (await ownerA.mutation(api.cutover.executeCutoverDecision, {
      decision: "go",
      reason: "providers connected and synced",
    })) as { status: string };
    expect(decided.status).toBe("go");
    const after = await readiness(ownerB);
    expect(after.checks.providerReadiness.passed).toBe(true);
  });
});
