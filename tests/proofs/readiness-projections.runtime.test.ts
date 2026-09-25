/**
 * Runtime proof (AC-401 first slice): Event readiness is a LIVE projection
 * served by convex/eventReadiness.ts — nine domains, every issue carrying a
 * code, affected ids, severity, reason, and resolving action. It is never
 * stored on the Event and never blocks a command.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const S = {
  startsAt: Date.UTC(2026, 9, 21, 17, 0),
  endsAt: Date.UTC(2026, 9, 21, 22, 0),
} as const;
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

function rolesFor(proof: Proof, tenantId: string) {
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
      companyName: `Readiness client ${tenantId} ${title}`,
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
      primaryContactName: "Casey Readiness",
      budgetAmount: 3000,
      quotedPrice: 4500,
    },
  )) as { docId: string };
  return event.docId;
}

type Readiness = {
  eventId: string;
  domains: Array<{
    domain: string;
    issues: Array<{
      code: string;
      affectedIds: string[];
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

describe("runtime proof: nine live Event readiness projections (AC-401 first slice)", () => {
  it("nine readiness projections return codes, ids, severity, resolving action", async () => {
    const proof = harness();
    const tenantId = "tenant-ac401-nine-domains";
    const { events, kitchen } = rolesFor(proof, tenantId);
    const eventId = await createEvent(
      proof,
      tenantId,
      "Nine live readiness domains",
    );

    const before = await readReadiness(events, eventId);
    expect(before).not.toBeNull();
    expect(before!.eventId).toBe(eventId);
    expect(before!.domains.map((domain) => domain.domain)).toEqual(
      NINE_DOMAINS,
    );
    for (const domain of before!.domains) {
      for (const issue of domain.issues) {
        expect(typeof issue.code).toBe("string");
        expect(issue.code.length).toBeGreaterThan(0);
        expect(Array.isArray(issue.affectedIds)).toBe(true);
        expect(["info", "warning", "blocking"]).toContain(issue.severity);
        expect(typeof issue.reason).toBe("string");
        expect(issue.reason.length).toBeGreaterThan(0);
        expect(typeof issue.resolvingAction).toBe("string");
        expect(issue.resolvingAction.length).toBeGreaterThan(0);
      }
    }

    const codes = codesOf(before!);
    expect(codes).toContain("kitchen.menu_empty");
    const menuIssue = before!.domains
      .find((domain) => domain.domain === "kitchen")!
      .issues.find((issue) => issue.code === "kitchen.menu_empty");
    expect(menuIssue).toMatchObject({
      code: "kitchen.menu_empty",
      affectedIds: [eventId],
      severity: "warning",
      resolvingAction: "EventDish.addToEvent",
    });
    const venueIssue = before!.domains
      .find((domain) => domain.domain === "planning")!
      .issues.find((issue) => issue.code === "planning.venue_missing");
    expect(venueIssue).toMatchObject({
      affectedIds: [eventId],
      severity: "info",
      resolvingAction: "Event.changeVenue",
    });
    const staffingIssue = before!.domains
      .find((domain) => domain.domain === "staffing")!
      .issues.find((issue) => issue.code === "staffing.assignment_missing");
    expect(staffingIssue).toMatchObject({
      affectedIds: [eventId],
      severity: "info",
      resolvingAction: "EventAssignment.assign",
    });
    expect(codes).not.toContain("commercial.quoted_price_missing");
    expect(codes.every((code) => !code.startsWith("closeout."))).toBe(true);

    // Adding one live menu dish clears kitchen.menu_empty at the next read.
    const dish = (await proof.executeCommand(
      kitchen,
      M.Dish_createViaIntroduce,
      {
        name: "Garden salad",
        portionSize: 1,
        portionUnit: "portion",
      },
    )) as { docId: string };
    await proof.executeCommand(events, M.EventDish_createViaAddToEvent, {
      eventId,
      dishId: dish.docId,
      quantityServings: 40,
      dishName: "Garden salad",
    });

    const after = await readReadiness(events, eventId);
    expect(after).not.toBeNull();
    expect(codesOf(after!)).not.toContain("kitchen.menu_empty");
    // Other live issues stay.
    expect(codesOf(after!)).toContain("planning.venue_missing");
    expect(codesOf(after!)).toContain("staffing.assignment_missing");
  });

  it("readiness stays live and is not stored on the Event", async () => {
    const proof = harness();
    const tenantId = "tenant-ac401-live-not-stored";
    const { events } = rolesFor(proof, tenantId);
    const eventId = await createEvent(
      proof,
      tenantId,
      "Readiness is never stored",
    );

    const before = await readReadiness(events, eventId);
    expect(before).not.toBeNull();
    expect(codesOf(before!)).toContain("planning.service_style_missing");

    const eventRow = (await events.run(async (ctx) =>
      ctx.db.get(eventId as never),
    )) as Record<string, unknown> | null;
    expect(eventRow).not.toBeNull();
    for (const field of [
      "readiness",
      "readinessJson",
      "readinessSummary",
      "readinessName",
    ])
      expect(eventRow).not.toHaveProperty(field);

    // An explicit service-style change clears the live issue on the next read.
    const style = (await proof.executeCommand(
      events,
      M.ServiceStyle_createViaRegister,
      {
        name: "Full Service",
        code: `FULL_SERVICE_${tenantId}`,
        sortOrder: 10,
      },
    )) as { docId: string };
    await proof.executeCommand(events, M.Event_changeServiceStyle, {
      docId: eventId,
      serviceStyleId: style.docId,
      serviceStyleName: "Full Service",
    });

    const after = await readReadiness(events, eventId);
    expect(after).not.toBeNull();
    expect(codesOf(after!)).not.toContain("planning.service_style_missing");
  });

  it("anonymous and other-tenant identities get null, never another tenant's readiness", async () => {
    const proof = harness();
    const tenantId = "tenant-ac401-isolated";
    const { events } = rolesFor(proof, tenantId);
    const eventId = await createEvent(proof, tenantId, "Isolated readiness");

    expect(
      await readReadiness(
        proof.asRole({
          subject: "stranger",
          role: "event_manager",
          tenantId: "tenant-someone-else",
        }),
        eventId,
      ),
    ).toBeNull();
    expect(
      await readReadiness(
        proof.asRole({
          subject: "anon",
          role: "anonymous",
          tenantId: "",
        }),
        eventId,
      ),
    ).toBeNull();

    const own = await readReadiness(events, eventId);
    expect(own).not.toBeNull();
    expect(own!.eventId).toBe(eventId);
  });
});
