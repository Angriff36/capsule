/**
 * Runtime proof (2026-09-29, governed writes): the recurring-event materializer
 * (convex/recurringEvents.ts materializeDue — scheduled, no identity) plans
 * each occurrence with the generated Event.planEngagement and records series
 * progress with Event.advanceRecurrence, both through the tenant system
 * runner. Occurrences therefore emit a real EventPlanned from the command and
 * get an event number (the hand-inserted ledger row they used to get never
 * ran that hook). Replaying the sweep plans nothing twice, and nobody but the
 * schedule can plan an occurrence or advance a series.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";
import { ensureTestFieldEncryptionKey } from "./test-field-encryption-key";

beforeAll(ensureTestFieldEncryptionKey);

const M = api.mutations;
const TENANT = "tenant-recurring-occurrences";
const DAY = 24 * 60 * 60 * 1000;

function harness() {
  return createManifestTestContext({
    convexTest: convexTest as never,
    schema,
    modules,
  });
}
type Proof = ReturnType<typeof harness>;
type Actor = ReturnType<Proof["asRole"]>;
type Row = Record<string, unknown> & { _id: string; version: number };

async function run(proof: Proof, actor: Actor, fn: unknown, args: object) {
  return (await proof.executeCommand(actor, fn as never, args as never)) as {
    docId: string;
  };
}

async function seedSeries(proof: Proof) {
  const sales = proof.asRole({
    subject: "rec-sales",
    role: "sales_manager",
    tenantId: TENANT,
  });
  const events = proof.asRole({
    subject: "rec-events",
    role: "event_manager",
    tenantId: TENANT,
  });
  const client = await run(proof, sales, M.Client_createViaRegister, {
    clientType: "company",
    companyName: "Recurring client",
  });
  const startsAt = Math.floor(Date.now() / DAY) * DAY + 2 * DAY + 17 * 3600000;
  const template = await run(proof, sales, M.Event_createViaPlanEngagement, {
    clientId: client.docId,
    title: "Weekly staff lunch",
    eventType: "corporate lunch",
    startsAt,
    endsAt: startsAt + 2 * 3600000,
    expectedHeadcount: 25,
    primaryContactName: "Rita Recurring",
    primaryContactPhone: "+15555550123",
    budgetAmount: 800,
    quotedPrice: 1000,
  });
  const seriesId = "series-proof-1";
  await run(proof, events, M.Event_configureRecurrence, {
    docId: template.docId,
    version: 1,
    frequency: "weekly",
    endCondition: "after_occurrences",
    occurrenceLimit: 3,
    nextStartsAt: startsAt + 7 * DAY,
    seriesId,
  });
  return { sales, events, templateId: template.docId, seriesId, startsAt };
}

async function occurrences(actor: Actor, templateId: string): Promise<Row[]> {
  return (await actor.run(async (ctx) =>
    (await ctx.db.query("events").collect())
      .filter((row) => row.recurrenceTemplateEventId === templateId)
      .sort(
        (a, b) => Number(a.recurrenceSequence) - Number(b.recurrenceSequence),
      ),
  )) as unknown as Row[];
}

describe("runtime proof: recurring occurrences are planned by Event commands", () => {
  it("plans each occurrence with planEngagement, numbers it, and completes the series", async () => {
    const proof = harness();
    const s = await seedSeries(proof);
    const result = (await s.events.mutation(
      internal.recurringEvents.materializeDue,
      { templateEventId: s.templateId, tenantId: TENANT, seriesId: s.seriesId },
    )) as { generated: number; active: boolean };
    expect(result).toEqual({ generated: 2, active: false });

    const rows = await occurrences(s.events, s.templateId);
    expect(rows.map((row) => row.recurrenceSequence)).toEqual([2, 3]);
    expect(rows[0]).toMatchObject({
      tenantId: TENANT,
      title: "Weekly staff lunch",
      stage: "planning",
      startsAt: s.startsAt + 7 * DAY,
      endsAt: s.startsAt + 7 * DAY + 2 * 3600000,
      recurrenceSeriesId: s.seriesId,
      recurrenceActive: false,
      version: 1,
    });
    expect(rows[0]!.plannedAt).toEqual(expect.any(Number));

    // The generated read decrypts what the command sealed: contact carried over.
    const viaQuery = (await s.events.query(api.queries.getEvent, {
      id: rows[0]!._id,
    })) as { primaryContactName: string; primaryContactPhone: string };
    expect(viaQuery.primaryContactName).toBe("Rita Recurring");
    expect(viaQuery.primaryContactPhone).toBe("+15555550123");

    const ledger = (await s.events.run(async (ctx) =>
      ctx.db.query("manifestEvents").collect(),
    )) as unknown as Array<{
      type: string;
      entityId: string;
      payload: Record<string, unknown>;
    }>;
    for (const row of rows) {
      const planned = ledger.filter(
        (item) => item.type === "EventPlanned" && item.entityId === row._id,
      );
      expect(planned).toHaveLength(1);
      expect(planned[0]!.payload).toMatchObject({
        eventId: row._id,
        tenantId: TENANT,
        recurrenceTemplateEventId: s.templateId,
        recurrenceSeriesId: s.seriesId,
        recurrenceSequence: row.recurrenceSequence,
      });
    }

    // EventPlanned ran the numbering hook: every event has its own number.
    const numbers = (await s.events.run(async (ctx) =>
      ctx.db.query("eventNumberAssignments").collect(),
    )) as unknown as Array<{ eventId: string; eventNumber: string }>;
    const numbered = new Map(
      numbers.map((row) => [row.eventId, row.eventNumber]),
    );
    for (const row of rows) expect(numbered.get(row._id)).toMatch(/^\d{4}$/);
    expect(new Set(numbered.values()).size).toBe(numbered.size);

    const template = (await s.events.run(async (ctx) =>
      ctx.db.get(s.templateId as never),
    )) as Row;
    expect(template).toMatchObject({
      recurrenceGeneratedCount: 3,
      recurrenceActive: false,
    });
    // A completed series has no next start (the command leaves it unset).
    expect(template.recurrenceNextStartsAt ?? null).toBeNull();
    expect(template.recurrenceCompletedAt).toEqual(expect.any(Number));
    const advanced = ledger.filter(
      (item) => item.type === "EventRecurrenceAdvanced",
    );
    expect(advanced).toHaveLength(1);
    expect(advanced[0]!.payload).toMatchObject({
      eventId: s.templateId,
      seriesId: s.seriesId,
      generatedCount: 3,
    });
  });

  it("a replayed sweep plans nothing twice", async () => {
    const proof = harness();
    const s = await seedSeries(proof);
    const args = {
      templateEventId: s.templateId,
      tenantId: TENANT,
      seriesId: s.seriesId,
    };
    await s.events.mutation(internal.recurringEvents.materializeDue, args);
    const again = (await s.events.mutation(
      internal.recurringEvents.materializeDue,
      args,
    )) as { generated: number };
    expect(again.generated).toBe(0);
    expect(await occurrences(s.events, s.templateId)).toHaveLength(2);
  });

  it("only the schedule may plan an occurrence or advance a series", async () => {
    const proof = harness();
    const s = await seedSeries(proof);
    const client = (await s.sales.run(async (ctx) =>
      ctx.db.get(s.templateId as never),
    )) as Row;
    await expect(
      run(proof, s.sales, M.Event_createViaPlanEngagement, {
        clientId: client.clientId,
        title: "Forged occurrence",
        eventType: "corporate lunch",
        startsAt: s.startsAt + 7 * DAY,
        endsAt: s.startsAt + 7 * DAY + 3600000,
        expectedHeadcount: 25,
        primaryContactName: "Rita Recurring",
        budgetAmount: 0,
        quotedPrice: 0,
        recurrenceTemplateEventId: s.templateId,
        recurrenceSeriesId: s.seriesId,
        recurrenceSequence: 2,
      }),
    ).rejects.toThrow(/created by the recurrence schedule/);
    await expect(
      run(proof, s.events, M.Event_advanceRecurrence, {
        docId: s.templateId,
        seriesId: s.seriesId,
        generatedCount: 3,
      }),
    ).rejects.toThrow();
    expect(await occurrences(s.events, s.templateId)).toHaveLength(0);
  });
});
