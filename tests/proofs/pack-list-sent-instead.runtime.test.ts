/**
 * A packer can record what went out when it was not the listed item.
 * The listed description, quantity, and packed status stay.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const tenantId = "tenant-sent-instead";

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

describe("runtime proof: pack line stand-in", () => {
  it("records what went out, then packs the listed quantity unchanged", async () => {
    const proof = harness();
    const sales = proof.asRole({
      subject: "sales-sent-instead",
      role: "sales_manager",
      tenantId,
    });
    const client = (await proof.executeCommand(
      sales,
      api.mutations.Client_createViaRegister,
      {
        clientType: "company",
        companyName: "Stand-in client",
      },
    )) as { docId: string };
    const event = (await proof.executeCommand(
      sales,
      api.mutations.Event_createViaPlanEngagement,
      {
        clientId: client.docId,
        title: "Stand-in dinner",
        eventType: "corporate dinner",
        startsAt: Date.UTC(2026, 8, 24, 16, 0),
        endsAt: Date.UTC(2026, 8, 24, 22, 0),
        expectedHeadcount: 40,
        primaryContactName: "Pat Packer",
        budgetAmount: 2000,
        quotedPrice: 2400,
      },
    )) as { docId: string };
    const logistics = proof.asRole({
      subject: "logistics-sent-instead",
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
    const listed = (
      (await logistics.query(api.queries.listPackListItem, {})) as Array<{
        _id: string;
        version: number;
        description: string;
        status: string;
      }>
    )[0]!;

    await proof.executeCommand(
      logistics,
      api.mutations.PackListItem_recordSentInstead,
      {
        docId: listed._id,
        version: listed.version,
        sentInstead: "  Hotel pans  ",
      },
    );
    const recorded = (await logistics.run(async (ctx) =>
      ctx.db.get(listed._id as never),
    )) as {
      description: string;
      status: string;
      packedQuantity: number;
      sentInstead: string | null;
      version: number;
    };
    expect(recorded.description).toBe("Chafers");
    expect(recorded.status).toBe("listed");
    expect(recorded.packedQuantity).toBe(0);
    expect(recorded.sentInstead).toBe("Hotel pans");

    await proof.executeCommand(logistics, api.mutations.PackList_startPacking, {
      docId: pack.docId,
      version: 1,
    });
    await proof.executeCommand(
      logistics,
      api.mutations.PackListItem_markPacked,
      {
        docId: listed._id,
        version: recorded.version,
        packedQuantity: 10,
      },
    );
    const packed = (await logistics.run(async (ctx) =>
      ctx.db.get(listed._id as never),
    )) as {
      description: string;
      status: string;
      packedQuantity: number;
      sentInstead: string | null;
      version: number;
    };
    expect(packed.description).toBe("Chafers");
    expect(packed.status).toBe("packed");
    expect(packed.packedQuantity).toBe(10);
    expect(packed.sentInstead).toBe("Hotel pans");

    await proof.executeCommand(
      logistics,
      api.mutations.PackListItem_recordSentInstead,
      {
        docId: listed._id,
        version: packed.version,
        sentInstead: "   ",
      },
    );
    const cleared = (await logistics.run(async (ctx) =>
      ctx.db.get(listed._id as never),
    )) as {
      description: string;
      status: string;
      sentInstead: string | null;
    };
    expect(cleared.sentInstead).toBeNull();
    expect(cleared.description).toBe("Chafers");
    expect(cleared.status).toBe("packed");
  });
});
