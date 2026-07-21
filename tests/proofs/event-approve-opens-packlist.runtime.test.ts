/**
 * Runtime proof: Event.approve ensures a PackList via Manifest reaction
 * (match else create PackList.open).
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const S = {
  tenantId: "tenant-event-approve-packlist",
  startsAt: Date.UTC(2026, 6, 28, 12, 0),
  endsAt: Date.UTC(2026, 6, 28, 22, 0),
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

describe("runtime proof: Event.approve → PackList.open", () => {
  it("creates one opened pack list draft for the approved event", async () => {
    const proof = harness();
    const sales = proof.asRole({
      subject: "sales-packlist-cascade",
      role: "sales_manager",
      tenantId: S.tenantId,
    });
    const events = proof.asRole({
      subject: "events-packlist-cascade",
      role: "event_manager",
      tenantId: S.tenantId,
    });
    const logistics = proof.asRole({
      subject: "logistics-packlist-cascade",
      role: "logistics_manager",
      tenantId: S.tenantId,
    });

    const client = (await proof.executeCommand(
      sales,
      api.mutations.Client_createViaRegister,
      {
        clientType: "company",
        companyName: "Packlist cascade client",
      },
    )) as { docId: string };

    const event = (await proof.executeCommand(
      sales,
      api.mutations.Event_createViaPlanEngagement,
      {
        clientId: client.docId,
        title: "Packlist cascade lunch",
        eventType: "catering",
        startsAt: S.startsAt,
        endsAt: S.endsAt,
        expectedHeadcount: 40,
        primaryContactName: "Pat Planner",
        budgetAmount: 2000,
        quotedPrice: 2500,
      },
    )) as { docId: string };

    const before = await logistics.run(async (ctx) =>
      ctx.db.query("packLists").collect(),
    );
    expect(
      before.filter(
        (row) =>
          (row as { deletedAt?: number | null }).deletedAt == null &&
          (row as { eventId?: string }).eventId === event.docId,
      ),
    ).toHaveLength(0);

    await proof.executeCommand(events, api.mutations.Event_submitForApproval, {
      docId: event.docId,
      version: 1,
    });
    await proof.executeCommand(events, api.mutations.Event_approve, {
      docId: event.docId,
      version: 2,
    });

    const after = await logistics.run(async (ctx) =>
      ctx.db.query("packLists").collect(),
    );
    const forEvent = after.filter(
      (row) =>
        (row as { deletedAt?: number | null }).deletedAt == null &&
        (row as { eventId?: string }).eventId === event.docId,
    );
    expect(forEvent).toHaveLength(1);
    const pack = forEvent[0]! as {
      name?: string;
      openedAt?: number | null;
      status?: string;
    };
    expect(pack.openedAt).toEqual(expect.any(Number));
    expect(pack.status).toBe("draft");
    expect(String(pack.name).length).toBeGreaterThan(0);

    // Re-approve path is not available from approved without reverting; re-run
    // open via match is covered by idempotent open when reaction re-fires.
    await proof.executeCommand(logistics, api.mutations.PackList_open, {
      docId: (forEvent[0] as { _id: string })._id,
      eventId: event.docId,
      name: "Should keep existing name",
      version: (forEvent[0] as { version?: number }).version,
    });
    const again = await logistics.run(async (ctx) =>
      ctx.db.query("packLists").collect(),
    );
    const still = again.filter(
      (row) =>
        (row as { deletedAt?: number | null }).deletedAt == null &&
        (row as { eventId?: string }).eventId === event.docId,
    );
    expect(still).toHaveLength(1);
    expect((still[0] as { name?: string }).name).toBe(pack.name);
  });
});
