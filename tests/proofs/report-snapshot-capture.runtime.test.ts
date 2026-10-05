/**
 * Runtime proof (PL-REPORT-SNAPSHOT, AC-147 backend leg): a report snapshot
 * is stamped with when it was taken and by whom from the signed-in person
 * (never from the caller), keeps its figures as sent, has no step that
 * changes them, and shows only to people the report is shared with who may
 * read that kind of record. Synthetic workspace only.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import * as mutations from "../../convex/mutations";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const tenantId = "tenant-report-snapshot";

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

async function hire(
  proof: ReturnType<typeof harness>,
  label: string,
  role: "event_staff" | "admin" = "event_staff",
) {
  const authSubjectId = `user_${tenantId}_${label}`;
  const manager = proof.asRole({
    subject: `workforce-${label}`,
    role: "owner",
    tenantId,
  });
  const person = (await proof.executeCommand(
    manager,
    api.mutations.Person_createViaHire,
    {
      givenName: "Sam",
      familyName: label,
      email: `sam-${label}@proof.example`,
      role,
      employmentType: "full_time",
    },
  )) as { docId: string };
  await proof.executeCommand(manager, api.mutations.Person_linkAccount, {
    docId: person.docId,
    authSubjectId,
  });
  return { personId: person.docId, authSubjectId };
}

const figures = {
  version: 1,
  chartType: "table",
  dateWindow: "30_days",
  filters: {},
  leftOut: { noEvent: 0, filteredOut: 0 },
  model: { kpis: [{ label: "Events", value: "3" }], rows: [] },
  rowsNotKept: 0,
};

describe("runtime proof: report snapshots are dated, frozen and shared like their report (AC-147)", () => {
  it("stamps who and when, keeps the figures, and follows sharing and subject access", async () => {
    const proof = harness();
    const a = await hire(proof, "a");
    const b = await hire(proof, "b");
    const boss = await hire(proof, "boss", "admin");
    const staffA = proof.asRole({
      subject: a.authSubjectId,
      role: "event_staff",
      tenantId,
    });
    const staffB = proof.asRole({
      subject: b.authSubjectId,
      role: "event_staff",
      tenantId,
    });
    const admin = proof.asRole({
      subject: boss.authSubjectId,
      role: "admin",
      tenantId,
    });
    const report = (await proof.executeCommand(
      staffA,
      api.mutations.SavedReportDefinition_createViaCreateDefinition,
      {
        name: "Weekend events",
        subjectArea: "events",
        chartType: "table",
        definition: { version: 2, dateWindow: "30_days" },
      },
    )) as { docId: string };

    const before = Date.now();
    const taken = (await proof.executeCommand(
      staffA,
      api.mutations.SavedReportSnapshot_createViaCapture,
      {
        savedReportDefinitionId: report.docId,
        title: "Weekend events",
        subjectArea: "events",
        sharingScope: "owner_only",
        figures,
        sourceAsOf: before - 60_000,
      },
    )) as { docId: string };
    const row = await staffA.run((ctx) => ctx.db.get(taken.docId as never));
    expect(row).toMatchObject({
      savedReportDefinitionId: report.docId,
      capturedByPersonId: a.personId,
      sourceAsOf: before - 60_000,
      figures,
    });
    expect((row as { capturedAt: number }).capturedAt).toBeGreaterThanOrEqual(
      before,
    );

    // Nothing changes a snapshot: only take and remove exist.
    const steps = Object.keys(mutations).filter((name) =>
      name.startsWith("SavedReportSnapshot_"),
    );
    expect(steps.sort()).toEqual([
      "SavedReportSnapshot_capture",
      "SavedReportSnapshot_createViaCapture",
      "SavedReportSnapshot_remove",
    ]);

    const ids = async (actor: typeof staffA) =>
      (
        (await actor.query(api.queries.listSavedReportSnapshot, {})) as {
          _id: string;
        }[]
      ).map((item) => String(item._id));
    // Just-for-you: the taker and managers see it, a coworker does not.
    expect(await ids(staffA)).toContain(taken.docId);
    expect(await ids(admin)).toContain(taken.docId);
    expect(await ids(staffB)).not.toContain(taken.docId);

    // Shared money figures stay with people who may see money.
    const money = (await proof.executeCommand(
      admin,
      api.mutations.SavedReportSnapshot_createViaCapture,
      {
        savedReportDefinitionId: report.docId,
        title: "Invoices",
        subjectArea: "finance",
        sharingScope: "team",
        figures,
      },
    )) as { docId: string };
    expect(await ids(admin)).toContain(money.docId);
    expect(await ids(staffB)).not.toContain(money.docId);

    // Only the taker (or a manager) removes it.
    await expect(
      proof.executeCommand(staffB, api.mutations.SavedReportSnapshot_remove, {
        docId: taken.docId,
        version: 1,
      }),
    ).rejects.toThrow();
    await proof.executeCommand(
      staffA,
      api.mutations.SavedReportSnapshot_remove,
      {
        docId: taken.docId,
        version: 1,
      },
    );
    expect(await ids(staffA)).not.toContain(taken.docId);
  }, 120_000);
});
