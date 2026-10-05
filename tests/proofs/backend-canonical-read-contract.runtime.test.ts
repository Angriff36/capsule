/**
 * Runtime proof (AC-637, spec BE-18.1): the event page assembles every domain
 * from reads that share one id space and one readiness vocabulary, and the
 * fast authored readiness read gives the same tenant, soft-delete and
 * read-rule result as each domain's own generated list read.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { EVENT_READINESS_DOMAINS } from "../../convex/lib/eventReadinessProjection";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const M = api.mutations;

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

function harness() {
  return createManifestTestContext({
    convexTest: convexTest as never,
    schema,
    modules,
  });
}

type Proof = ReturnType<typeof harness>;
type Role = ReturnType<Proof["asRole"]>;
type Readiness = {
  eventId: string;
  domains: Array<{
    domain: string;
    issues: Array<{ code: string; affectedIds: string[] }>;
  }>;
} | null;

/** Each part the spec says the event page must assemble, the readiness
 * domain it reports under, and the reads the event screens use for it
 * (as written in docs/systems/ui-contract.md, built from the code). */
const EVENT_PAGE_PARTS: Array<{
  part: string;
  domain: (typeof EVENT_READINESS_DOMAINS)[number];
  reads: string[];
}> = [
  {
    part: "core Event and lifecycle",
    domain: "planning",
    reads: ["queries.getEvent", "eventReadiness.getEventReadiness"],
  },
  {
    part: "client, contact and accepted proposal",
    domain: "commercial",
    reads: [
      "queries.listClient",
      "queries.listClientContact",
      "queries.getProposal",
    ],
  },
  {
    part: "menu servings and costs",
    domain: "kitchen",
    reads: ["queries.listEventDish"],
  },
  {
    part: "demand, stock, shortages and purchasing",
    domain: "purchasing",
    reads: ["queries.listIngredientDemand"],
  },
  {
    part: "prep tasks, batches and quality",
    domain: "kitchen",
    reads: [
      "queries.listPrepTask",
      "queries.listProductionBatch",
      "queries.listQualityCheck",
    ],
  },
  {
    part: "staffing needs, assignments and shifts",
    domain: "staffing",
    reads: [
      "queries.listEventStaffNeedByEventId",
      "queries.listEventAssignmentByEventId",
      "queries.listShiftByEventId",
    ],
  },
  {
    part: "pack list, equipment, vehicle, delivery and return",
    domain: "packing",
    reads: [
      "queries.listPackList",
      "queries.listPackListItem",
      "queries.listEquipmentReservation",
      "queries.listEventVehicleAssignment",
      "queries.listDelivery",
    ],
  },
  {
    part: "packet readiness and revision",
    domain: "packet",
    reads: ["lib.eventPacket.commands.getPacket"],
  },
  {
    part: "invoice, payment and closeout",
    domain: "closeout",
    reads: [
      "queries.listInvoice",
      "queries.listPayment",
      "queries.listEventCloseout",
      "closeoutSources.eventCloseoutSources",
    ],
  },
];

async function seedEventWithPrep(proof: Proof, tenantId: string) {
  const sales = proof.asRole({
    subject: `sales-${tenantId}`,
    role: "sales_manager",
    tenantId,
  });
  const events = proof.asRole({
    subject: `events-${tenantId}`,
    role: "event_manager",
    tenantId,
  });
  const kitchen = proof.asRole({
    subject: `kitchen-${tenantId}`,
    role: "kitchen_manager",
    tenantId,
  });
  const client = (await proof.executeCommand(
    sales,
    M.Client_createViaRegister,
    {
      clientType: "company",
      companyName: `Read contract ${tenantId}`,
    },
  )) as { docId: string };
  const event = (await proof.executeCommand(
    sales,
    M.Event_createViaPlanEngagement,
    {
      clientId: client.docId,
      title: "Read contract dinner",
      eventType: "corporate dinner",
      startsAt: Date.UTC(2026, 10, 7, 17),
      endsAt: Date.UTC(2026, 10, 7, 22),
      expectedHeadcount: 40,
      primaryContactName: "Casey Contract",
      budgetAmount: 3000,
      quotedPrice: 4500,
    },
  )) as { docId: string };
  const dish = (await proof.executeCommand(kitchen, M.Dish_createViaIntroduce, {
    name: "Garden salad",
    portionSize: 1,
    portionUnit: "portion",
  })) as { docId: string };
  const line = (await proof.executeCommand(
    events,
    M.EventDish_createViaAddToEvent,
    {
      eventId: event.docId,
      dishId: dish.docId,
      quantityServings: 40,
      dishName: "Garden salad",
    },
  )) as { docId: string };
  const prep = async (name: string) =>
    (
      (await proof.executeCommand(kitchen, M.PrepTask_createViaOpen, {
        eventDishId: line.docId,
        eventId: event.docId,
        name,
        quantity: 40,
        unit: "portion",
      })) as { docId: string }
    ).docId;
  const liveTask = await prep("Wash greens");
  const goneTask = await prep("Old task");
  // A soft-deleted row (as an archive leaves it) must vanish from both reads.
  await kitchen.run(async (ctx) =>
    ctx.db.patch(goneTask as never, { deletedAt: Date.now() } as never),
  );
  return { eventId: event.docId, liveTask, goneTask, events, kitchen };
}

