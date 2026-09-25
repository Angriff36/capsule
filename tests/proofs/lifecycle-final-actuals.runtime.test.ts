/**
 * Runtime proof: Event in `final` accepts actuals — guest check-in and
 * incident report — while refusing new speculative menu plans
 * (`EventDish_createViaAddToEvent`) and refusing `Event.closeOut`;
 * the exit is `Event.complete` to `completed` (AC-399 final slice).
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
      companyName: `Final actuals client ${tenantId} ${title}`,
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
      primaryContactName: "Casey Final",
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
] as const;
type LadderStage = (typeof LADDER)[number];

/** Same walker as the executing proof: create is version 1, each public
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
    name: `Final no-plan dish ${tenantId}`,
    portionSize: 1,
    portionUnit: "portion",
  })) as { docId: string };
  return dish.docId;
}

async function readRow<T extends Record<string, unknown>>(
  actor: Role,
  docId: string,
): Promise<T> {
  return (await actor.run(async (ctx) => ctx.db.get(docId as never))) as T;
}

describe("runtime proof: Event final accepts actuals, refuses speculative plans", () => {
  it("guest check-in and incident report succeed on final and leave commercial fields untouched", async () => {
    const proof = harness();
    const tenantId = "tenant-final-actuals-ok";
    const { events } = rolesFor(proof, tenantId);
    const { eventId } = await walkToStage(
      proof,
      tenantId,
      "final",
      "Actuals on final",
    );

    const guest = (await proof.executeCommand(
      events,
      M.EventGuest_createViaInvite,
      { eventId, name: "Riley Late Checkin" },
    )) as { docId: string };
    await proof.executeCommand(events, M.EventGuest_rsvpConfirm, {
      docId: guest.docId,
      version: 1,
    });
    await proof.executeCommand(events, M.EventGuest_checkIn, {
      docId: guest.docId,
      version: 2,
    });
    const guestRow = await readRow<{
      rsvpStatus: string;
      checkedInAt: number | null;
    }>(events, guest.docId);
    expect(guestRow.rsvpStatus).toBe("confirmed");
    expect(guestRow.checkedInAt).toBeGreaterThan(0);

    const incident = (await proof.executeCommand(
      events,
      M.Incident_createViaReport,
      {
        eventId,
        severity: "low",
        category: "service",
        description: "Chafing dish returned empty after last table",
      },
    )) as { docId: string };
    const incidentRow = await readRow<{
      status: string;
      eventId: string;
      reportedAt: number | null;
    }>(events, incident.docId);
    expect(incidentRow.status).toBe("open");
    expect(incidentRow.eventId).toBe(eventId);
    expect(incidentRow.reportedAt).toBeGreaterThan(0);

    const eventRow = await readRow<{
      stage: string;
      quotedPrice: number;
      budgetAmount: number;
      expectedHeadcount: number;
    }>(events, eventId);
    expect(eventRow.stage).toBe("final");
    expect(eventRow.quotedPrice).toBe(4500);
    expect(eventRow.budgetAmount).toBe(3000);
    expect(eventRow.expectedHeadcount).toBe(40);
  });

  it("addToEvent is refused on final (no speculative plans)", async () => {
    const proof = harness();
    const tenantId = "tenant-final-no-plan";
    const { events } = rolesFor(proof, tenantId);
    const { eventId, version } = await walkToStage(
      proof,
      tenantId,
      "final",
      "No speculative plans on final",
    );
    const dishId = await seedDish(proof, tenantId);

    await expect(
      proof.executeCommand(events, M.EventDish_createViaAddToEvent, {
        eventId,
        dishId,
        quantityServings: 40,
        course: "main",
      }),
    ).rejects.toThrow(/Guard|Invalid state transition/);

    const eventRow = await readRow<{ stage: string; version: number }>(
      events,
      eventId,
    );
    expect(eventRow.stage).toBe("final");
    expect(eventRow.version).toBe(version);
  });

  it("closeOut is refused on final; complete moves to completed", async () => {
    const proof = harness();
    const tenantId = "tenant-final-complete";
    const { events } = rolesFor(proof, tenantId);
    const { eventId, version } = await walkToStage(
      proof,
      tenantId,
      "final",
      "Complete on final",
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
  });
});
