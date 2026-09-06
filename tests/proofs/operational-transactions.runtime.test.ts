import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
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

describe("operational transactions", () => {
  it("rolls back every earlier timeline adjustment when a later version is stale", async () => {
    const proof = harness();
    const owner = proof.asRole({
      subject: "timeline-owner",
      role: "owner",
      tenantId: "ops-tenant",
    });
    const clientId = await proof.seedEntity(owner, "clients", {
      tenantId: "ops-tenant",
      clientType: "company",
      companyName: "Client",
      taxExempt: false,
      paymentTermsDays: 0,
      status: "active",
      version: 1,
    });
    const eventId = await proof.seedEntity(owner, "events", {
      tenantId: "ops-tenant",
      clientId,
      title: "Service",
      eventType: "wedding",
      startsAt: 1,
      endsAt: 2,
      expectedHeadcount: 10,
      budgetAmount: 0,
      quotedPrice: 0,
      stage: "planning",
      version: 1,
    });
    const first = await proof.seedEntity(owner, "eventTimelineActivities", {
      tenantId: "ops-tenant",
      eventId,
      name: "First",
      startsAt: 10,
      sortOrder: 0,
      scheduledAt: 1,
      version: 1,
    });
    const second = await proof.seedEntity(owner, "eventTimelineActivities", {
      tenantId: "ops-tenant",
      eventId,
      name: "Second",
      startsAt: 20,
      sortOrder: 1,
      scheduledAt: 1,
      version: 2,
    });
    await expect(
      owner.mutation(
        (api.lib as any).operationalTransactions.reorderEventTimeline,
        {
          eventId,
          rows: [
            { docId: first, startsAt: 20, sortOrder: 1, version: 1 },
            { docId: second, startsAt: 10, sortOrder: 0, version: 1 },
          ],
        },
      ),
    ).rejects.toThrow(/VERSION_MISMATCH/);
    expect(await owner.run((ctx) => ctx.db.get(first as never))).toMatchObject({
      startsAt: 10,
      sortOrder: 0,
      version: 1,
    });
  });
});
