/**
 * A short packed count stays listed so the packer can record the rest.
 * The line becomes packed only when the packed count matches the required count.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const tenantId = "tenant-partial-pack";

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

describe("runtime proof: short pack counts stay open", () => {
  it("keeps a short line listed, then packs it when the full amount is recorded", async () => {
    const proof = harness();
    const sales = proof.asRole({
      subject: "sales-partial-pack",
      role: "sales_manager",
      tenantId,
    });
    const client = (await proof.executeCommand(
      sales,
      api.mutations.Client_createViaRegister,
      {
        clientType: "company",
        companyName: "Partial pack client",
      },
    )) as { docId: string };
    const event = (await proof.executeCommand(
      sales,
      api.mutations.Event_createViaPlanEngagement,
      {
        clientId: client.docId,
        title: "Partial pack dinner",
        eventType: "corporate dinner",
        startsAt: Date.UTC(2026, 6, 22, 16, 0),
        endsAt: Date.UTC(2026, 6, 22, 22, 0),
        expectedHeadcount: 40,
        primaryContactName: "Pat Packer",
        budgetAmount: 2000,
        quotedPrice: 2400,
      },
    )) as { docId: string };
    const logistics = proof.asRole({
      subject: "logistics-partial-pack",
      role: "logistics_manager",
      tenantId,
    });
    const pack = (await proof.executeCommand(
      logistics,
      api.mutations.PackList_createViaOpen,
      {
        eventId: event.docId,
        name: "Main load",
        purpose: "Service",
      },
    )) as { docId: string };
    await proof.executeCommand(
      logistics,
      api.mutations.PackListItem_createViaAddItem,
      {
        packListId: pack.docId,
        description: "Chafers",
        requiredQuantity: 10,
        unit: "each",
      },
    );
    await proof.executeCommand(logistics, api.mutations.PackList_startPacking, {
      docId: pack.docId,
      version: 1,
    });
    const listed = (
      (await logistics.query(api.queries.listPackListItem, {})) as Array<{
        _id: string;
        version: number;
        status: string;
        packedQuantity: number;
      }>
    )[0]!;

    await proof.executeCommand(
      logistics,
      api.mutations.PackListItem_recordPackedCount,
      {
        docId: listed._id,
        version: listed.version,
        packedQuantity: 3,
      },
    );
    const short = (await logistics.run(async (ctx) =>
      ctx.db.get(listed._id as never),
    )) as {
      status: string;
      packedQuantity: number;
      packedAt: number | null;
      version: number;
    };
    expect(short.status).toBe("listed");
    expect(short.packedQuantity).toBe(3);
    expect(short.packedAt ?? null).toBeNull();

    await expect(
      proof.executeCommand(logistics, api.mutations.PackListItem_markPacked, {
        docId: listed._id,
        version: short.version,
        packedQuantity: 3,
      }),
    ).rejects.toThrow();

    await proof.executeCommand(
      logistics,
      api.mutations.PackListItem_markPacked,
      {
        docId: listed._id,
        version: short.version,
        packedQuantity: 10,
      },
    );
    const done = (await logistics.run(async (ctx) =>
      ctx.db.get(listed._id as never),
    )) as { status: string; packedQuantity: number; packedAt: number | null };
    expect(done.status).toBe("packed");
    expect(done.packedQuantity).toBe(10);
    expect(done.packedAt).not.toBeNull();
  });
});
