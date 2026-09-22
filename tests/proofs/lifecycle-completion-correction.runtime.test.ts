/**
 * Runtime proof (AC-228): after Event.complete the commercial seed is frozen to
 * `Event.changePricing`, but an authorized `correctCommercial` with a non-empty
 * reason restates the amounts and writes one typed EventCommercialCorrected
 * ledger row — at completed and closed_out.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const S = {
  startsAt: Date.UTC(2026, 9, 22, 17, 0),
  endsAt: Date.UTC(2026, 9, 22, 22, 0),
  expectedHeadcount: 40,
  quotedPrice: 4500,
  budgetAmount: 3000,
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
): { sales: Role; events: Role; kitchen: Role } {
  const role = (subject: string, role: string) =>
    proof.asRole({ subject: `${subject}-${tenantId}`, role, tenantId });
  return {
    sales: role("sales", "sales_manager"),
    events: role("event-manager", "event_manager"),
    kitchen: role("kitchen", "kitchen_manager"),
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
      companyName: `Completion correction client ${tenantId} ${title}`,
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
      expectedHeadcount: S.expectedHeadcount,
      primaryContactName: "Casey Correction",
      budgetAmount: S.budgetAmount,
      quotedPrice: S.quotedPrice,
    },
  )) as { docId: string };
  return event.docId;
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

/** Same walker as the final-actuals proof: create is version 1, each public
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
  return { eventId, version };
}

type EventRow = {
  stage: string;
  version: number;
  quotedPrice: number;
  budgetAmount: number;
  expectedHeadcount: number;
};

async function readEvent(actor: Role, eventId: string): Promise<EventRow> {
  return (await actor.run((ctx) => ctx.db.get(eventId as never))) as EventRow;
}
type CorrectionRow = {
  type: string;
  entity: string;
  entityId: string;
  payload: Record<string, unknown>;
  createdAt: number;
};

/** Ledger read: raw manifestEvents collect, filtered to this typed event and
 * entity id — the accepted lifecycle-contract shape. */
async function correctionRows(
  actor: Role,
  eventId: string,
): Promise<CorrectionRow[]> {
  const rows = (await actor.run(async (ctx) =>
    ctx.db.query("manifestEvents").collect(),
  )) as CorrectionRow[];
  return rows.filter(
    (row) =>
      row.type === "EventCommercialCorrected" && row.entityId === eventId,
  );
}

