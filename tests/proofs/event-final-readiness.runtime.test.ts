/**
 * Runtime proof (AC-612): `final` means service finished (§4.2), not Ops
 * Final. finalizeEvent needs no packet and no Ops Final review, while the
 * live readiness projection keeps reporting the open gaps afterwards —
 * Ops Final is packet readiness, never a lifecycle stage.
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
const HEAD_COUNT = 40;
const QUOTED = 4500;
const BUDGET = 3000;
const M = api.mutations;
const NINE_DOMAINS = [
  "commercial",
  "planning",
  "kitchen",
  "purchasing",
  "staffing",
  "packing",
  "packet",
  "execution",
  "closeout",
];

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
): { sales: Role; events: Role; kitchen: Role } {
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
    kitchen: proof.asRole({
      subject: `kitchen-${tenantId}`,
      role: "kitchen_manager",
      tenantId,
    }),
  };
}

async function createEvent(
  proof: Proof,
  tenantId: string,
  title: string,
): Promise<{ eventId: string; clientId: string }> {
  const { sales } = rolesFor(proof, tenantId);
  const client = (await proof.executeCommand(
    sales,
    M.Client_createViaRegister,
    {
      clientType: "company",
      companyName: `Final meaning client ${tenantId} ${title}`,
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
      expectedHeadcount: HEAD_COUNT,
      primaryContactName: "Casey Final Meaning",
      budgetAmount: BUDGET,
      quotedPrice: QUOTED,
    },
  )) as { docId: string };
  return { eventId: event.docId, clientId: client.docId };
}

const LADDER = [
  "planning",
  "pending_approval",
  "approved",
  "sales_lock",
  "executing",
  "final",
  "completed",
  "closed_out",
] as const;
type LadderStage = (typeof LADDER)[number];

/** Same walker as the lifecycle contract proof: create is version 1, each
 * public lifecycle command takes the current version and bumps it by one. */
async function walkToStage(
  proof: Proof,
  tenantId: string,
  target: LadderStage,
  title: string,
): Promise<{ eventId: string; clientId: string; version: number }> {
  const { sales, events } = rolesFor(proof, tenantId);
  const { eventId, clientId } = await createEvent(proof, tenantId, title);
  const plan: Array<readonly [Role, Cmd]> = [
    [events, M.Event_submitForApproval],
    [events, M.Event_approve],
    [sales, M.Event_lockForSales],
    [events, M.Event_beginExecution],
    [events, M.Event_finalizeEvent],
    [events, M.Event_complete],
    [events, M.Event_closeOut],
  ];
  let version = 1;
  for (const [i, [role, cmd]] of plan.entries()) {
    if (LADDER.indexOf(target) < i + 1) break;
    await proof.executeCommand(role, cmd, { docId: eventId, version });
    version = i + 2;
  }
  return { eventId, clientId, version };
}

type Readiness = {
  eventId: string;
  domains: Array<{
    domain: string;
    issues: Array<{
      code: string;
      severity: string;
      reason: string;
      resolvingAction: string;
    }>;
  }>;
} | null;

async function readReadiness(actor: Role, eventId: string): Promise<Readiness> {
  return (await actor.query(api.eventReadiness.getEventReadiness, {
    eventId,
  })) as Readiness;
}

function codesOf(projection: NonNullable<Readiness>): string[] {
  return projection.domains.flatMap((domain) =>
    domain.issues.map((issue) => issue.code),
  );
}

function issueOf(
  projection: NonNullable<Readiness>,
  domain: string,
  code: string,
) {
  return projection.domains
    .find((d) => d.domain === domain)!
    .issues.find((issue) => issue.code === code);
}

async function readRow<T extends Record<string, unknown>>(
  actor: Role,
  docId: string,
): Promise<T> {
  return (await actor.run(async (ctx) => ctx.db.get(docId as never))) as T;
}

async function countLedgerRows(
  actor: Role,
  eventId: string,
  type: string,
): Promise<number> {
  const rows = (await actor.run(async (ctx) =>
    ctx.db.query("manifestEvents").collect(),
  )) as Array<{ type: string; entityId: string }>;
  return rows.filter((row) => row.type === type && row.entityId === eventId)
    .length;
}

