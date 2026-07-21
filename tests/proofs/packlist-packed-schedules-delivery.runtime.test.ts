/**
 * Runtime proof: PackList.markPacked ensures a Delivery via Manifest reaction
 * (match else create Delivery.schedule).
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const S = {
  tenantId: "tenant-packlist-packed-delivery",
  startsAt: Date.UTC(2026, 6, 29, 16, 0),
  endsAt: Date.UTC(2026, 6, 29, 22, 0),
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

describe("runtime proof: PackList.markPacked → Delivery.schedule", () => {
  it("creates one scheduled delivery for the packed pack list", async () => {
    const proof = harness();
    const sales = proof.asRole({
      subject: "sales-delivery-cascade",
      role: "sales_manager",
      tenantId: S.tenantId,
    });
    const logistics = proof.asRole({
      subject: "logistics-delivery-cascade",
      role: "logistics_manager",
      tenantId: S.tenantId,
    });

    const client = (await proof.executeCommand(
      sales,
      api.mutations.Client_createViaRegister,
      {
        clientType: "company",
        companyName: "Delivery cascade client",
      },
    )) as { docId: string };

    const event = (await proof.executeCommand(
      sales,
      api.mutations.Event_createViaPlanEngagement,
      {
        clientId: client.docId,
        title: "Delivery cascade dinner",
        eventType: "catering",
        startsAt: S.startsAt,
        endsAt: S.endsAt,
        expectedHeadcount: 50,
        primaryContactName: "Dana Cascade",
        venueName: "Harbor Hall",
        venueAddress: "100 Pier Road",
        budgetAmount: 3000,
        quotedPrice: 4000,
      },
    )) as { docId: string };

    const pack = (await proof.executeCommand(
      logistics,
      api.mutations.PackList_createViaOpen,
      {
        eventId: event.docId,
        name: "Cascade load",
      },
    )) as { docId: string };

    await proof.executeCommand(logistics, api.mutations.PackList_startPacking, {
      docId: pack.docId,
      version: 1,
    });
    await proof.executeCommand(logistics, api.mutations.PackList_markPacked, {
      docId: pack.docId,
      version: 2,
    });

    const deliveries = await logistics.run(async (ctx) =>
      ctx.db.query("deliveries").collect(),
    );
    const forPack = deliveries.filter(
      (row) =>
        (row as { deletedAt?: number | null }).deletedAt == null &&
        (row as { packListId?: string }).packListId === pack.docId,
    );
    expect(forPack).toHaveLength(1);
    const delivery = forPack[0]! as {
      eventId?: string;
      destination?: string;
      scheduledAt?: number | null;
      status?: string;
      windowStartsAt?: number;
      windowEndsAt?: number;
    };
    expect(delivery.eventId).toBe(event.docId);
    expect(delivery.status).toBe("scheduled");
    expect(delivery.scheduledAt).toEqual(expect.any(Number));
    expect(delivery.destination).toBe("100 Pier Road");
    expect(delivery.windowStartsAt).toBe(S.startsAt);
    expect(delivery.windowEndsAt).toBe(S.endsAt);

    // Re-pack is not available; re-run schedule via match path.
    await proof.executeCommand(logistics, api.mutations.Delivery_schedule, {
      docId: (forPack[0] as { _id: string })._id,
      packListId: pack.docId,
      eventId: event.docId,
      destination: "Should keep existing destination",
      windowStartsAt: S.startsAt,
      windowEndsAt: S.endsAt,
      version: (forPack[0] as { version?: number }).version,
    });
    const again = await logistics.run(async (ctx) =>
      ctx.db.query("deliveries").collect(),
    );
    const still = again.filter(
      (row) =>
        (row as { deletedAt?: number | null }).deletedAt == null &&
        (row as { packListId?: string }).packListId === pack.docId,
    );
    expect(still).toHaveLength(1);
    expect((still[0] as { destination?: string }).destination).toBe(
      "100 Pier Road",
    );
  });
});
