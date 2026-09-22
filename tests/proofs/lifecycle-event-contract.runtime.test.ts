/**
 * Runtime proof (AC-400): each Event lifecycle transition writes EXACTLY ONE
 * typed manifestEvents row carrying the event id, the tenant id, a runtime
 * createdAt, and the stable payload the command already emits. Defects
 * caught: zero or double rows per transition, a later step re-emitting an
 * earlier type, a payload losing ids/tenant/times/money, or a non-runtime
 * createdAt. The table has no actor column — none is asserted or invented.
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
): Promise<{ eventId: string; clientId: string }> {
  const { sales } = rolesFor(proof, tenantId);
  const client = (await proof.executeCommand(
    sales,
    M.Client_createViaRegister,
    {
      clientType: "company",
      companyName: `Lifecycle contract client ${tenantId} ${title}`,
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
      primaryContactName: "Casey Contract",
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

/** Same walker as the meanings proof: create is version 1, each public
 * lifecycle command takes the current version and bumps it by one. */
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

type LifecycleRow = {
  type: string;
  entity: string;
  entityId: string;
  payload: Record<string, unknown>;
  createdAt: number;
};

/** Ledger read: actor.run then a raw manifestEvents collect, filtered by the
 * typed event name and this entity's id — the accepted-revision-link shape. */
async function lifecycleRows(
  actor: Role,
  eventId: string,
  type: string,
): Promise<LifecycleRow[]> {
  const rows = (await actor.run(async (ctx) =>
    ctx.db.query("manifestEvents").collect(),
  )) as LifecycleRow[];
  return rows.filter((row) => row.type === type && row.entityId === eventId);
}

/** The typed-event contract every lifecycle row must satisfy. */
function assertContract(row: LifecycleRow, eventId: string, tenantId: string) {
  expect(row.entity).toBe("Event");
  expect(row.entityId).toBe(eventId);
  expect(row.payload.eventId).toBe(eventId);
  expect(row.payload.tenantId).toBe(tenantId);
  expect(row.createdAt).toEqual(expect.any(Number));
  expect(row.createdAt).toBeGreaterThan(0);
}

/** Exactly one row of `type` for this event, contract-valid, with each extra
 * payload field equal to the value that was passed in. */
async function expectExactlyOne(
  actor: Role,
  eventId: string,
  tenantId: string,
  type: string,
  extra: Record<string, unknown> = {},
): Promise<LifecycleRow> {
  const rows = await lifecycleRows(actor, eventId, type);
  expect(rows).toHaveLength(1);
  const row = rows[0];
  assertContract(row, eventId, tenantId);
  for (const [field, value] of Object.entries(extra)) {
    expect(row.payload[field]).toBe(value);
  }
  return row;
}

