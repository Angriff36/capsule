/**
 * Runtime proof (AC-238): two Event updates that send the same `version` do
 * not silently overwrite each other. Two people editing the same Event must
 * not wipe each other's headcount: the first write wins, a stale `version` is
 * refused with the generated ConcurrencyConflict error, and the row keeps the
 * first write. A current `version` still edits, proving refusal is a version
 * conflict and not a stage freeze.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const S = {
  startsAt: Date.UTC(2026, 9, 18, 17, 0),
  endsAt: Date.UTC(2026, 9, 18, 22, 0),
} as const;
const M = api.mutations;

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
type Role = ReturnType<Proof["asRole"]>;

function rolesFor(proof: Proof, tenantId: string): { sales: Role } {
  return {
    sales: proof.asRole({
      subject: `sales-${tenantId}`,
      role: "sales_manager",
      tenantId,
    }),
  };
}

async function createEvent(
  proof: Proof,
  tenantId: string,
  title: string,
): Promise<string> {
  const { sales } = rolesFor(proof, tenantId);
  const client = (await proof.executeCommand(
    sales,
    M.Client_createViaRegister,
    {
      clientType: "company",
      companyName: `Version conflict client ${tenantId} ${title}`,
    },
  )) as { docId: string };
  const event = (await proof.executeCommand(
    sales,
    M.Event_createViaPlanEngagement,
    {
      clientId: client.docId,
      title,
      eventType: "corporate dinner",
      startsAt: S.startsAt,
      endsAt: S.endsAt,
      expectedHeadcount: 40,
      primaryContactName: "Casey VersionConflict",
      budgetAmount: 3000,
      quotedPrice: 4500,
    },
  )) as { docId: string };
  return event.docId;
}

async function readEvent(
  actor: Role,
  eventId: string,
): Promise<{
  stage: string;
  version: number;
  expectedHeadcount: number;
  quotedPrice: number;
  budgetAmount: number;
}> {
  return (await actor.run(async (ctx) => ctx.db.get(eventId as never))) as {
    stage: string;
    version: number;
    expectedHeadcount: number;
    quotedPrice: number;
    budgetAmount: number;
  };
}

describe("runtime proof: Event concurrent edits refuse a stale version", () => {
  it("stale version is refused and the first write stays", async () => {
    const proof = harness();
    const tenantId = "tenant-ac238-stale";
    const { sales } = rolesFor(proof, tenantId);
    const eventId = await createEvent(proof, tenantId, "Stale version refused");

    await proof.executeCommand(sales, M.Event_changeHeadcount, {
      docId: eventId,
      version: 1,
      newHeadcount: 48,
    });

    await expect(
      proof.executeCommand(sales, M.Event_changeHeadcount, {
        docId: eventId,
        version: 1,
        newHeadcount: 99,
      }),
    ).rejects.toThrow(/ConcurrencyConflict|VERSION_MISMATCH/);

    const row = await readEvent(sales, eventId);
    expect(row.stage).toBe("planning");
    expect(row.expectedHeadcount).toBe(48);
    expect(row.version).toBe(2);
    expect(row.quotedPrice).toBe(4500);
    expect(row.budgetAmount).toBe(3000);
  });

  it("current version still edits (conflict, not a freeze)", async () => {
    const proof = harness();
    const tenantId = "tenant-ac238-current";
    const { sales } = rolesFor(proof, tenantId);
    const eventId = await createEvent(proof, tenantId, "Current version edits");

    await proof.executeCommand(sales, M.Event_changeHeadcount, {
      docId: eventId,
      version: 1,
      newHeadcount: 48,
    });
    await proof.executeCommand(sales, M.Event_changeHeadcount, {
      docId: eventId,
      version: 2,
      newHeadcount: 55,
    });

    const row = await readEvent(sales, eventId);
    expect(row.stage).toBe("planning");
    expect(row.expectedHeadcount).toBe(55);
    expect(row.version).toBe(3);
    expect(row.quotedPrice).toBe(4500);
    expect(row.budgetAmount).toBe(3000);
  });
});
