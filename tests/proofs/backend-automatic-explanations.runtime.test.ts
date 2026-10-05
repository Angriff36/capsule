/**
 * Runtime proof (AC-642, spec BE-18.7): every record Capsule makes by itself
 * carries id + version, value/status, generated / by hand / changed by a
 * person, its source records and rule version, plain "why" words, staleness
 * with the last reconcile time, and what blocks it with the step that fixes
 * it - served by convex/automaticExplanations.ts, under each kind's own
 * read rule.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";
import {
  explainProposalLine,
  type AutomaticExplanation,
} from "../../src/lib/automaticExplanation";
import { explainContribution } from "../../src/lib/automaticExplanationOps";
import {
  planLines,
  type GenerationRecord,
} from "../../src/lib/proposalGeneration";

const M = api.mutations;
const SAT = Date.UTC(2026, 10, 14, 23, 0);

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
type Read = { eventId: string; items: AutomaticExplanation[] } | null;

const ORIGINS = ["generated", "manual", "overridden"];

function expectContract(item: AutomaticExplanation) {
  expect(typeof item.id).toBe("string");
  expect(item.id.length).toBeGreaterThan(0);
  expect(typeof item.version).toBe("number");
  expect(typeof item.label).toBe("string");
  expect(typeof item.value).toBe("string");
  expect(ORIGINS).toContain(item.origin);
  expect(Array.isArray(item.sources)).toBe(true);
  for (const source of item.sources) {
    expect(typeof source.table).toBe("string");
    expect(typeof source.id).toBe("string");
  }
  expect(item.why.length).toBeGreaterThan(0);
  expect(typeof item.stale).toBe("boolean");
  if (item.stale) expect((item.staleReason ?? "").length).toBeGreaterThan(0);
  if (item.blocking) {
    expect(item.blocking.reason.length).toBeGreaterThan(0);
    expect(item.blocking.action).toMatch(/^[A-Z][A-Za-z]+\.[a-z][A-Za-z]+$/);
  }
  if (item.origin !== "manual") expect(item.sources.length).toBeGreaterThan(0);
}

async function seed(proof: Proof, tenantId: string) {
  const role = (name: string) =>
    proof.asRole({ subject: `${name}-${tenantId}`, role: name, tenantId });
  const sales = role("sales_manager");
  const events = role("event_manager");
  const kitchen = role("kitchen_manager");
  const run = async (actor: Role, fn: unknown, args: Record<string, unknown>) =>
    (await proof.executeCommand(actor, fn as never, args)) as { docId: string };

  const client = await run(sales, M.Client_createViaRegister, {
    clientType: "company",
    companyName: `Explain ${tenantId}`,
  });
  const event = await run(sales, M.Event_createViaPlanEngagement, {
    clientId: client.docId,
    title: "Explained dinner",
    eventType: "corporate dinner",
    startsAt: SAT,
    endsAt: SAT + 4 * 3600_000,
    expectedHeadcount: 40,
    primaryContactName: "Casey Explain",
    budgetAmount: 3000,
    quotedPrice: 4500,
  });
  const eventId = event.docId;
  const readEvent = async () =>
    (await events.run(async (ctx) => ctx.db.get(eventId as never))) as {
      version: number;
    };
  // Generated: the timing steps come from the event's own times.
  await run(events, M.Event_configureTiming, {
    docId: eventId,
    version: (await readEvent()).version,
    serviceStartsAt: SAT,
    setupMinutes: 120,
    loadMinutes: 60,
    outboundTravelMinutes: 30,
    cleanupMinutes: 60,
    returnTravelMinutes: 30,
    unloadMinutes: 30,
  });
  // By hand: a prep task, a crew spot and a pack line.
  const dish = await run(kitchen, M.Dish_createViaIntroduce, {
    name: "Garden salad",
    portionSize: 1,
    portionUnit: "portion",
  });
  const line = await run(events, M.EventDish_createViaAddToEvent, {
    eventId,
    dishId: dish.docId,
    quantityServings: 40,
    dishName: "Garden salad",
  });
  const prep = await run(kitchen, M.PrepTask_createViaOpen, {
    eventDishId: line.docId,
    eventId,
    name: "Wash greens",
    quantity: 40,
    unit: "portion",
  });
  const need = await run(events, M.EventStaffNeed_createViaPostOpen, {
    eventId,
    role: "Server",
    startsAt: SAT,
    endsAt: SAT + 4 * 3600_000,
  });
  const pack = await run(events, M.PackList_createViaOpen, {
    eventId,
    name: "Main load",
  });
  const packLine = await run(events, M.PackListItem_createViaAddItem, {
    packListId: pack.docId,
    description: "Cake stand",
    requiredQuantity: 1,
    unit: "each",
  });
  // A planning rule's suggestion a person turned down.
  const rule = await run(events, M.PlanningRule_createViaDefine, {
    name: "Ice for every event",
    trigger: "every_event",
    actionsJson: JSON.stringify([
      { kind: "task", target: "Buy ice", base: 1, perGuest: 0, perTrigger: 0 },
    ]),
  });
  const receipt = await run(events, M.PlanningReceipt_createViaRecord, {
    eventId,
    suggestionKey: `rule:${rule.docId}:task:buy%20ice`,
    quantity: 0,
    declined: true,
    basis: JSON.stringify([1, 40, 1]),
  });
  return {
    eventId,
    prep,
    need,
    packLine,
    rule,
    receipt,
    events,
    readEvent,
    run,
  };
}

const read = async (actor: Role, eventId: string) =>
  (await actor.query(api.automaticExplanations.explainEventAutomaticWork, {
    eventId,
  })) as Read;

describe("runtime proof: automatic explanations (AC-642)", () => {
  it("every automatic record on the event answers the full contract", async () => {
    const proof = harness();
    const tenantId = "tenant-ac642-contract";
    const s = await seed(proof, tenantId);
    const owner = proof.asRole({ subject: "owner", role: "owner", tenantId });
    const result = await read(owner, s.eventId);
    expect(result).not.toBeNull();
    for (const item of result!.items) expectContract(item);
    const kinds = new Set(result!.items.map((item) => item.kind));
    for (const kind of [
      "timeline_milestone",
      "planning_answer",
      "task",
      "staffing_need",
      "pack_line",
    ])
      expect(kinds, kind).toContain(kind);

    // Timing steps: made from the event, with the last reconcile time.
    const steps = result!.items.filter(
      (item) => item.kind === "timeline_milestone",
    );
    expect(steps.length).toBeGreaterThan(0);
    for (const step of steps) {
      expect(step.origin).toBe("generated");
      expect(step.sources).toEqual([{ table: "events", id: s.eventId }]);
      expect(step.ruleVersion).toMatch(/^timing step /);
      expect(step.lastReconciledAt).toEqual(expect.any(Number));
      expect(step.stale).toBe(false);
    }

    const byId = (id: string) => result!.items.find((item) => item.id === id)!;
    expect(byId(s.prep.docId)).toMatchObject({
      kind: "task",
      origin: "manual",
      why: "A person added this task by hand.",
      blocking: null,
    });
    expect(byId(s.need.docId)).toMatchObject({
      kind: "staffing_need",
      origin: "manual",
      blocking: {
        reason: "Nobody has this spot yet.",
        action: "EventStaffNeed.fill",
      },
    });
    expect(byId(s.packLine.docId)).toMatchObject({
      kind: "pack_line",
      origin: "manual",
      value: "1 each",
    });
    expect(byId(s.receipt.docId)).toMatchObject({
      kind: "planning_answer",
      origin: "overridden",
      ruleVersion: "rule version 1",
      stale: false,
      sources: [
        { table: "events", id: s.eventId },
        { table: "planningRules", id: s.rule.docId },
      ],
    });
    expect(byId(s.receipt.docId).why).toContain(
      'Suggested by the rule "Ice for every event"',
    );
  });

  it("a guest count change marks the turned-down planning answer out of date and says why", async () => {
    const proof = harness();
    const tenantId = "tenant-ac642-stale";
    const s = await seed(proof, tenantId);
    await s.run(s.events, M.Event_changeHeadcount, {
      docId: s.eventId,
      version: (await s.readEvent()).version,
      newHeadcount: 60,
    });
    const owner = proof.asRole({ subject: "owner", role: "owner", tenantId });
    const answer = (await read(owner, s.eventId))!.items.find(
      (item) => item.id === s.receipt.docId,
    )!;
    expect(answer.stale).toBe(true);
    expect(answer.staleReason).toBe(
      "Answered for 40 guests; the event now has 60.",
    );
  });

  it("each kind follows its own read rule, and another company gets nothing", async () => {
    const proof = harness();
    const tenantId = "tenant-ac642-rules";
    const s = await seed(proof, tenantId);
    const cook = proof.asRole({
      subject: "cook",
      role: "kitchen_staff",
      tenantId,
    });
    const kinds = new Set(
      (await read(cook, s.eventId))!.items.map((item) => item.kind),
    );
    expect(kinds).toContain("task");
    expect(kinds).not.toContain("proposal_line");
    expect(kinds).not.toContain("purchasing");
    const driver = proof.asRole({
      subject: "driver",
      role: "driver",
      tenantId,
    });
    expect(
      (await read(driver, s.eventId))!.items.some(
        (item) => item.kind === "task",
      ),
    ).toBe(false);
    const stranger = proof.asRole({
      subject: "stranger",
      role: "owner",
      tenantId: "tenant-ac642-elsewhere",
    });
    expect(await read(stranger, s.eventId)).toBeNull();
  });

  it("proposal lines and purchasing amounts say generated, changed by a person, or out of date", () => {
    const values = {
      description: "Garden salad",
      pricingBasis: "per_person",
      unitPrice: 12,
      quantity: 40,
      menuDishId: "dish_1",
    };
    const record: GenerationRecord = {
      v: 1,
      eventId: "event_1",
      facts: {
        eventDate: 1,
        eventEndDate: 2,
        eventType: "dinner",
        venueName: null,
        venueAddress: null,
        guestCount: 40,
      },
      lines: [
        { sourceKey: "ed_1", lineId: "line_1", values, fingerprint: "f1" },
      ],
      excluded: [],
    };
    const line = { _id: "line_1", version: 2, proposalId: "prop_1", ...values };
    const sourcesByKey = new Map([
      ["ed_1", [{ table: "eventDishes", id: "ed_1" }]],
    ]);
    const untouched = explainProposalLine({
      line,
      record,
      plan: planLines(
        record,
        [
          {
            sourceKey: "ed_1",
            fingerprint: "f1",
            values,
            sortOrder: 0,
            sources: [],
          },
        ],
        new Map([["line_1", { id: "line_1", live: true, values }]]),
      ),
      sourcesByKey,
      lastReconciledAt: 5,
    });
    expectContract(untouched);
    expect(untouched).toMatchObject({
      origin: "generated",
      ruleVersion: "proposal build v1",
      stale: false,
      sources: [
        { table: "proposals", id: "prop_1" },
        { table: "eventDishes", id: "ed_1" },
      ],
    });
    const changed = { ...line, quantity: 45 };
    const kept = explainProposalLine({
      line: changed,
      record,
      plan: planLines(
        record,
        [
          {
            sourceKey: "ed_1",
            fingerprint: "f2",
            values,
            sortOrder: 0,
            sources: [],
          },
        ],
        new Map([
          [
            "line_1",
            { id: "line_1", live: true, values: { ...values, quantity: 45 } },
          ],
        ]),
      ),
      sourcesByKey,
      lastReconciledAt: 5,
    });
    expect(kept.origin).toBe("overridden");
    expect(kept.stale).toBe(true);
    expect(kept.staleReason).toBe(
      "The event dish changed after a person changed this line. Check it.",
    );
    expect(
      explainProposalLine({
        line: { ...line, _id: "typed" },
        record,
        plan: null,
        sourcesByKey,
        lastReconciledAt: null,
      }).origin,
    ).toBe("manual");

    const contribution = explainContribution({
      row: {
        _id: "c_1",
        version: 1,
        eventDishId: "ed_1",
        dishId: "dish_1",
        ingredientId: "ing_1",
        ingredientName: "Romaine",
        quantity: 4,
        unit: "pound",
        servings: 40,
        quantityPerServing: 0.1,
        sourceKey: "ed_1:romaine",
        unitStatus: "resolved",
      },
      lastReconciledAt: 9,
    });
    expectContract(contribution);
    expect(contribution).toMatchObject({
      origin: "generated",
      why: "From the dish recipe: 40 servings x 0.1 pound = 4 pound.",
      stale: false,
      lastReconciledAt: 9,
      blocking: null,
    });
    const replaced = explainContribution({
      row: {
        ...contribution,
        _id: "c_2",
        eventDishId: "ed_1",
        dishId: "dish_1",
        ingredientId: "ing_1",
        quantity: 4,
        unit: "pound",
        servings: 40,
        supersededAt: 3,
        unitStatus: "unit_unknown",
      },
      lastReconciledAt: 9,
    });
    expect(replaced.stale).toBe(true);
    expect(replaced.blocking?.action).toBe("Ingredient.updateDetails");
  });
});