describe("runtime proof: Event lifecycle typed-event contract (AC-400)", () => {
  it("canonical ladder: each of the eight transitions writes exactly one typed row and later steps add no second copy", async () => {
    const proof = harness();
    const tenantId = "tenant-ac400-ladder";
    const { sales, events } = rolesFor(proof, tenantId);
    const { eventId, clientId } = await createEvent(
      proof,
      tenantId,
      "AC-400 ladder",
    );

    // Money fields are plain numbers; times and headcount the passed values.
    const E: Record<string, Record<string, unknown>> = {
      planned: {
        clientId,
        startsAt: S.startsAt,
        endsAt: S.endsAt,
        expectedHeadcount: HEAD_COUNT,
      },
      approved: {
        clientId,
        expectedHeadcount: HEAD_COUNT,
        startsAt: S.startsAt,
        endsAt: S.endsAt,
        quotedPrice: QUOTED,
      },
      locked: {
        clientId,
        expectedHeadcount: HEAD_COUNT,
        quotedPrice: QUOTED,
        startsAt: S.startsAt,
        endsAt: S.endsAt,
      },
      finalized: {
        clientId,
        expectedHeadcount: HEAD_COUNT,
        quotedPrice: QUOTED,
      },
      closedOut: {
        clientId,
        expectedHeadcount: HEAD_COUNT,
        quotedPrice: QUOTED,
        budgetAmount: BUDGET,
      },
      none: {},
    };
    // [role, command, emitted type, payload fields to assert]
    const steps: Array<readonly [Role, Cmd, string, Record<string, unknown>]> =
      [
        [
          events,
          M.Event_submitForApproval,
          "EventSubmittedForApproval",
          E.none,
        ],
        [events, M.Event_approve, "EventApproved", E.approved],
        [sales, M.Event_lockForSales, "EventSalesLocked", E.locked],
        [events, M.Event_beginExecution, "EventExecutionStarted", E.none],
        [events, M.Event_finalizeEvent, "EventFinalized", E.finalized],
        [events, M.Event_complete, "EventCompleted", E.none],
        [events, M.Event_closeOut, "EventClosedOut", E.closedOut],
      ];

    // Creation itself (version 1) already wrote the planned row.
    const asserted: Array<readonly [string, Record<string, unknown>]> = [
      ["EventPlanned", E.planned],
    ];
    let version = 1;
    for (const [role, cmd, type, extra] of steps) {
      await proof.executeCommand(role, cmd, { docId: eventId, version });
      version += 1;
      asserted.push([type, extra]);
      // Every type so far must still be exactly one for this event.
      for (const [t, x] of asserted) {
        await expectExactlyOne(events, eventId, tenantId, t, x);
      }
    }
  });

  it("confirmSalesLock writes one EventSalesLockConfirmed and never EventExecutionStarted for that event", async () => {
    const proof = harness();
    const tenantId = "tenant-ac400-confirm";
    const { sales, events } = rolesFor(proof, tenantId);
    const { eventId, clientId, version } = await walkToStage(
      proof,
      tenantId,
      "sales_lock",
      "AC-400 confirm lock",
    );

    await proof.executeCommand(sales, M.Event_confirmSalesLock, {
      docId: eventId,
      version,
    });

    await expectExactlyOne(
      events,
      eventId,
      tenantId,
      "EventSalesLockConfirmed",
      { clientId, startsAt: S.startsAt },
    );
    expect(
      await lifecycleRows(events, eventId, "EventExecutionStarted"),
    ).toHaveLength(0);
  });

  it("cancel writes one EventCancelled with the reason; a second cancel is refused and writes no second row", async () => {
    const proof = harness();
    const tenantId = "tenant-ac400-cancel";
    const { events } = rolesFor(proof, tenantId);
    const { eventId, clientId, version } = await walkToStage(
      proof,
      tenantId,
      "sales_lock",
      "AC-400 cancel",
    );

    const reason = "Client postponed the gala";
    await proof.executeCommand(events, M.Event_cancel, {
      docId: eventId,
      version,
      reason,
    });
    const row = await expectExactlyOne(
      events,
      eventId,
      tenantId,
      "EventCancelled",
      { reason },
    );
    expect(row.payload.clientId).toBe(clientId);

    await expect(
      proof.executeCommand(events, M.Event_cancel, {
        docId: eventId,
        version: version + 1,
        reason: "Second cancel must not write",
      }),
    ).rejects.toThrow(/Guard|Invalid state transition/);
    expect(await lifecycleRows(events, eventId, "EventCancelled")).toHaveLength(
      1,
    );
  });

  it("returnToPlanning from pending_approval writes one EventReturnedToPlanning with the reason and moves the stage to planning", async () => {
    const proof = harness();
    const tenantId = "tenant-ac400-return";
    const { events } = rolesFor(proof, tenantId);
    const { eventId, version } = await walkToStage(
      proof,
      tenantId,
      "pending_approval",
      "AC-400 return to planning",
    );

    const reason = "Budget came back below the locked quote";
    await proof.executeCommand(events, M.Event_returnToPlanning, {
      docId: eventId,
      version,
      reason,
    });

    await expectExactlyOne(
      events,
      eventId,
      tenantId,
      "EventReturnedToPlanning",
      { reason },
    );
    const row = (await events.run(async (ctx) =>
      ctx.db.get(eventId as never),
    )) as { stage: string };
    expect(row.stage).toBe("planning");
  });
});
