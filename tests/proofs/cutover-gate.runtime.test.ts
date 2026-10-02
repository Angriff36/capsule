/**
 * PL-CUTOVER runtime proof (AC-287, AC-288, AC-289, AC-291, AC-292, the
 * gate legs of AC-632). The switch page's checklist and the go step read one
 * check (convex/lib/cutoverGate.ts):
 *  - go is refused while the last import is unfinished or ran before TPP
 *    stopped taking entries, and allowed after a completed import that
 *    started later; no fixed age rule decides it;
 *  - a TPP item waiting on the match-up page blocks go; resolving it
 *    unblocks; a pending field difference blocks until a person picks;
 *  - sign-off without saying what was checked is refused; a saved sign-off
 *    keeps who, when and what was checked;
 *  - opening stock, money records and backup must be on file;
 *  - read-only before go is refused; after go it stamps the time; undo only
 *    from go, and it clears the read-only stamp;
 *  - go records that scheduled imports are off, and the runs it rests on;
 *  - another company sees and changes none of it; non-admins cannot decide.
 * Synthetic workspaces only.
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

type Actor = ReturnType<ReturnType<typeof harness>["asRole"]>;

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

interface Gate {
  canProceed: boolean;
  checks: Record<
    string,
    { passed: boolean; message: string; details?: string }
  >;
  blockers: string[];
  openItems: Array<{ kind: string; externalId: string }>;
}

const gate = async (actor: Actor) =>
  (await actor.query(api.cutover.validateCutoverReadiness, {})) as Gate;

const status = async (actor: Actor) =>
  (await actor.query(api.cutover.getCutoverStatus, {})) as Record<
    string,
    unknown
  >;

type Db = {
  insert: (table: string, value: object) => Promise<string>;
  patch: (id: string, value: object) => Promise<void>;
};

async function insertRun(
  actor: Actor,
  tenantId: string,
  datasetType: string,
  runStatus: string,
  startTime: number,
): Promise<string> {
  let id = "";
  await actor.run(async (ctx) => {
    id = await (ctx as unknown as { db: Db }).db.insert("importRuns", {
      tenantId,
      sourceSystem: "tpp_legacy",
      datasetType,
      status: runStatus,
      recordCounts: "{}",
      actorId: "cutover-gate-owner",
      startTime,
      completionTime: runStatus === "completed" ? startTime + 1 : null,
      version: 1,
    });
  });
  return id;
}

const go = (actor: Actor) =>
  actor.mutation(api.cutover.executeCutoverDecision, {
    decision: "go",
    reason: "every check passed",
  });

describe("runtime proof: the switch from TPP (PL-CUTOVER)", () => {
  it("refuses go until every switch fact is real, then records the decision", async () => {
    const proof = harness();
    const tenantId = "tenant-cutover-gate";
    const otherTenant = "tenant-cutover-gate-other";
    const owner = proof.asRole({
      subject: "cutover-gate-owner",
      role: "owner",
      tenantId,
    });
    const admin = proof.asRole({
      subject: "cutover-gate-admin",
      role: "admin",
      tenantId,
    });
    const manager = proof.asRole({
      subject: "cutover-gate-manager",
      role: "kitchen_manager",
      tenantId,
    });
    const otherOwner = proof.asRole({
      subject: "cutover-gate-other-owner",
      role: "owner",
      tenantId: otherTenant,
    });

    const now = Date.now();
    const frozenAt = now - 10 * 60_000;

    // Before anything: no imports, nothing on file.
    const empty = await gate(owner);
    expect(empty.canProceed).toBe(false);
    expect(empty.blockers).toContain("No imports have been finished");

    // AC-288: one TPP item waits on the match-up page, one field difference
    // waits for a person.
    let openLinkId = "";
    let conflictId = "";
    await owner.run(async (ctx) => {
      const db = (ctx as unknown as { db: Db }).db;
      const link = {
        tenantId,
        sourceSystem: "tpp_legacy",
        recordType: "event",
        capsuleEntity: "event_record",
        capsuleId: "capsule-event-1",
        verified: false,
        version: 1,
      };
      openLinkId = await db.insert("externalRecordLinks", {
        ...link,
        externalId: "6014",
        conflictStatus: "pending_conflict",
      });
      // Matched by the import: it carries its disposition and never blocks.
      await db.insert("externalRecordLinks", {
        ...link,
        externalId: "6015",
        conflictStatus: "resolved",
      });
      conflictId = await db.insert("importConflicts", {
        tenantId,
        externalRecordLinkId: openLinkId,
        field: "guestCount",
        appliedValue: "100",
        capsuleValue: "120",
        sourceValue: "110",
        status: "pending",
        version: 1,
      });
    });

    // AC-287: an import that ran before TPP stopped taking entries is stale;
    // an unfinished one is not an import yet.
    await insertRun(owner, tenantId, "events", "completed", frozenAt - 60_000);
    await insertRun(owner, tenantId, "menus", "parsing", frozenAt + 60_000);

    // AC-289: signing off without saying what was checked is refused, and a
    // non-admin cannot sign off at all.
    await expect(
      owner.mutation(api.cutover.recordCutoverApprovals, {
        businessApproved: true,
        rollbackPlan:
          "Turn TPP writes back on and restore last night's backup.",
      }),
    ).rejects.toThrow(/Say what you checked/);
    await expect(
      manager.mutation(api.cutover.recordCutoverApprovals, {
        businessApproved: true,
        rollbackPlan: "x",
        businessEvidence: "y",
      }),
    ).rejects.toThrow(/Only admins/);
    await admin.mutation(api.cutover.recordCutoverApprovals, {
      businessApproved: true,
      rollbackPlan: "Turn TPP writes back on and restore last night's backup.",
      businessEvidence: "Walked event 6014 and the Mangia week report in both",
    });
    const signed = await status(owner);
    expect(signed.businessApproved).toBe(true);
    expect(signed.businessApprovedById).toBeTruthy();
    expect(typeof signed.businessApprovedAt).toBe("number");
    expect(signed.businessEvidence).toBe(
      "Walked event 6014 and the Mangia week report in both",
    );

    // AC-291: read-only and undo are refused before go.
    await expect(
      owner.mutation(api.cutover.setTppReadOnly, { reason: "too early" }),
    ).rejects.toThrow(/only after the switch is approved/);
    await expect(
      owner.mutation(api.cutover.rollbackCutover, { reason: "too early" }),
    ).rejects.toThrow(/was not approved/);

    let blocked = await gate(owner);
    expect(blocked.canProceed).toBe(false);
    expect(blocked.checks.businessValidation.passed).toBe(true);
    expect(blocked.checks.finalDeltaImport.passed).toBe(false);
    expect(blocked.checks.zeroCriticalMappings.passed).toBe(false);
    expect(blocked.checks.openingStock.passed).toBe(false);
    expect(blocked.checks.financialMode.passed).toBe(false);
    expect(blocked.checks.backup.passed).toBe(false);
    expect(blocked.openItems.map((item) => item.kind).sort()).toEqual([
      "field_difference",
      "unmatched_link",
    ]);
    expect(blocked.openItems.every((item) => item.externalId === "6014")).toBe(
      true,
    );
    await expect(go(owner)).rejects.toThrow(/Can't switch yet/);

    // The facts: TPP stopped at frozenAt, opening stock, money, backup.
    await owner.mutation(api.cutover.saveCutoverFacts, {
      sourceFrozenAt: frozenAt,
      openingStockAsOf: frozenAt,
      financialMode: "reference_history",
      backupEvidence: "Nightly backup on the Linux box; restored 2026-09-30",
    });
    blocked = await gate(owner);
    expect(blocked.checks.openingStock.passed).toBe(true);
    expect(blocked.checks.financialMode.passed).toBe(true);
    expect(blocked.checks.backup.passed).toBe(true);
    // Still stale events and an unfinished menus import.
    expect(blocked.blockers.join(" ")).toContain(
      "The last events import ran before TPP stopped taking new entries",
    );
    expect(blocked.blockers.join(" ")).toContain(
      "The latest menus import is parsing",
    );
    await expect(go(owner)).rejects.toThrow(/ran before TPP stopped/);

    // Fresh completed imports after the freeze; then the open items.
    const eventsRun = await insertRun(
      owner,
      tenantId,
      "events",
      "completed",
      frozenAt + 120_000,
    );
    const menusRun = await insertRun(
      owner,
      tenantId,
      "menus",
      "completed",
      frozenAt + 180_000,
    );
    blocked = await gate(owner);
    expect(blocked.checks.finalDeltaImport.passed).toBe(true);
    expect(blocked.checks.zeroCriticalMappings.passed).toBe(false);
    await expect(go(owner)).rejects.toThrow(/still need matching/);

    // Resolving the match-up item and picking the value clears them.
    await owner.run(async (ctx) => {
      const db = (ctx as unknown as { db: Db }).db;
      await db.patch(openLinkId, { conflictStatus: "resolved" });
      await db.patch(conflictId, { status: "keep_capsule" });
    });
    const ready = await gate(owner);
    expect(ready.blockers).toEqual([]);
    expect(ready.canProceed).toBe(true);

    // The other company sees none of this workspace's switch.
    const other = await gate(otherOwner);
    expect(other.canProceed).toBe(false);
    expect(other.openItems).toEqual([]);
    expect((await status(otherOwner)).status).toBe("not_started");

    // Go records the runs it rests on and that scheduled imports are off.
    const decided = (await go(owner)) as { status: string };
    expect(decided.status).toBe("go");
    let row: Record<string, unknown> | null = null;
    await owner.run(async (ctx) => {
      const rows = await ctx.db.query("cutoverDecisions").collect();
      row = rows.find((r) => r.tenantId === tenantId) ?? null;
    });
    const saved = row as unknown as Record<string, unknown>;
    expect(JSON.parse(String(saved.finalImportRuns))).toEqual({
      events: eventsRun,
      menus: menusRun,
    });
    expect(typeof saved.scheduledImportsDisabledAt).toBe("number");
    expect(String(saved.scheduledImportsNote)).toContain(
      "No scheduled TPP imports",
    );

    // AC-291: after go, read-only stamps the time; undo clears it.
    await owner.mutation(api.cutover.setTppReadOnly, { reason: "switched" });
    expect(typeof (await status(owner)).tppReadOnlyAt).toBe("number");
    await owner.mutation(api.cutover.rollbackCutover, {
      reason: "kitchen printer broke",
    });
    const undone = await status(owner);
    expect(undone.status).toBe("rolled_back");
    expect(undone.tppReadOnlyAt).toBeNull();
    await expect(
      owner.mutation(api.cutover.rollbackCutover, { reason: "twice" }),
    ).rejects.toThrow(/was not approved/);

    // Every step left a history row.
    let types: string[] = [];
    await owner.run(async (ctx) => {
      const rows = (await ctx.db.query("manifestEvents").collect()) as Array<{
        entity: string;
        type: string;
      }>;
      types = rows
        .filter((event) => event.entity === "CutoverDecision")
        .map((event) => event.type);
    });
    for (const type of [
      "CutoverDecisionCreated",
      "CutoverDecisionApprovalsRecorded",
      "CutoverDecisionExecuted",
      "CutoverDecisionTppReadOnlySet",
      "CutoverDecisionRolledBack",
    ]) {
      expect(types).toContain(type);
    }
  });
});
