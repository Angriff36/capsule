/**
 * Bin numbers and the bin sheet (Mangia "Memo - Perfect Packing"): a packer
 * writes the bin number on a line; the list keeps the lid colour of each bin
 * and, after the event, which bins came back with dirty dishes.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const tenantId = "tenant-pack-bins";

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

describe("runtime proof: pack bins", () => {
  it("saves a line's bin number, refuses bin 0, and keeps the bin sheet", async () => {
    const proof = harness();
    const sales = proof.asRole({
      subject: "sales-pack-bins",
      role: "sales_manager",
      tenantId,
    });
    const client = (await proof.executeCommand(
      sales,
      api.mutations.Client_createViaRegister,
      { clientType: "company", companyName: "Bin client" },
    )) as { docId: string };
    const event = (await proof.executeCommand(
      sales,
      api.mutations.Event_createViaPlanEngagement,
      {
        clientId: client.docId,
        title: "Bin dinner",
        eventType: "corporate dinner",
        startsAt: Date.UTC(2026, 9, 24, 16, 0),
        endsAt: Date.UTC(2026, 9, 24, 22, 0),
        expectedHeadcount: 120,
        primaryContactName: "Pat Packer",
        budgetAmount: 2000,
        quotedPrice: 2400,
      },
    )) as { docId: string };
    const logistics = proof.asRole({
      subject: "logistics-pack-bins",
      role: "logistics_manager",
      tenantId,
    });
    const pack = (await proof.executeCommand(
      logistics,
      api.mutations.PackList_createViaOpen,
      { eventId: event.docId, name: "Main load", purpose: "Service" },
    )) as { docId: string };
    await proof.executeCommand(
      logistics,
      api.mutations.PackListItem_createViaAddItem,
      {
        packListId: pack.docId,
        description: "Cheese knife",
        requiredQuantity: 2,
        unit: "each",
      },
    );
    const line = (
      (await logistics.query(api.queries.listPackListItem, {})) as Array<{
        _id: string;
        version: number;
      }>
    )[0]!;

    await proof.executeCommand(logistics, api.mutations.PackListItem_setBin, {
      docId: line._id,
      version: line.version,
      binNumber: 12,
    });
    const inBin = (await logistics.run(async (ctx) =>
      ctx.db.get(line._id as never),
    )) as { binNumber: number | null; version: number };
    expect(inBin.binNumber).toBe(12);

    await expect(
      proof.executeCommand(logistics, api.mutations.PackListItem_setBin, {
        docId: line._id,
        version: inBin.version,
        binNumber: 0,
      }),
    ).rejects.toThrow(/bin number above zero/i);

    await proof.executeCommand(logistics, api.mutations.PackListItem_setBin, {
      docId: line._id,
      version: inBin.version,
    });
    const cleared = (await logistics.run(async (ctx) =>
      ctx.db.get(line._id as never),
    )) as { binNumber: number | null };
    expect(cleared.binNumber ?? null).toBeNull();

    const sheet = JSON.stringify([{ bin: 12, color: "green", dirty: false }]);
    await proof.executeCommand(logistics, api.mutations.PackList_setBinSheet, {
      docId: pack.docId,
      version: 1,
      binSheet: sheet,
    });
    const saved = (await logistics.run(async (ctx) =>
      ctx.db.get(pack.docId as never),
    )) as { binSheet: string | null; version: number };
    expect(saved.binSheet).toBe(sheet);

    await proof.executeCommand(logistics, api.mutations.PackList_setBinSheet, {
      docId: pack.docId,
      version: saved.version,
      binSheet: "  ",
    });
    const emptied = (await logistics.run(async (ctx) =>
      ctx.db.get(pack.docId as never),
    )) as { binSheet: string | null };
    expect(emptied.binSheet ?? null).toBeNull();
  });
});
