/**
 * Runtime proof: EventDish live-ops commands (addToEvent, adjustServings,
 * updateInstructions, changeCourse, setHeadcountOverride, remove) succeed on
 * sales_lock — live ops, not a menu freeze — while leaving Event price and
 * event headcount untouched; a cancelled Event still refuses addToEvent
 * (AC-399 sales_lock slice).
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
): Promise<string> {
  const { sales } = rolesFor(proof, tenantId);
  const client = (await proof.executeCommand(
    sales,
    M.Client_createViaRegister,
    {
      clientType: "company",
      companyName: `Sales-lock dish client ${tenantId} ${title}`,
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

/** Same walker as the sales_lock ops-edits proof: create is version 1, each
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

async function seedDish(proof: Proof, tenantId: string): Promise<string> {
  const { kitchen } = rolesFor(proof, tenantId);
  const dish = (await proof.executeCommand(kitchen, M.Dish_createViaIntroduce, {
    name: `Sales-lock dish proof plate ${tenantId}`,
    portionSize: 1,
    portionUnit: "portion",
  })) as { docId: string };
  return dish.docId;
}

async function readRow(actor: Role, docId: string) {
  return (await actor.run(async (ctx) => ctx.db.get(docId as never))) as Record<
    string,
    unknown
  > | null;
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

describe("runtime proof: EventDish live ops allowed on sales_lock", () => {
  it("add + adjust + notes + course + override succeed on sales_lock, price stays frozen", async () => {
    const proof = harness();
    const tenantId = "tenant-slock-eventdish-ok";
    const { events } = rolesFor(proof, tenantId);
    const { eventId } = await walkToStage(
      proof,
      tenantId,
      "sales_lock",
      "Dish ops on sales lock",
    );
    const dishId = await seedDish(proof, tenantId);

    const before = await readEvent(events, eventId);
    expect(before.stage).toBe("sales_lock");

    const add = (await proof.executeCommand(
      events,
      M.EventDish_createViaAddToEvent,
      { eventId, dishId, quantityServings: 40, course: "main" },
    )) as { docId: string };
    const docId = add.docId;

    await proof.executeCommand(events, M.EventDish_adjustServings, {
      docId,
      quantityServings: 36,
    });
    const afterAdjust = await readRow(events, docId);
    expect(afterAdjust?.quantityServings).toBe(36);

    await proof.executeCommand(events, M.EventDish_updateInstructions, {
      docId,
      specialInstructions: "Nut allergy — separate prep surface",
    });
    const afterNotes = await readRow(events, docId);
    expect(afterNotes?.specialInstructions).toBe(
      "Nut allergy — separate prep surface",
    );

    await proof.executeCommand(events, M.EventDish_changeCourse, {
      docId,
      course: "side",
    });
    const afterCourse = await readRow(events, docId);
    expect(afterCourse?.course).toBe("side");

    await proof.executeCommand(events, M.EventDish_setHeadcountOverride, {
      docId,
      headcountOverride: 30,
    });
    const afterOverride = await readRow(events, docId);
    expect(afterOverride?.quantityServings).toBe(30);

    const eventRow = await readEvent(events, eventId);
    expect(eventRow.stage).toBe("sales_lock");
    expect(eventRow.quotedPrice).toBe(4500);
    expect(eventRow.budgetAmount).toBe(3000);
    expect(eventRow.expectedHeadcount).toBe(40);
  });

  it("remove succeeds on sales_lock; a cancelled Event still refuses addToEvent", async () => {
    const proof = harness();
    const tenantId = "tenant-slock-eventdish-remove";
    const { events } = rolesFor(proof, tenantId);
    const { eventId } = await walkToStage(
      proof,
      tenantId,
      "sales_lock",
      "Dish removal on sales lock",
    );
    const dishId = await seedDish(proof, tenantId);
    const add = (await proof.executeCommand(
      events,
      M.EventDish_createViaAddToEvent,
      { eventId, dishId, quantityServings: 40, course: "main" },
    )) as { docId: string };

    await proof.executeCommand(events, M.EventDish_remove, {
      docId: add.docId,
      reason: "Client dropped the carving station",
    });
    const removed = await readRow(events, add.docId);
    expect(removed?.deletedAt).toEqual(expect.any(Number));
    expect(removed?.removedAt).toEqual(expect.any(Number));

    const cancelled = await walkToStage(
      proof,
      tenantId,
      "sales_lock",
      "Cancelled stays locked",
    );
    const cancelledDish = await seedDish(proof, tenantId);
    await proof.executeCommand(events, M.Event_cancel, {
      docId: cancelled.eventId,
      version: cancelled.version,
      reason: "Client postponed the event",
    });
    await expect(
      proof.executeCommand(events, M.EventDish_createViaAddToEvent, {
        eventId: cancelled.eventId,
        dishId: cancelledDish,
        quantityServings: 40,
        course: "main",
      }),
    ).rejects.toThrow(/Guard|Invalid state transition/);
    const cancelledRow = await readEvent(events, cancelled.eventId);
    expect(cancelledRow.stage).toBe("cancelled");
  });
});
