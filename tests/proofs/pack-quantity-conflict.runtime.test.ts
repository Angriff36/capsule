/**
 * PL-OFFLINE-TIME (AC-139, PR10-09): a packed count the office has confirmed
 * survives a manager's change made at the same moment - the stale change is
 * refused as an explicit conflict, and a required amount below what is
 * packed is refused. A pack tap saved on the phone replays exactly once and
 * the line reads packed only after the server has it.
 */
import { convexTest } from "convex-test";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";
import {
  drainQueue,
  enqueueAction,
  loadQueue,
} from "../../src/features/staff/offlineStore";

const tenantId = "tenant-pack-conflict";
const SCOPE = `${tenantId}:packer`;
const M = api.mutations;

type Item = {
  _id: string;
  version: number;
  status: string;
  packedQuantity: number;
  requiredQuantity: number;
};

beforeAll(() => {
  process.env.CONVEX_FIELD_ENCRYPTION_KEY ??=
    "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
});

beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  });
  vi.stubGlobal("window", new EventTarget());
});
afterEach(() => vi.unstubAllGlobals());

describe("pack quantity conflict (AC-139)", () => {
  it("a confirmed packed quantity survives a concurrent adjustQuantity with an explicit conflict and the offline queue replays exactly once", async () => {
    const proof = createManifestTestContext({
      convexTest: convexTest as never,
      schema,
      modules,
    });
    const sales = proof.asRole({
      subject: "sales-pack-conflict",
      role: "sales_manager",
      tenantId,
    });
    const logistics = proof.asRole({
      subject: "logistics-pack-conflict",
      role: "logistics_manager",
      tenantId,
    });
    const run = async (role: typeof sales, cmd: unknown, args: object) =>
      (await proof.executeCommand(role, cmd as never, args as never)) as {
        docId: string;
      };
    const client = await run(sales, M.Client_createViaRegister, {
      clientType: "company",
      companyName: "Pack conflict client",
    });
    const event = await run(sales, M.Event_createViaPlanEngagement, {
      clientId: client.docId,
      title: "Pack conflict dinner",
      eventType: "corporate dinner",
      startsAt: Date.UTC(2026, 10, 12, 16, 0),
      endsAt: Date.UTC(2026, 10, 12, 22, 0),
      expectedHeadcount: 40,
      primaryContactName: "Pat Packer",
      budgetAmount: 2000,
      quotedPrice: 2400,
    });
    const pack = await run(logistics, M.PackList_createViaOpen, {
      eventId: event.docId,
      name: "Main load",
      purpose: "Service",
    });
    await run(logistics, M.PackListItem_createViaAddItem, {
      packListId: pack.docId,
      description: "Chafers",
      requiredQuantity: 10,
      unit: "each",
    });
    await run(logistics, M.PackList_startPacking, {
      docId: pack.docId,
      version: 1,
    });
    const item = async () =>
      ((await logistics.query(api.queries.listPackListItem, {})) as Item[])[0]!;
    const seen = await item();

    // The packer records 6 of 10; the office confirms it.
    await run(logistics, M.PackListItem_recordPackedCount, {
      docId: seen._id,
      version: seen.version,
      packedQuantity: 6,
    });
    const confirmed = await item();
    expect(confirmed.packedQuantity).toBe(6);

    // At the same moment a manager, still looking at the old line, cuts the
    // required amount: refused as a conflict, the packed 6 stays.
    await expect(
      run(logistics, M.PackListItem_adjustQuantity, {
        docId: seen._id,
        version: seen.version,
        requiredQuantity: 8,
      }),
    ).rejects.toThrow(/ConcurrencyConflict/);
    expect((await item()).packedQuantity).toBe(6);
    // With the latest line, going below the packed 6 is refused too.
    await expect(
      run(logistics, M.PackListItem_adjustQuantity, {
        docId: confirmed._id,
        version: confirmed.version,
        requiredQuantity: 4,
      }),
    ).rejects.toThrow(/below what's already packed/);
    expect(await item()).toMatchObject({
      packedQuantity: 6,
      requiredQuantity: 10,
    });

    // In the truck with no signal the packer marks the full 10 packed.
    const current = await item();
    const tap = enqueueAction(
      {
        runKey: "pack-mark-packed",
        label: "Mark packed",
        args: {
          docId: current._id,
          version: current.version,
          packedQuantity: 10,
        },
      },
      SCOPE,
    );
    // Not packed until the office has it.
    expect((await item()).status).not.toBe("packed");

    const markPacked = (args: Record<string, unknown>) =>
      run(logistics, M.PackListItem_markPacked, args);
    // The send lands but the answer is lost; the queue still holds the tap.
    await markPacked({ ...tap.args, idempotencyKey: tap.idempotencyKey });
    expect(loadQueue(SCOPE)).toHaveLength(1);
    const packed = await item();
    expect(packed).toMatchObject({ status: "packed", packedQuantity: 10 });

    // Reconnect: the same key replays the first answer - no second write,
    // no version conflict - and only then the queue clears.
    await drainQueue({ "pack-mark-packed": markPacked }, SCOPE);
    expect(loadQueue(SCOPE)).toHaveLength(0);
    const after = await item();
    expect(after.version).toBe(packed.version);
    expect(after).toMatchObject({ status: "packed", packedQuantity: 10 });
  });
});
