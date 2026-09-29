/**
 * Runtime proof (governed writes, 2026-09-29): the cutover seam changes
 * CutoverDecision rows only through the generated CutoverDecision commands
 * (create, recordApprovals, execute, setTppReadOnly, rollback), run in the
 * seam's own transaction with the caller's auth. Proven: the first sign-off
 * creates the decision through CutoverDecision_create and records the
 * approvals as that admin; no-go, read-only and rollback land through their
 * commands; a non-admin is still refused before any write; a repeat
 * sign-off reuses the one decision row.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";
import { ensureTestFieldEncryptionKey } from "./test-field-encryption-key";

const TENANT = "tenant-cutover-governed";

function harness() {
  return createManifestTestContext({
    convexTest: convexTest as never,
    schema,
    modules,
  });
}

beforeAll(ensureTestFieldEncryptionKey);

type Decision = {
  _id: string;
  status: string;
  decidedBy: string;
  reason: string;
  rollbackPlan: string;
  businessApproved?: boolean;
  tppReadOnlyAt?: number | null;
};

describe("runtime proof: cutover writes go through CutoverDecision commands", () => {
  it("creates, approves, decides, sets read-only and rolls back as the admin", async () => {
    const proof = harness();
    const owner = proof.asRole({
      subject: "cutover-governed-owner",
      role: "owner",
      tenantId: TENANT,
    });
    const manager = proof.asRole({
      subject: "cutover-governed-manager",
      role: "manager",
      tenantId: TENANT,
    });
    const decisions = async () =>
      (await owner.run(async (ctx) =>
        ctx.db.query("cutoverDecisions").collect(),
      )) as unknown as Decision[];

    // Authorization unchanged: a non-admin is refused before any write.
    await expect(
      manager.mutation(api.cutover.recordCutoverApprovals, {
        businessApproved: true,
        rollbackPlan: "Switch back to TPP",
      }),
    ).rejects.toThrow("Only admins can save the switch sign-off.");
    expect(await decisions()).toHaveLength(0);

    await owner.mutation(api.cutover.recordCutoverApprovals, {
      businessApproved: true,
      rollbackPlan: "Switch back to TPP",
    });
    let rows = await decisions();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: "not_started",
      reason: "Cutover initialized",
      businessApproved: true,
      rollbackPlan: "Switch back to TPP",
      decidedBy: "cutover-governed-owner",
    });

    // A repeat sign-off updates the same row (find-or-create is idempotent).
    await owner.mutation(api.cutover.recordCutoverApprovals, {
      businessApproved: true,
      rollbackPlan: "Switch back to TPP within an hour",
    });
    rows = await decisions();
    expect(rows).toHaveLength(1);
    expect(rows[0].rollbackPlan).toBe("Switch back to TPP within an hour");

    await owner.mutation(api.cutover.executeCutoverDecision, {
      decision: "no_go",
      reason: "Not yet",
    });
    rows = await decisions();
    expect(rows[0]).toMatchObject({ status: "no_go", reason: "Not yet" });

    // setTppReadOnly / rollback need a GO decision; the GO preconditions
    // (fresh import, zero unresolved links, providers) are proven in
    // cutover-provider-readiness. Put the row at "go" to drive the rest.
    await owner.run(async (ctx) => {
      await ctx.db.patch(rows[0]._id, { status: "go" });
    });
    await expect(
      manager.mutation(api.cutover.setTppReadOnly, { reason: "Freeze" }),
    ).rejects.toThrow("Only admins can set TPP to read-only.");
    await owner.mutation(api.cutover.setTppReadOnly, { reason: "Freeze" });
    rows = await decisions();
    expect(typeof rows[0].tppReadOnlyAt).toBe("number");

    await expect(
      manager.mutation(api.cutover.rollbackCutover, { reason: "Oops" }),
    ).rejects.toThrow("Only admins can undo the switch.");
    await owner.mutation(api.cutover.rollbackCutover, { reason: "Oops" });
    rows = await decisions();
    expect(rows[0]).toMatchObject({
      status: "rolled_back",
      reason: "Oops",
      decidedBy: "cutover-governed-owner",
    });

    // The generated command's own guard still holds: rollback needs "go".
    await expect(
      owner.mutation(api.cutover.rollbackCutover, { reason: "Again" }),
    ).rejects.toThrow("Can't undo: the switch was not approved.");
  });
});
