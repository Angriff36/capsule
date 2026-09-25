/**
 * Runtime proof: the remaining sales_lock ops holes — Event assignOwner,
 * Event normalizePurchasingWeek, and EventDish confirmFromProposal succeed on
 * sales_lock while the customer price stays frozen; cancelled and final still
 * refuse all three (AC-399 sales_lock slice).
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
): { sales: Role; events: Role; kitchen: Role; owner: Role } {
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
    owner: proof.asRole({
      subject: `owner-${tenantId}`,
      role: "owner",
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
      companyName: `Sales-lock remaining-ops client ${tenantId} ${title}`,
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

/** Create is version 1; each public lifecycle command bumps version by one. */
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

async function hireStaff(proof: Proof, tenantId: string): Promise<string> {
  const { owner } = rolesFor(proof, tenantId);
  const person = (await proof.executeCommand(owner, M.Person_createViaHire, {
    givenName: "Pat",
    familyName: "RemainingOps",
    email: `pat-${tenantId}@proof.example`,
    role: "staff",
    employmentType: "full_time",
  })) as { docId: string };
  return person.docId;
}

async function seedDish(proof: Proof, tenantId: string): Promise<string> {
  const { kitchen } = rolesFor(proof, tenantId);
  const dish = (await proof.executeCommand(kitchen, M.Dish_createViaIntroduce, {
    name: `Sales-lock remaining-ops plate ${tenantId}`,
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

describe("runtime proof: remaining ops commands allowed on sales_lock", () => {
  it("assignOwner, normalizePurchasingWeek, and confirmFromProposal succeed on sales_lock; price stays frozen", async () => {
    const proof = harness();
    const tenantId = "tenant-slock-remops-ok";
    const { sales, events } = rolesFor(proof, tenantId);
    const { eventId, version } = await walkToStage(
      proof,
      tenantId,
      "sales_lock",
      "Remaining ops on sales lock",
    );
    expect(version).toBe(4);

    const personId = await hireStaff(proof, tenantId);
    await proof.executeCommand(events, M.Event_assignOwner, {
      docId: eventId,
      version: 4,
      assignedToId: personId,
    });
    const owned = (await readRow(events, eventId)) as Record<string, unknown>;
    expect(owned.assignedToId).toBe(personId);
    expect(owned.stage).toBe("sales_lock");

    await events.run(async (ctx) =>
      ctx.db.patch(eventId as never, { purchasingWeekStart: 0 }),
    );
    await proof.executeCommand(events, M.Event_normalizePurchasingWeek, {
      docId: eventId,
      version: 5,
    });
    const repaired = (await readRow(events, eventId)) as Record<
      string,
      unknown
    >;
    expect(repaired.purchasingWeekStart).toEqual(expect.any(Number));
    expect(repaired.purchasingWeekStart).not.toBe(0);

    const dishId = await seedDish(proof, tenantId);
    const add = (await proof.executeCommand(
      events,
      M.EventDish_createViaAddToEvent,
      { eventId, dishId, quantityServings: 40, course: "main" },
    )) as { docId: string };
    await proof.executeCommand(sales, M.EventDish_confirmFromProposal, {
      docId: add.docId,
      eventId,
      dishId,
      quantityServings: 40,
      course: "main",
    });
    expect((await readRow(events, add.docId))?.quantityServings).toBe(40);

    const eventRow = (await readRow(events, eventId)) as Record<
      string,
      unknown
    >;
    expect(eventRow.stage).toBe("sales_lock");
    expect(eventRow.quotedPrice).toBe(4500);
    expect(eventRow.budgetAmount).toBe(3000);
    expect(eventRow.expectedHeadcount).toBe(40);
  });

  it("cancelled and final still refuse these commands", async () => {
    const proof = harness();

    // A cancelled event refuses assignOwner; the owner stays unset.
    const cancelTenant = "tenant-slock-remops-cancel";
    const cancelling = rolesFor(proof, cancelTenant);
    const toCancel = await walkToStage(
      proof,
      cancelTenant,
      "sales_lock",
      "Cancelled refuses owner",
    );
    await proof.executeCommand(cancelling.events, M.Event_cancel, {
      docId: toCancel.eventId,
      version: toCancel.version,
      reason: "Client cancelled",
    });
    await expect(
      proof.executeCommand(cancelling.events, M.Event_assignOwner, {
        docId: toCancel.eventId,
        version: toCancel.version + 1,
      }),
    ).rejects.toThrow(/Guard|Invalid state transition/);
    const cancelledRow = (await readRow(
      cancelling.events,
      toCancel.eventId,
    )) as Record<string, unknown>;
    expect(cancelledRow.stage).toBe("cancelled");
    expect(cancelledRow.assignedToId ?? null).toBeNull();

    // A finalized event refuses normalizePurchasingWeek.
    const finalTenant = "tenant-slock-remops-final";
    const finalizing = rolesFor(proof, finalTenant);
    const toFinal = await walkToStage(
      proof,
      finalTenant,
      "sales_lock",
      "Final refuses week repair",
    );
    await proof.executeCommand(finalizing.events, M.Event_beginExecution, {
      docId: toFinal.eventId,
      version: toFinal.version,
    });
    await proof.executeCommand(finalizing.events, M.Event_finalizeEvent, {
      docId: toFinal.eventId,
      version: toFinal.version + 1,
    });
    await expect(
      proof.executeCommand(finalizing.events, M.Event_normalizePurchasingWeek, {
        docId: toFinal.eventId,
        version: toFinal.version + 2,
      }),
    ).rejects.toThrow(/Guard|Invalid state transition/);
    const finalRow = (await readRow(
      finalizing.events,
      toFinal.eventId,
    )) as Record<string, unknown>;
    expect(finalRow.stage).toBe("final");

    // A cancelled event refuses confirmFromProposal on an added dish line.
    const dishTenant = "tenant-slock-remops-dish";
    const dishRoles = rolesFor(proof, dishTenant);
    const dishEvent = await walkToStage(
      proof,
      dishTenant,
      "sales_lock",
      "Cancelled refuses confirm",
    );
    const dishId = await seedDish(proof, dishTenant);
    const add = (await proof.executeCommand(
      dishRoles.events,
      M.EventDish_createViaAddToEvent,
      {
        eventId: dishEvent.eventId,
        dishId,
        quantityServings: 40,
        course: "main",
      },
    )) as { docId: string };
    await proof.executeCommand(dishRoles.events, M.Event_cancel, {
      docId: dishEvent.eventId,
      version: dishEvent.version,
      reason: "Client cancelled",
    });
    await expect(
      proof.executeCommand(dishRoles.sales, M.EventDish_confirmFromProposal, {
        docId: add.docId,
        eventId: dishEvent.eventId,
        dishId,
        quantityServings: 40,
        course: "main",
      }),
    ).rejects.toThrow(/Guard|Invalid state transition/);
  });
});