describe("runtime proof: finalize means service finished, not Ops Final (AC-612)", () => {
  it("finalizeEvent means service finished, not Ops Final", async () => {
    const proof = harness();
    const tenantId = "tenant-ac612-final-meaning";
    const { events, kitchen } = rolesFor(proof, tenantId);
    const { eventId } = await walkToStage(
      proof,
      tenantId,
      "executing",
      "Final means service finished",
    );

    // Created via planEngagement with no venue and no menu — the gaps live.
    const before = await readReadiness(events, eventId);
    expect(before).not.toBeNull();
    expect(before!.domains.map((domain) => domain.domain)).toEqual(
      NINE_DOMAINS,
    );
    const venueIssue = issueOf(before!, "planning", "planning.venue_missing");
    expect(venueIssue).toMatchObject({ severity: "info" });
    const menuIssue = issueOf(before!, "kitchen", "kitchen.menu_empty");
    expect(menuIssue).toMatchObject({ severity: "warning" });

    // Kitchen lacks eventManageAccess; the role guard refuses finalize.
    await expect(
      proof.executeCommand(kitchen, M.Event_finalizeEvent, {
        docId: eventId,
        version: 5,
      }),
    ).rejects.toThrow(/Guard|Event and sales staff/);
    const afterKitchen = await readRow<{ stage: string }>(events, eventId);
    expect(afterKitchen.stage).toBe("executing");

    await proof.executeCommand(events, M.Event_finalizeEvent, {
      docId: eventId,
      version: 5,
    });
    const row = await readRow<{
      stage: string;
      finalizedAt: number | null;
      quotedPrice: number;
      budgetAmount: number;
      expectedHeadcount: number;
    }>(events, eventId);
    expect(row.stage).toBe("final");
    expect(typeof row.finalizedAt).toBe("number");
    expect(row.finalizedAt as number).toBeGreaterThan(0);
    expect(row.quotedPrice).toBe(4500);
    expect(row.budgetAmount).toBe(3000);
    expect(row.expectedHeadcount).toBe(40);

    // Finalize did not claim Ops Final: the gaps are STILL live, packet
    // domain still present among the nine.
    const after = await readReadiness(events, eventId);
    expect(after).not.toBeNull();
    expect(after!.domains.map((domain) => domain.domain)).toEqual(NINE_DOMAINS);
    expect(codesOf(after!)).toContain("planning.venue_missing");
    expect(codesOf(after!)).toContain("kitchen.menu_empty");
    expect(row.stage).not.toBe("completed");
    expect(row.stage).not.toBe("closed_out");
  });

  it("complete and closeOut stay distinct from finalize", async () => {
    const proof = harness();
    const tenantId = "tenant-ac612-final-distinct";
    const { events } = rolesFor(proof, tenantId);
    const { eventId, version } = await walkToStage(
      proof,
      tenantId,
      "final",
      "Complete distinct from finalize",
    );

    await expect(
      proof.executeCommand(events, M.Event_closeOut, {
        docId: eventId,
        version,
      }),
    ).rejects.toThrow(/Guard|Invalid state transition/);
    const refused = await readRow<{ stage: string; version: number }>(
      events,
      eventId,
    );
    expect(refused.stage).toBe("final");
    expect(refused.version).toBe(version);

    await proof.executeCommand(events, M.Event_complete, {
      docId: eventId,
      version,
    });
    const completed = await readRow<{ stage: string }>(events, eventId);
    expect(completed.stage).toBe("completed");

    expect(await countLedgerRows(events, eventId, "EventFinalized")).toBe(1);
    expect(await countLedgerRows(events, eventId, "EventCompleted")).toBe(1);
  });

  it("missing venue and empty packet do not block finalize", async () => {
    const proof = harness();
    const tenantId = "tenant-ac612-no-packet-finalize";
    const { events } = rolesFor(proof, tenantId);
    const { eventId } = await walkToStage(
      proof,
      tenantId,
      "executing",
      "No packet still finalizes",
    );

    await proof.executeCommand(events, M.Event_finalizeEvent, {
      docId: eventId,
      version: 5,
    });
    const row = await readRow<{ stage: string }>(events, eventId);
    expect(row.stage).toBe("final");

    const readiness = await readReadiness(events, eventId);
    expect(readiness).not.toBeNull();
    expect(codesOf(readiness!)).toContain("planning.venue_missing");
  });
});
