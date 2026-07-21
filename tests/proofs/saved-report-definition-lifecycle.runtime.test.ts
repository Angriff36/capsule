/**
 * Runtime proof: SavedReportDefinition.createDefinition → archive → restore.
 * ownerId is v.id("people"), so the JWT subject must be an opaque Person id.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";
import { SavedReportDefinitionCreateDefinitionParamsSchema } from "../../schemas/manifest-schemas";

const S = {
  tenantA: "tenant-report-a",
  tenantB: "tenant-report-b",
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

async function hireStaff(
  proof: ReturnType<typeof harness>,
  tenantId: string,
  label: string,
) {
  const manager = proof.asRole({
    subject: `workforce-${tenantId}-${label}`,
    role: "workforce_manager",
    tenantId,
  });
  const person = (await proof.executeCommand(
    manager,
    api.mutations.Person_createViaHire,
    {
      givenName: "Riley",
      familyName: label,
      email: `riley-${label}-${tenantId}@proof.example`,
      role: "staff",
      employmentType: "full_time",
    },
  )) as { docId: string };
  return person.docId;
}

describe("runtime proof: SavedReportDefinition create → archive → restore", () => {
  it("creates, archives, and restores a governed report definition", async () => {
    const proof = harness();
    const personId = await hireStaff(proof, S.tenantA, "owner");
    const staff = proof.asRole({
      subject: personId,
      role: "event_manager",
      tenantId: S.tenantA,
    });

    const createArgs = {
      name: "Weekly event load",
      subjectArea: "events" as const,
      chartType: "table",
      definition: { version: 1, notes: "proof" },
      sharingScope: "team" as const,
    };
    expect(() =>
      SavedReportDefinitionCreateDefinitionParamsSchema.parse(createArgs),
    ).not.toThrow();

    const created = (await proof.executeCommand(
      staff,
      api.mutations.SavedReportDefinition_createViaCreateDefinition,
      createArgs,
    )) as { docId: string };

    const defined = await staff.run(async (ctx) =>
      ctx.db.get(created.docId as never),
    );
    expect(defined).toMatchObject({
      tenantId: S.tenantA,
      name: "Weekly event load",
      subjectArea: "events",
      chartType: "table",
      sharingScope: "team",
      status: "active",
      ownerId: personId,
      definedAt: expect.any(Number),
      version: 1,
    });

    await proof.executeCommand(
      staff,
      api.mutations.SavedReportDefinition_archive,
      { docId: created.docId, version: 1 },
    );
    const archived = await staff.run(async (ctx) =>
      ctx.db.get(created.docId as never),
    );
    expect(archived).toMatchObject({
      status: "archived",
      archivedAt: expect.any(Number),
      version: 2,
    });

    await proof.executeCommand(
      staff,
      api.mutations.SavedReportDefinition_restore,
      { docId: created.docId, version: 2 },
    );
    const restored = await staff.run(async (ctx) =>
      ctx.db.get(created.docId as never),
    );
    expect(restored).toMatchObject({
      status: "active",
      restoredAt: expect.any(Number),
      version: 3,
    });
  });

  it("keeps owner_only reports out of another tenant", async () => {
    const proof = harness();
    const personId = await hireStaff(proof, S.tenantA, "private");
    const owner = proof.asRole({
      subject: personId,
      role: "manager",
      tenantId: S.tenantA,
    });
    const otherTenant = proof.asRole({
      subject: await hireStaff(proof, S.tenantB, "outsider"),
      role: "manager",
      tenantId: S.tenantB,
    });

    const created = (await proof.executeCommand(
      owner,
      api.mutations.SavedReportDefinition_createViaCreateDefinition,
      {
        name: "Private finance rollup",
        subjectArea: "finance",
        chartType: "bar",
        definition: { version: 1 },
        sharingScope: "owner_only",
      },
    )) as { docId: string };

    await expect(
      proof.executeCommand(
        otherTenant,
        api.mutations.SavedReportDefinition_archive,
        { docId: created.docId, version: 1 },
      ),
    ).rejects.toThrow();

    const stillActive = await owner.run(async (ctx) =>
      ctx.db.get(created.docId as never),
    );
    expect(stillActive).toMatchObject({
      status: "active",
      tenantId: S.tenantA,
      version: 1,
    });
  });
});
