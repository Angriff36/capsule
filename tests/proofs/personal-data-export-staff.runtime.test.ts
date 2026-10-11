/**
 * A staff member's personal data export carries their performance reviews
 * (notes opened), one-on-ones and training records, not only their profile.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";

beforeAll(() => {
  process.env.CONVEX_FIELD_ENCRYPTION_KEY ||=
    "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
});

const M = api.mutations;

describe("staff personal data export", () => {
  it("includes reviews, training and one-on-ones", async () => {
    const proof = createManifestTestContext({
      convexTest: convexTest as never,
      schema,
      modules,
    });
    const admin = proof.asRole({
      subject: "export-admin",
      role: "admin",
      tenantId: "tenant-export-staff",
    });
    const person = (
      (await proof.executeCommand(admin, M.Person_createViaHire, {
        givenName: "Riley",
        familyName: "Export",
        email: "riley.export@example.test",
      })) as { docId: string }
    ).docId;
    const reviewer = (
      (await proof.executeCommand(admin, M.Person_createViaHire, {
        givenName: "Marco",
        familyName: "Lead",
        email: "marco.lead@example.test",
      })) as { docId: string }
    ).docId;
    await proof.executeCommand(admin, M.PerformanceReview_createViaRecord, {
      personId: person,
      reviewerId: reviewer,
      reviewDate: Date.UTC(2026, 9, 9),
      reliabilityRating: 4,
      qualityRating: 5,
      teamworkRating: 4,
      notes: "Consider for lead",
    });
    const moduleId = (
      (await proof.executeCommand(admin, M.TrainingModule_createViaDefine, {
        name: "Knife safety",
        category: "food_safety",
        passingScore: 80,
      })) as { docId: string }
    ).docId;
    await proof.executeCommand(admin, M.TrainingCompletion_createViaRecord, {
      personId: person,
      trainingModuleId: moduleId,
      completedAt: Date.UTC(2026, 9, 8),
      assessmentScore: 92,
    });

    const exported = (await admin.query(
      api.personalDataExport.getSubjectPackage,
      { subjectType: "staff", subjectId: person },
    )) as {
      records: Record<string, Array<Record<string, unknown>>>;
    };
    expect(exported.records.performanceReviews).toHaveLength(1);
    expect(exported.records.performanceReviews[0]!.notes).toBe(
      "Consider for lead",
    );
    expect(exported.records.trainingCompletions).toHaveLength(1);
    expect(exported.records.oneOnOnes).toEqual([]);
  });
});
