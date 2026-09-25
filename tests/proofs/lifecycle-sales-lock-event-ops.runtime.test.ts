/**
 * Runtime proof: Event ops revise commands (reschedule / changeVenue /
 * changePrimaryContact / changeRequirements) succeed on sales_lock while the
 * customer price stays frozen and isEditable reads true; changePricing and
 * cancelled-event edits still refuse, and executing is not isEditable
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
  newStartsAt: Date.UTC(2026, 9, 19, 17, 0),
  newEndsAt: Date.UTC(2026, 9, 19, 22, 0),
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
      companyName: `Sales-lock event-ops client ${tenantId} ${title}`,
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

async function readEvent(
  actor: Role,
  eventId: string,
): Promise<{
  stage: string;
  version: number;
  quotedPrice: number;
  budgetAmount: number;
  isEditable: boolean;
  startsAt: number;
  endsAt: number;
  venueId: string | null;
  primaryContactName: string;
  serviceRequirements: string | null;
}> {
  // Computed fields (isEditable) exist only on the query read path, not
  // ctx.db.get (see event-estimated-food-cost proof).
  return (await actor.query(api.queries.getEvent, {
    id: eventId as never,
  })) as never;
}

describe("runtime proof: Event sales_lock ops revise commands", () => {
  it("ops revise commands succeed on sales_lock and leave price frozen", async () => {
    const proof = harness();
    const tenantId = "tenant-slock-eventops-ok";
    const { events } = rolesFor(proof, tenantId);
    const { eventId, version } = await walkToStage(
      proof,
      tenantId,
      "sales_lock",
      "Ops edits on sales lock",
    );
    expect(version).toBe(4);

    const venue = (await proof.executeCommand(
      events,
      M.Venue_createViaRegister,
      {
        name: "Sales lock hall",
        venueType: "other" as const,
        capacity: 80,
      },
    )) as { docId: string };

    await proof.executeCommand(events, M.Event_reschedule, {
      docId: eventId,
      version,
      startsAt: S.newStartsAt,
      endsAt: S.newEndsAt,
    });
    await proof.executeCommand(events, M.Event_changeVenue, {
      docId: eventId,
      version: version + 1,
      venueId: venue.docId,
    });
    await proof.executeCommand(events, M.Event_changePrimaryContact, {
      docId: eventId,
      version: version + 2,
      primaryContactName: "Pat Ops",
      primaryContactEmail: "pat@example.com",
    });
    await proof.executeCommand(events, M.Event_changeRequirements, {
      docId: eventId,
      version: version + 3,
      serviceRequirements: "Buffet, no raw onion",
    });

    const row = await readEvent(events, eventId);
    expect(row.stage).toBe("sales_lock");
    expect(row.quotedPrice).toBe(4500);
    expect(row.budgetAmount).toBe(3000);
    expect(row.isEditable).toBe(true);
    expect(row.startsAt).toBe(S.newStartsAt);
    expect(row.endsAt).toBe(S.newEndsAt);
    expect(row.venueId).toBe(venue.docId);
    expect(row.primaryContactName).toBe("Pat Ops");
    expect(row.serviceRequirements).toBe("Buffet, no raw onion");
    expect(row.version).toBe(version + 4);
  });

  it("changePricing and cancelled still refuse; executing is not isEditable", async () => {
    const proof = harness();

    // changePricing stays refused on sales_lock with zero writes.
    const pricingTenant = "tenant-slock-eventops-pricing";
    const pricing = rolesFor(proof, pricingTenant);
    const locked = await walkToStage(
      proof,
      pricingTenant,
      "sales_lock",
      "Pricing still refused",
    );
    await expect(
      proof.executeCommand(pricing.events, M.Event_changePricing, {
        docId: locked.eventId,
        version: locked.version,
        budgetAmount: 1,
        quotedPrice: 2,
      }),
    ).rejects.toThrow(/Guard|Invalid state transition/);
    const afterPricing = await readEvent(pricing.events, locked.eventId);
    expect(afterPricing.quotedPrice).toBe(4500);
    expect(afterPricing.version).toBe(locked.version);

    // A cancelled event refuses further ops edits.
    const cancelTenant = "tenant-slock-eventops-cancel";
    const cancelling = rolesFor(proof, cancelTenant);
    const toCancel = await walkToStage(
      proof,
      cancelTenant,
      "sales_lock",
      "Cancelled refuses ops edits",
    );
    await proof.executeCommand(cancelling.events, M.Event_cancel, {
      docId: toCancel.eventId,
      version: toCancel.version,
      reason: "Client cancelled",
    });
    await expect(
      proof.executeCommand(cancelling.events, M.Event_reschedule, {
        docId: toCancel.eventId,
        version: toCancel.version + 1,
        startsAt: S.newStartsAt,
        endsAt: S.newEndsAt,
      }),
    ).rejects.toThrow(/Guard|Invalid state transition/);
    const cancelledRow = await readEvent(cancelling.events, toCancel.eventId);
    expect(cancelledRow.stage).toBe("cancelled");

    // Executing is still not an editable stage.
    const execTenant = "tenant-slock-eventops-executing";
    const executing = rolesFor(proof, execTenant);
    const toExecute = await walkToStage(
      proof,
      execTenant,
      "sales_lock",
      "Executing not editable",
    );
    await proof.executeCommand(executing.events, M.Event_beginExecution, {
      docId: toExecute.eventId,
      version: toExecute.version,
    });
    const execRow = await readEvent(executing.events, toExecute.eventId);
    expect(execRow.stage).toBe("executing");
    expect(execRow.isEditable).toBe(false);
  });
});
