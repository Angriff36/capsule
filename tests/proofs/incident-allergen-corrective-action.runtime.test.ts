/**
 * Runtime proof: allergen incident response workflow.
 * Incident.report (allergen) locks the record (correctiveActionRequired),
 * markResolved/dismiss are blocked while locked, CorrectiveAction.close
 * fires the CorrectiveActionClosed reaction which clears the lock, after
 * which the incident can be resolved.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const S = {
  tenant: "tenant-allergen-a",
  startsAt: Date.UTC(2026, 6, 25, 17, 0),
  endsAt: Date.UTC(2026, 6, 25, 22, 0),
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

async function seedEvent(proof: ReturnType<typeof harness>, tenantId: string) {
  const sales = proof.asRole({
    subject: `sales-${tenantId}`,
    role: "sales_manager",
    tenantId,
  });
  const client = (await proof.executeCommand(
    sales,
    api.mutations.Client_createViaRegister,
    {
      clientType: "company",
      companyName: `Allergen proof client ${tenantId}`,
    },
  )) as { docId: string };
  const event = (await proof.executeCommand(
    sales,
    api.mutations.Event_createViaPlanEngagement,
    {
      clientId: client.docId,
      title: "Allergen proof event",
      eventType: "corporate dinner",
      startsAt: S.startsAt,
      endsAt: S.endsAt,
      expectedHeadcount: 40,
      primaryContactName: "Alex Allergen",
      budgetAmount: 3000,
      quotedPrice: 4500,
    },
  )) as { docId: string };
  return event.docId;
}

describe("runtime proof: allergen incident corrective-action lock", () => {
  it("locks an allergen incident until its corrective action closes", async () => {
    const proof = harness();
    const eventId = await seedEvent(proof, S.tenant);
    const manager = proof.asRole({
      subject: `event-manager-${S.tenant}`,
      role: "event_manager",
      tenantId: S.tenant,
    });

    const incident = (await proof.executeCommand(
      manager,
      api.mutations.Incident_createViaReport,
      {
        eventId,
        severity: "high",
        category: "allergen",
        description: "Guest reported peanut exposure in dessert station",
      },
    )) as { docId: string };

    const reported = await manager.run(async (ctx) =>
      ctx.db.get(incident.docId as never),
    );
    expect(reported).toMatchObject({
      tenantId: S.tenant,
      category: "allergen",
      status: "open",
      correctiveActionRequired: true,
      reportedAt: expect.any(Number),
    });

    // Locked: resolution is blocked while the corrective action is open.
    await expect(
      proof.executeCommand(manager, api.mutations.Incident_markResolved, {
        docId: incident.docId,
        resolution: "attempt while locked",
      }),
    ).rejects.toThrow(/locked until the corrective action is closed/);

    const corrective = (await proof.executeCommand(
      manager,
      api.mutations.CorrectiveAction_createViaOpen,
      {
        incidentId: incident.docId,
        eventId,
        description: "Deep-clean dessert station and retrain staff on labels",
      },
    )) as { docId: string };

    await proof.executeCommand(manager, api.mutations.CorrectiveAction_close, {
      docId: corrective.docId,
      resolutionNotes: "Station cleaned, labels re-verified",
    });

    const closed = await manager.run(async (ctx) =>
      ctx.db.get(corrective.docId as never),
    );
    expect(closed).toMatchObject({
      status: "closed",
      closedAt: expect.any(Number),
    });

    // Reaction CorrectiveActionClosed → Incident.clearCorrectiveActionLock.
    const unlocked = await manager.run(async (ctx) =>
      ctx.db.get(incident.docId as never),
    );
    expect(unlocked).toMatchObject({ correctiveActionRequired: false });

    await proof.executeCommand(manager, api.mutations.Incident_markResolved, {
      docId: incident.docId,
      resolution: "Guest treated, allergen source removed, process fixed",
    });
    const resolved = await manager.run(async (ctx) =>
      ctx.db.get(incident.docId as never),
    );
    expect(resolved).toMatchObject({
      status: "resolved",
      resolvedAt: expect.any(Number),
    });
  });

  it("does not lock non-allergen incidents", async () => {
    const proof = harness();
    const eventId = await seedEvent(proof, S.tenant);
    const manager = proof.asRole({
      subject: `event-manager2-${S.tenant}`,
      role: "event_manager",
      tenantId: S.tenant,
    });

    const incident = (await proof.executeCommand(
      manager,
      api.mutations.Incident_createViaReport,
      {
        eventId,
        severity: "low",
        category: "service",
        description: "Late plating on second course",
      },
    )) as { docId: string };

    await proof.executeCommand(manager, api.mutations.Incident_markResolved, {
      docId: incident.docId,
      resolution: "Timing adjusted with kitchen",
    });
    const resolved = await manager.run(async (ctx) =>
      ctx.db.get(incident.docId as never),
    );
    expect(resolved).toMatchObject({ status: "resolved" });
  });
});
