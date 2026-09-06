import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";

const harness = () =>
  createManifestTestContext({
    convexTest: convexTest as never,
    schema,
    modules,
  });

beforeAll(() => {
  process.env.CONVEX_FIELD_ENCRYPTION_KEY ??=
    "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
});

async function person(
  proof: ReturnType<typeof harness>,
  tenantId: string,
  subject: string,
  role = "manager",
) {
  const manager = proof.asRole({
    subject: `hire-${subject}`,
    role: "owner",
    tenantId,
  });
  const result = (await proof.executeCommand(
    manager,
    api.mutations.Person_createViaHire,
    {
      givenName: subject,
      familyName: "Owner",
      email: `${subject}@example.test`,
      role,
      employmentType: "full_time",
    },
  )) as { docId: string };
  await proof.executeCommand(manager, api.mutations.Person_linkAccount, {
    docId: result.docId,
    authSubjectId: subject,
  });
  return { id: result.docId, auth: proof.asRole({ subject, role, tenantId }) };
}

describe("personal saved views and outreach", () => {
  it("changes only the current manager's default while another owner's default stays intact", async () => {
    const proof = harness();
    const first = await person(proof, "tenant-views", "first");
    const second = await person(proof, "tenant-views", "second");
    const make = async (
      auth: typeof first.auth,
      name: string,
      isDefault: boolean,
    ) =>
      (
        (await proof.executeCommand(
          auth,
          api.mutations.SavedReportDefinition_createViaCreateDefinition,
          {
            name,
            subjectArea: "events",
            chartType: "list-view",
            definition: { pageKey: "events", isDefault, state: { name } },
            sharingScope: "team",
          },
        )) as { docId: string }
      ).docId;
    const firstOld = await make(first.auth, "First old", true);
    const firstNew = await make(first.auth, "First new", false);
    const secondDefault = await make(second.auth, "Second default", true);
    await first.auth.mutation(api.lib.savedViewOperations.setDefault, {
      pageKey: "events",
      targetId: firstNew as never,
    });
    const rows = await first.auth.run(async (ctx) =>
      Promise.all(
        [firstOld, firstNew, secondDefault].map((id) =>
          ctx.db.get(id as never),
        ),
      ),
    );
    expect((rows[0] as any).definition.isDefault).toBe(false);
    expect((rows[1] as any).definition.isDefault).toBe(true);
    expect((rows[2] as any).definition.isDefault).toBe(true);
  });

  it("rolls back default clearing when creation fails after the first write", async () => {
    const proof = harness();
    const owner = await person(proof, "tenant-rollback", "rollback-owner");
    const existing = (
      (await proof.executeCommand(
        owner.auth,
        api.mutations.SavedReportDefinition_createViaCreateDefinition,
        {
          name: "Existing",
          subjectArea: "events",
          chartType: "list-view",
          definition: { pageKey: "events", isDefault: true, state: {} },
          sharingScope: "owner_only",
        },
      )) as { docId: string }
    ).docId;
    await expect(
      owner.auth.mutation(api.lib.savedViewOperations.create, {
        pageKey: "events",
        name: "",
        subjectArea: "events",
        state: {},
        makeDefault: true,
      }),
    ).rejects.toThrow("Report name is required");
    const row = await owner.auth.run(async (ctx) =>
      ctx.db.get(existing as never),
    );
    expect((row as any).definition.isDefault).toBe(true);
  });

  it("ensures one open outreach task, but allows another after dismissal", async () => {
    const proof = harness();
    const owner = proof.asRole({
      subject: "sales-owner",
      role: "owner",
      tenantId: "tenant-outreach",
    });
    const clientId = await proof.seedEntity(owner, "clients", {
      tenantId: "tenant-outreach",
      clientType: "company",
      companyName: "Client",
      taxExempt: false,
      paymentTermsDays: 0,
      status: "active",
      registeredAt: 1,
      version: 1,
    });
    const first = (await owner.mutation(api.lib.clientOutreach.ensureOpen, {
      clientId,
      reason: "Call",
    })) as { taskId: string; created: boolean };
    const retry = (await owner.mutation(api.lib.clientOutreach.ensureOpen, {
      clientId,
      reason: "Call",
    })) as { taskId: string; created: boolean };
    expect(first.created).toBe(true);
    expect(retry).toMatchObject({ created: false, taskId: first.taskId });
    await proof.executeCommand(
      owner,
      api.mutations.ClientOutreachTask_dismiss,
      { docId: first.taskId, version: 1 },
    );
    const later = (await owner.mutation(api.lib.clientOutreach.ensureOpen, {
      clientId,
      reason: "Call again",
    })) as { taskId: string; created: boolean };
    expect(later.created).toBe(true);
    expect(later.taskId).not.toBe(first.taskId);
  });
});
