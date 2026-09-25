/**
 * Runtime proof: Event.changeHeadcount succeeds on sales_lock (the UI already
 * offers it via EventLifecyclePolicy) and touches nothing but the headcount;
 * Event.changePricing stays refused on sales_lock with zero writes (AC-399
 * sales_lock slice).
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
type Cmd = Parameters<Proof["executeCommand"]>[1];

function rolesFor(
  proof: Proof,
  tenantId: string,
): { sales: Role; events: Role } {
  return {
    sales: proof.asRole({
      subject: `sales-${tenantId}`,
      role: "sales_manager",
      tenantId,
    }),
    events: proof.asRole({
      subject: `event-manager-${tenantId}`,
      role: "event_manager",
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
      companyName: `Sales-lock ops client ${tenantId} ${title}`,
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
      primaryContactName: "Casey SalesLock",
      budgetAmount: 3000,
      quotedPrice: 4500,
    },
  )) as { docId: string };
  return event.docId;
}

const LADDER = [
  "planning",
  "pending_approval",
  "approved",
  "sales_lock",
] as const;
type LadderStage = (typeof LADDER)[number];

/** Same walker as the return-to-planning proof: create is version 1, each
 * public lifecycle command takes the current version and bumps it by one. */
async function walkToStage(
  proof: Proof,
  tenantId: string,
  target: LadderStage,
  title: string,
): Promise<{ eventId: string; version: number }> {
  const { sales, events } = rolesFor(proof, tenantId);
  const eventId = await createEvent(proof, tenantId, title);
  const plan: Array<readonly [Role, Cmd]> = [
    [events, M.Event_submitForApproval],
    [events, M.Event_approve],
    [sales, M.Event_lockForSales],
  ];
  let version = 1;
  for (const [i, [role, cmd]] of plan.entries()) {
    if (LADDER.indexOf(target) < i + 1) break;
    await proof.executeCommand(role, cmd, { docId: eventId, version });
    version = i + 2;
  }
  return { eventId, version };
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

describe("runtime proof: Event sales_lock keeps price frozen but allows ops headcount", () => {
  it("changeHeadcount succeeds on sales_lock and does not touch price", async () => {
    const proof = harness();
    const tenantId = "tenant-slock-headcount-ok";
    const { events } = rolesFor(proof, tenantId);
    const { eventId, version } = await walkToStage(
      proof,
      tenantId,
      "sales_lock",
      "Headcount on sales lock",
    );

    const before = await readEvent(events, eventId);
    expect(before.stage).toBe("sales_lock");

    await proof.executeCommand(events, M.Event_changeHeadcount, {
      docId: eventId,
      version,
      newHeadcount: 48,
    });

    const row = await readEvent(events, eventId);
    expect(row.stage).toBe("sales_lock");
    expect(row.expectedHeadcount).toBe(48);
    expect(row.quotedPrice).toBe(4500);
    expect(row.budgetAmount).toBe(3000);
    expect(row.version).toBe(version + 1);
  });

  it("changePricing is refused on sales_lock with zero writes", async () => {
    const proof = harness();
    const tenantId = "tenant-slock-headcount-pricing";
    const { events } = rolesFor(proof, tenantId);
    const { eventId, version } = await walkToStage(
      proof,
      tenantId,
      "sales_lock",
      "Pricing refused on sales lock",
    );

    await expect(
      proof.executeCommand(events, M.Event_changePricing, {
        docId: eventId,
        version,
        budgetAmount: 1,
        quotedPrice: 2,
      }),
    ).rejects.toThrow(/Guard|Invalid state transition/);

    const row = await readEvent(events, eventId);
    expect(row.stage).toBe("sales_lock");
    expect(row.version).toBe(version);
    expect(row.quotedPrice).toBe(4500);
    expect(row.budgetAmount).toBe(3000);
    expect(row.expectedHeadcount).toBe(40);
  });
});