const readiness = async (actor: Role, eventId: string) =>
  (await actor.query(api.eventReadiness.getEventReadiness, {
    eventId,
  })) as Readiness;

const prepIssueIds = (projection: NonNullable<Readiness>) =>
  projection.domains
    .find((domain) => domain.domain === "kitchen")!
    .issues.filter((issue) => issue.code === "kitchen.prep_open")
    .flatMap((issue) => issue.affectedIds);

const prepIssueCount = (projection: NonNullable<Readiness>) =>
  projection.domains
    .find((domain) => domain.domain === "kitchen")!
    .issues.filter((issue) => issue.code === "kitchen.prep_open").length;

async function listedPrepIds(actor: Role, eventId: string) {
  const rows = (await actor.query(api.queries.listPrepTask, {})) as Array<{
    _id: string;
    eventId?: string;
  }>;
  return rows.filter((row) => row.eventId === eventId).map((row) => row._id);
}

describe("runtime proof: canonical event read contract (AC-637)", () => {
  it("every event-page part has a reader on the event screens and one shared readiness domain", () => {
    const contract = readFileSync(
      join(process.cwd(), "docs/systems/ui-contract.md"),
      "utf8",
    );
    for (const part of EVENT_PAGE_PARTS) {
      expect(EVENT_READINESS_DOMAINS, part.part).toContain(part.domain);
      for (const read of part.reads)
        expect(contract, `${part.part}: ${read}`).toContain(`\`${read}\``);
    }
    // Every readiness domain is used by at least one part of the page.
    for (const domain of EVENT_READINESS_DOMAINS.filter(
      (name) => name !== "execution",
    ))
      expect(EVENT_PAGE_PARTS.map((part) => part.domain)).toContain(domain);
  });

  it("readiness names the same record ids as the domain read, and both leave out soft-deleted rows", async () => {
    const proof = harness();
    const seeded = await seedEventWithPrep(proof, "tenant-ac637-ids");
    const projection = await readiness(seeded.kitchen, seeded.eventId);
    expect(projection).not.toBeNull();
    expect(projection!.domains.map((domain) => domain.domain)).toEqual([
      ...EVENT_READINESS_DOMAINS,
    ]);
    const listed = await listedPrepIds(seeded.kitchen, seeded.eventId);
    expect(listed).toEqual([seeded.liveTask]);
    expect(prepIssueIds(projection!)).toEqual(listed);
    expect(prepIssueIds(projection!)).not.toContain(seeded.goneTask);
  });

  it("a person who cannot open prep tasks still sees that prep is open, but never the task ids", async () => {
    const proof = harness();
    const tenantId = "tenant-ac637-policy";
    const seeded = await seedEventWithPrep(proof, tenantId);
    const server = proof.asRole({
      subject: `staff-${tenantId}`,
      role: "staff",
      tenantId,
    });
    expect(await listedPrepIds(server, seeded.eventId)).toEqual([]);
    const projection = await readiness(server, seeded.eventId);
    expect(projection).not.toBeNull();
    expect(prepIssueCount(projection!)).toBe(1);
    expect(prepIssueIds(projection!)).toEqual([]);
  });

  it("another company's caller gets nothing from either read", async () => {
    const proof = harness();
    const seeded = await seedEventWithPrep(proof, "tenant-ac637-home");
    const stranger = proof.asRole({
      subject: "kitchen-stranger",
      role: "kitchen_manager",
      tenantId: "tenant-ac637-stranger",
    });
    expect(await readiness(stranger, seeded.eventId)).toBeNull();
    expect(await listedPrepIds(stranger, seeded.eventId)).toEqual([]);
  });
});