describe("runtime proof: completion freezes changePricing, correction restates the seed (AC-228)", () => {
  it("correctCommercial updates the frozen seed after complete and writes one ledger row", async () => {
    const proof = harness();
    const tenantId = "tenant-ac228-correct";
    const { events } = rolesFor(proof, tenantId);
    const { eventId, version } = await walkToStage(
      proof,
      tenantId,
      "completed",
      "Correction after complete",
    );

    // changePricing refuses at completed and writes nothing.
    await expect(
      proof.executeCommand(events, M.Event_changePricing, {
        docId: eventId,
        version,
        budgetAmount: 1,
        quotedPrice: 2,
      }),
    ).rejects.toThrow(/Guard|Invalid state transition/);
    const frozen = await readEvent(events, eventId);
    expect(frozen.stage).toBe("completed");
    expect(frozen.quotedPrice).toBe(S.quotedPrice);
    expect(frozen.budgetAmount).toBe(S.budgetAmount);
    expect(frozen.version).toBe(version);

    await proof.executeCommand(events, M.Event_correctCommercial, {
      docId: eventId,
      version,
      reason: "Invoice total was restated",
      budgetAmount: 2800,
      quotedPrice: 5200,
    });

    const corrected = await readEvent(events, eventId);
    expect(corrected.stage).toBe("completed");
    expect(corrected.quotedPrice).toBe(5200);
    expect(corrected.budgetAmount).toBe(2800);
    expect(corrected.expectedHeadcount).toBe(S.expectedHeadcount);

    const rows = await correctionRows(events, eventId);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.entity).toBe("Event");
    expect(row.payload.eventId).toBe(eventId);
    expect(row.payload.tenantId).toBe(tenantId);
    expect(row.payload.reason).toBe("Invoice total was restated");
    expect(row.payload.budgetAmount).toBe(2800);
    expect(row.payload.quotedPrice).toBe(5200);
    expect(row.createdAt).toBeGreaterThan(0);
  });

  it("refuses an empty reason, a kitchen caller, and correctCommercial before complete", async () => {
    const proof = harness();
    const tenantId = "tenant-ac228-refuse";
    const { events, kitchen } = rolesFor(proof, tenantId);
    const { eventId, version } = await walkToStage(
      proof,
      tenantId,
      "completed",
      "Correction refusals",
    );

    await expect(
      proof.executeCommand(kitchen, M.Event_correctCommercial, {
        docId: eventId,
        version,
        reason: "Kitchen should not restate the seed",
        budgetAmount: 2800,
        quotedPrice: 5200,
      }),
    ).rejects.toThrow(/Event and sales staff may write events/);
    expect((await readEvent(kitchen, eventId)).quotedPrice).toBe(S.quotedPrice);

    await expect(
      proof.executeCommand(events, M.Event_correctCommercial, {
        docId: eventId,
        version,
        reason: "   ",
        budgetAmount: 2800,
        quotedPrice: 5200,
      }),
    ).rejects.toThrow(/Correction reason is required/);
    expect((await readEvent(events, eventId)).quotedPrice).toBe(S.quotedPrice);
    expect(await correctionRows(events, eventId)).toHaveLength(0);

    // A brand-new planning event: correction is refused, ordinary pricing works.
    const planningId = await createEvent(
      proof,
      tenantId,
      "Planning correction refused",
    );
    await expect(
      proof.executeCommand(events, M.Event_correctCommercial, {
        docId: planningId,
        version: 1,
        reason: "Not allowed in planning",
        budgetAmount: 2800,
        quotedPrice: 5200,
      }),
    ).rejects.toThrow(/Guard|Invalid state transition/);
    await proof.executeCommand(events, M.Event_changePricing, {
      docId: planningId,
      version: 1,
      budgetAmount: 2900,
      quotedPrice: 4100,
    });
    const planning = await readEvent(events, planningId);
    expect(planning.stage).toBe("planning");
    expect(planning.quotedPrice).toBe(4100);
    expect(planning.budgetAmount).toBe(2900);
  });

  it("correctCommercial still works after closeOut; changePricing stays refused", async () => {
    const proof = harness();
    const tenantId = "tenant-ac228-closed";
    const { events } = rolesFor(proof, tenantId);
    const { eventId, version } = await walkToStage(
      proof,
      tenantId,
      "closed_out",
      "Correction after closeout",
    );

    await expect(
      proof.executeCommand(events, M.Event_changePricing, {
        docId: eventId,
        version,
        budgetAmount: 1,
        quotedPrice: 2,
      }),
    ).rejects.toThrow(/Guard|Invalid state transition/);
    const frozen = await readEvent(events, eventId);
    expect(frozen.stage).toBe("closed_out");
    expect(frozen.quotedPrice).toBe(S.quotedPrice);
    expect(frozen.budgetAmount).toBe(S.budgetAmount);

    await proof.executeCommand(events, M.Event_correctCommercial, {
      docId: eventId,
      version,
      reason: "Closeout restated the seed",
      budgetAmount: 3100,
      quotedPrice: 4700,
    });

    const corrected = await readEvent(events, eventId);
    expect(corrected.stage).toBe("closed_out");
    expect(corrected.quotedPrice).toBe(4700);
    expect(corrected.budgetAmount).toBe(3100);

    const rows = await correctionRows(events, eventId);
    expect(rows).toHaveLength(1);
    expect(rows[0].payload.reason).toBe("Closeout restated the seed");
    expect(rows[0].payload.budgetAmount).toBe(3100);
    expect(rows[0].payload.quotedPrice).toBe(4700);
  });
});
