/**
 * Runtime proof: behaviour that used to be regex-patched into generated
 * convex/mutations.ts now comes from Manifest itself (2026-09-25).
 *
 *  - Event.changeServiceStyle only accepts one of the tenant's live, active
 *    service styles (constraint `count(ServiceStyle where id == …, status ==
 *    "active") > 0`; was scripts/apply-event-service-style-reference-guard.ts).
 *  - Org capability kill-switches deny domain commands through the generated
 *    checkRole (manifest.config.yaml `roleGateImport` →
 *    convex/lib/orgCapabilityGate.ts roleGateDenies; was
 *    scripts/apply-org-capability-check-role.ts).
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

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

type Proof = ReturnType<typeof harness>;
type Actor = ReturnType<Proof["asRole"]>;
type Created = { docId: string; version?: number };

async function run(
  proof: Proof,
  actor: Actor,
  fn: unknown,
  args: Record<string, unknown>,
): Promise<Created> {
  return (await proof.executeCommand(
    actor,
    fn as never,
    args as never,
  )) as Created;
}

async function styles(proof: Proof, owner: Actor, codeSuffix: string) {
  const active = await run(
    proof,
    owner,
    api.mutations.ServiceStyle_createViaRegister,
    {
      name: `Buffet ${codeSuffix}`,
      code: `buffet-${codeSuffix}`,
    },
  );
  const retired = await run(
    proof,
    owner,
    api.mutations.ServiceStyle_createViaRegister,
    {
      name: `Plated ${codeSuffix}`,
      code: `plated-${codeSuffix}`,
    },
  );
  await run(proof, owner, api.mutations.ServiceStyle_deactivate, {
    docId: retired.docId,
    reason: "No longer offered",
  });
  return { active: active.docId, retired: retired.docId };
}

describe("runtime proof: Event.changeServiceStyle reference check", () => {
  it("accepts an active style and refuses retired or foreign ones", async () => {
    const proof = harness();
    const owner = proof.asRole({
      subject: "owner-style-a",
      role: "owner",
      tenantId: "tenant-style-a",
    });
    const other = proof.asRole({
      subject: "owner-style-b",
      role: "owner",
      tenantId: "tenant-style-b",
    });
    await run(proof, owner, api.mutations.Organization_createViaRegister, {
      name: "Style kitchen A",
    });
    await run(proof, other, api.mutations.Organization_createViaRegister, {
      name: "Style kitchen B",
    });
    const mine = await styles(proof, owner, "a");
    const theirs = await styles(proof, other, "b");

    const client = await run(
      proof,
      owner,
      api.mutations.Client_createViaRegister,
      {
        clientType: "company",
        companyName: "Reference check client",
      },
    );
    const event = await run(
      proof,
      owner,
      api.mutations.Event_createViaPlanEngagement,
      {
        clientId: client.docId,
        title: "Reference check dinner",
        eventType: "catering",
        startsAt: Date.UTC(2026, 11, 5, 18, 0),
        endsAt: Date.UTC(2026, 11, 5, 23, 0),
        expectedHeadcount: 80,
        primaryContactName: "Robin Reference",
        budgetAmount: 3000,
        quotedPrice: 4500,
      },
    );

    for (const refused of [mine.retired, theirs.active, "not-a-style-id"]) {
      await expect(
        run(proof, owner, api.mutations.Event_changeServiceStyle, {
          docId: event.docId,
          serviceStyleId: refused,
        }),
      ).rejects.toThrow("Events must reference an active service style");
    }
    const unchanged = await owner.run(async (ctx) =>
      ctx.db.get(event.docId as never),
    );
    expect(
      (unchanged as { serviceStyleId?: string | null }).serviceStyleId ?? null,
    ).toBeNull();

    await run(proof, owner, api.mutations.Event_changeServiceStyle, {
      docId: event.docId,
      serviceStyleId: mine.active,
    });
    const changed = await owner.run(async (ctx) =>
      ctx.db.get(event.docId as never),
    );
    expect((changed as { serviceStyleId?: string }).serviceStyleId).toBe(
      mine.active,
    );
  });
});

describe("runtime proof: org capability switch gates generated commands", () => {
  it("denies a switched-off domain and allows it again once switched on", async () => {
    const proof = harness();
    const owner = proof.asRole({
      subject: "owner-capability",
      role: "owner",
      tenantId: "tenant-capability",
    });
    await run(proof, owner, api.mutations.Organization_createViaRegister, {
      name: "Capability kitchen",
    });

    const salesSwitch = await run(
      proof,
      owner,
      api.mutations.OrganizationCapabilitySetting_createViaRegister,
      {
        capability: "sales",
        enabled: false,
      },
    );
    await expect(
      run(proof, owner, api.mutations.Client_createViaRegister, {
        clientType: "company",
        companyName: "Blocked while sales is off",
      }),
    ).rejects.toThrow(/Sales staff may (update|change) client accounts/);
    // Other domains are untouched by the sales switch.
    await run(proof, owner, api.mutations.ServiceStyle_createViaRegister, {
      name: "Family style",
      code: "family",
    });

    await run(
      proof,
      owner,
      api.mutations.OrganizationCapabilitySetting_setEnabled,
      {
        docId: salesSwitch.docId,
        enabled: true,
      },
    );
    const client = await run(
      proof,
      owner,
      api.mutations.Client_createViaRegister,
      {
        clientType: "company",
        companyName: "Allowed once sales is on",
      },
    );
    expect(client.docId).toBeTruthy();
  });
});
