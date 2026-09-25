/**
 * Runtime proof: Event.returnToPlanning matches the transition table —
 * quote→planning and pending_approval→planning succeed, approved/planning/
 * sales_lock are refused with zero writes (guard must equal the table, same
 * class as #384).
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
      companyName: `Return-to-planning client ${tenantId} ${title}`,
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
      primaryContactName: "Casey Return",
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

/** Same walker as the meanings proof: create is version 1, each public
 * lifecycle command takes the current version and bumps it by one. */
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
  cancellationReason: string | null;
}> {
  return (await actor.run(async (ctx) => ctx.db.get(eventId as never))) as {
    stage: string;
    version: number;
    cancellationReason: string | null;
  };
}

describe("runtime proof: Event returnToPlanning matches the transition table", () => {
  it("quote → planning succeeds and leaves cancellationReason untouched", async () => {
    const proof = harness();
    const tenantId = "tenant-rtp-quote";
    const { events } = rolesFor(proof, tenantId);
    const eventId = await createEvent(proof, tenantId, "Return from quote");
    // No public command creates a quote-stage event; place it on the
    // stage directly and change nothing else.
    await events.run(async (ctx) =>
      ctx.db.patch(eventId as never, { stage: "quote" }),
    );

    await proof.executeCommand(events, M.Event_returnToPlanning, {
      docId: eventId,
      version: 1,
      reason: "Client reopened the plan from the quote",
    });

    const row = await readEvent(events, eventId);
    expect(row.stage).toBe("planning");
    expect(row.cancellationReason == null).toBe(true);
  });

  it("pending_approval → planning succeeds (AC-400 regression)", async () => {
    const proof = harness();
    const tenantId = "tenant-rtp-pending";
    const { events } = rolesFor(proof, tenantId);
    const { eventId, version } = await walkToStage(
      proof,
      tenantId,
      "pending_approval",
      "Return from pending approval",
    );

    await proof.executeCommand(events, M.Event_returnToPlanning, {
      docId: eventId,
      version,
      reason: "Headcount changed before approval",
    });

    const row = await readEvent(events, eventId);
    expect(row.stage).toBe("planning");
  });

  it("approved is refused with zero writes", async () => {
    const proof = harness();
    const tenantId = "tenant-rtp-approved";
    const { events } = rolesFor(proof, tenantId);
    const { eventId, version } = await walkToStage(
      proof,
      tenantId,
      "approved",
      "Refuse return from approved",
    );

    await expect(
      proof.executeCommand(events, M.Event_returnToPlanning, {
        docId: eventId,
        version,
        reason: "Approved must not regress",
      }),
    ).rejects.toThrow(/Guard|Invalid state transition/);

    const row = await readEvent(events, eventId);
    expect(row.stage).toBe("approved");
    expect(row.version).toBe(version);
  });

  it("planning is refused with zero writes", async () => {
    const proof = harness();
    const tenantId = "tenant-rtp-planning";
    const { events } = rolesFor(proof, tenantId);
    const eventId = await createEvent(
      proof,
      tenantId,
      "Refuse return from planning",
    );
    // A freshly created event sits on planning at version 1; no walk needed.

    await expect(
      proof.executeCommand(events, M.Event_returnToPlanning, {
        docId: eventId,
        version: 1,
        reason: "Planning must not return to itself",
      }),
    ).rejects.toThrow(/Guard|Invalid state transition/);

    const row = await readEvent(events, eventId);
    expect(row.stage).toBe("planning");
    expect(row.version).toBe(1);
  });

  it("sales_lock is refused with zero writes", async () => {
    const proof = harness();
    const tenantId = "tenant-rtp-sales-lock";
    const { events } = rolesFor(proof, tenantId);
    const { eventId, version } = await walkToStage(
      proof,
      tenantId,
      "sales_lock",
      "Refuse return from sales lock",
    );

    await expect(
      proof.executeCommand(events, M.Event_returnToPlanning, {
        docId: eventId,
        version,
        reason: "Locked must not regress",
      }),
    ).rejects.toThrow(/Guard|Invalid state transition/);

    const row = await readEvent(events, eventId);
    expect(row.stage).toBe("sales_lock");
    expect(row.version).toBe(version);
  });
});
