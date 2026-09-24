/**
 * Saving a packed count records the linked staff profile.
 * An account with no staff profile can still save the count.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const tenantId = "tenant-packed-by";

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

describe("runtime proof: pack line remembers who packed it", () => {
  it("lets an unlinked account pack, then stamps the linked packer", async () => {
    const proof = harness();
    const sales = proof.asRole({
      subject: "sales-packed-by",
      role: "sales_manager",
      tenantId,
    });
    const client = (await proof.executeCommand(
      sales,
      api.mutations.Client_createViaRegister,
      {
        clientType: "company",
        companyName: "Packed-by client",
      },
    )) as { docId: string };
    const event = (await proof.executeCommand(
      sales,
      api.mutations.Event_createViaPlanEngagement,
      {
        clientId: client.docId,
        title: "Packed-by dinner",
        eventType: "corporate dinner",
        startsAt: Date.UTC(2026, 8, 24, 16, 0),
        endsAt: Date.UTC(2026, 8, 24, 22, 0),
        expectedHeadcount: 20,
        primaryContactName: "Pat Packer",
        budgetAmount: 1000,
        quotedPrice: 1400,
      },
    )) as { docId: string };
    const unlinked = proof.asRole({
      subject: "logistics-unlinked-packed-by",
      role: "logistics_manager",
      tenantId,
    });
    const pack = (await proof.executeCommand(
      unlinked,
      api.mutations.PackList_createViaOpen,
      {
        eventId: event.docId,
        name: "Main load",
        purpose: "Service",
      },
    )) as { docId: string };
    await proof.executeCommand(
      unlinked,
      api.mutations.PackListItem_createViaAddItem,
      {
        packListId: pack.docId,
        description: "Chafers",
        requiredQuantity: 10,
        unit: "each",
      },
    );
    await proof.executeCommand(unlinked, api.mutations.PackList_startPacking, {
      docId: pack.docId,
      version: 1,
    });
    const listed = (
      (await unlinked.query(api.queries.listPackListItem, {})) as Array<{
        _id: string;
        version: number;
      }>
    )[0]!;
    await proof.executeCommand(
      unlinked,
      api.mutations.PackListItem_recordPackedCount,
      {
        docId: listed._id,
        version: listed.version,
        packedQuantity: 3,
      },
    );
    const unstamped = (await unlinked.run(async (ctx) =>
      ctx.db.get(listed._id as never),
    )) as {
      status: string;
      packedQuantity: number;
      packedByPersonId: string | null;
      version: number;
    };
    expect(unstamped.status).toBe("listed");
    expect(unstamped.packedQuantity).toBe(3);
    expect(unstamped.packedByPersonId ?? null).toBeNull();

    const workforce = proof.asRole({
      subject: "workforce-packed-by",
      role: "workforce_manager",
      tenantId,
    });
    const hired = (await proof.executeCommand(
      workforce,
      api.mutations.Person_createViaHire,
      {
        givenName: "Avery",
        familyName: "Rivera",
        email: "avery-packed-by@proof.example",
        role: "logistics_manager",
        employmentType: "full_time",
        authSubjectId: "packer-linked",
      },
    )) as { docId: string };
    const packer = proof.asRole({
      subject: "packer-linked",
      role: "logistics_manager",
      tenantId,
    });
    await proof.executeCommand(
      packer,
      api.mutations.PackListItem_recordPackedCount,
      {
        docId: listed._id,
        version: unstamped.version,
        packedQuantity: 6,
      },
    );
    const stamped = (await packer.run(async (ctx) =>
      ctx.db.get(listed._id as never),
    )) as {
      status: string;
      packedQuantity: number;
      packedByPersonId: string | null;
      version: number;
    };
    expect(stamped.status).toBe("listed");
    expect(stamped.packedQuantity).toBe(6);
    expect(stamped.packedByPersonId).toBe(hired.docId);

    await proof.executeCommand(packer, api.mutations.PackListItem_markPacked, {
      docId: listed._id,
      version: stamped.version,
      packedQuantity: 10,
    });
    const packed = (await packer.run(async (ctx) =>
      ctx.db.get(listed._id as never),
    )) as {
      status: string;
      packedQuantity: number;
      packedByPersonId: string | null;
    };
    expect(packed.status).toBe("packed");
    expect(packed.packedQuantity).toBe(10);
    expect(packed.packedByPersonId).toBe(hired.docId);

    await proof.executeCommand(
      unlinked,
      api.mutations.PackListItem_recordSentInstead,
      {
        docId: listed._id,
        version: (
          (await unlinked.run(async (ctx) =>
            ctx.db.get(listed._id as never),
          )) as { version: number }
        ).version,
        sentInstead: "Hotel pans",
      },
    );
    const still = (await unlinked.run(async (ctx) =>
      ctx.db.get(listed._id as never),
    )) as { packedByPersonId: string | null; sentInstead: string | null };
    expect(still.sentInstead).toBe("Hotel pans");
    expect(still.packedByPersonId).toBe(hired.docId);
  });
});
