/**
 * Runtime proof (PL-RACE-PROOF, backend spec §20.4 / §6.3; AC-697, AC-699,
 * AC-701, AC-703, AC-405, AC-173): races and lost answers keep one record,
 * one version step and the facts already saved, and the loser learns the
 * truth in plain words.
 *
 * - Two reservations in flight for the last stock: one hold, the other is
 *   refused as "not enough stock", and on-hand never moves.
 * - Two weekly-order updates in flight (two events approved together, then
 *   both headcounts changed together): one draft order, one line per
 *   ingredient carrying both events, quantities equal to the sum.
 * - A provider repeats its messages and delivers them out of order: one
 *   thread, one row per message, and the inbox shows them in send order.
 * - A screen with a stale version tries to save: refused as "someone else
 *   changed this" with the current version in the error, the first save
 *   stays, and a refreshed retry saves.
 * - The answer to a saved change is lost and the phone resends: the first
 *   answer comes back and the change is not applied twice. A sign-in that
 *   ran out saves nothing and the screen asks for a refresh; after signing
 *   back in the same retry key saves once.
 * - A venue saved twice with one retry key is one venue; its company reads
 *   it back and another company does not see it (AC-358, venues slice).
 *
 * Saves book follow-ups (timing plan, stage check) that run moments later and
 * may move the version, so the stale and lost-answer cases let them finish
 * first, as a screen's live data does.
 *
 * The other §20.4 cases are proven elsewhere and retained: two booking /
 * acceptance calls (booking-race), a worker stopping between parent and child
 * and an import resuming after partial writes (import-resume-fault-injection),
 * and regeneration with no diff (`bun run manifest:regen:check`).
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";
import { classifyCommandFailure } from "../../src/features/events/CommandFailure";
import { messageTime } from "../../src/features/sales/messageOrder";
import {
  createPlannedEvent,
  harness as stockHarness,
  runner as stockRunner,
  type Proof as StockProof,
  type Role as StockRole,
} from "./headcount-prep-reconciliation.runtime.helpers";
import {
  drafts,
  harness as weeklyHarness,
  lineFor,
  linkedEventIds,
  rolesFor,
  runner,
  seedCatalog,
  versionOf,
  WEEK_ONE,
  type Proof as WeeklyProof,
} from "./weekly-purchasing.runtime.helpers";

const M = api.mutations;

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

/** Settle every call; rejected losers are retried once, in order. */
async function raceThenRetry<T>(calls: Array<() => Promise<T>>) {
  const settled = await Promise.allSettled(calls.map((call) => call()));
  const losers = settled.flatMap((r, i) =>
    r.status === "rejected" ? [i] : [],
  );
  for (const i of losers) await calls[i]!();
  return settled;
}

// ---- last stock ------------------------------------------------------------

async function seedLastStock(proof: StockProof, tenantId: string) {
  const inventory = proof.asRole({
    subject: `race-inv-${tenantId}`,
    role: "inventory_staff",
    tenantId,
  });
  const kitchen = proof.asRole({
    subject: `race-kitchen-${tenantId}`,
    role: "kitchen_manager",
    tenantId,
  });
  const ing = await stockRunner(proof, kitchen)(
    M.Ingredient_createViaIntroduce,
    {
      name: `Last truffle ${tenantId}`,
      unit: "kilogram",
      costPerUnit: 40,
      allergens: [],
      category: "pantry",
    },
  );
  const run = stockRunner(proof, inventory);
  const loc = await run(M.StorageLocation_createViaRegister, {
    name: `Walk-in ${tenantId}`,
    locationType: "dry",
  });
  const item = await run(M.InventoryItem_createViaOpen, {
    ingredientId: ing.docId,
    locationId: loc.docId,
    unit: "kilogram",
    quantityOnHand: 5,
  });
  return { inventory, ingredientId: ing.docId, itemId: item.docId };
}

async function holdsOn(role: StockRole, itemId: string) {
  const rows = (await role.run(async (ctx) =>
    ctx.db.query("inventoryReservations").collect(),
  )) as Array<{
    inventoryItemId: string;
    eventId: string;
    quantity: number;
    status: string;
    deletedAt?: number | null;
  }>;
  return rows.filter(
    (r) => r.inventoryItemId === itemId && r.deletedAt == null,
  );
}

// ---- signed-in callers on a bare convex-test ------------------------------

const salesIdentity = (tenantId: string) => ({
  subject: `race-sales-${tenantId}`,
  tokenIdentifier: `race|sales-${tenantId}`,
  role: "sales_manager",
  tenantId,
});

async function plannedEvent(
  sales: ReturnType<ReturnType<typeof convexTest>["withIdentity"]>,
) {
  const client = (await sales.mutation(M.Client_createViaRegister, {
    clientType: "company",
    companyName: "Race recovery client",
  })) as { docId: string };
  const event = (await sales.mutation(M.Event_createViaPlanEngagement, {
    clientId: client.docId,
    title: "Race recovery dinner",
    eventType: "corporate dinner",
    startsAt: Date.UTC(2026, 10, 12, 18, 0),
    endsAt: Date.UTC(2026, 10, 12, 22, 0),
    expectedHeadcount: 40,
    primaryContactName: "Casey Recovery",
    budgetAmount: 3000,
    quotedPrice: 4500,
  } as never)) as { docId: Id<"events"> };
  return event.docId;
}

type EventRow = { version: number; expectedHeadcount: number; stage: string };

/**
 * Lets the follow-ups a save books for now (timing plan, stage check) finish,
 * as they do within moments on the real server; they may move the version.
 */
async function settle(t: ReturnType<typeof convexTest>) {
  for (let round = 0; round < 20; round++) {
    await new Promise((resolve) => setTimeout(resolve, 5));
    await t.finishInProgressScheduledFunctions();
    const due = (
      await t.run((ctx) =>
        ctx.db.system.query("_scheduled_functions").collect(),
      )
    ).filter(
      (job) =>
        (job.state.kind === "pending" || job.state.kind === "inProgress") &&
        job.scheduledTime <= Date.now() + 1000,
    );
    if (due.length === 0) return;
  }
}

describe("concurrency and recovery (backend §20.4)", () => {
  it("two reservations in flight for the last stock leave one hold and refuse the other (AC-697)", async () => {
    const proof = stockHarness();
    const tenantId = "tenant-race-last-stock";
    const { inventory, ingredientId, itemId } = await seedLastStock(
      proof,
      tenantId,
    );
    const eventA = await createPlannedEvent(proof, tenantId, "Truffle A");
    const eventB = await createPlannedEvent(proof, tenantId, "Truffle B");
    const reserve = (eventId: string) =>
      inventory.mutation(M.InventoryReservation_createViaReserve, {
        inventoryItemId: itemId,
        eventId,
        ingredientId,
        quantity: 5,
      });

    const settled = await Promise.allSettled([
      reserve(eventA.eventId),
      reserve(eventB.eventId),
    ]);
    expect(settled.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const loser = settled.find((r) => r.status === "rejected") as
      PromiseRejectedResult | undefined;
    expect(loser).toBeDefined();
    expect(classifyCommandFailure(loser!.reason).code).toBe(
      "INSUFFICIENT_STOCK",
    );

    const holds = await holdsOn(inventory, itemId);
    expect(holds).toHaveLength(1);
    expect(holds[0]!.status).toBe("active");
    expect(Number(holds[0]!.quantity)).toBe(5);
    const winner = holds[0]!.eventId;
    const other = winner === eventA.eventId ? eventB.eventId : eventA.eventId;

    // The loser's retry gets the same truthful answer; nothing moves.
    await expect(reserve(other)).rejects.toThrow(/Not enough free stock/);
    expect(await holdsOn(inventory, itemId)).toHaveLength(1);
    const item = (await inventory.run(async (ctx) =>
      ctx.db.get(itemId as never),
    )) as { quantityOnHand: number };
    expect(Number(item.quantityOnHand)).toBe(5);
  });

  it("two weekly-order updates in flight keep one draft with both events on each line (AC-699)", async () => {
    const proof: WeeklyProof = weeklyHarness();
    const tenantId = "tenant-race-weekly";
    const roles = rolesFor(proof, tenantId);
    const sales = runner(proof, roles.sales);
    const events = runner(proof, roles.events);
    const catalog = await seedCatalog(proof, tenantId, [
      { name: "Flour", perServing: 0.1 },
    ]);
    const [flourId] = catalog.ingredientIds as [string];

    const submitted = async (title: string, headcount: number) => {
      const client = await sales(M.Client_createViaRegister, {
        clientType: "company",
        companyName: `${title} client`,
      });
      const event = await sales(M.Event_createViaPlanEngagement, {
        clientId: client.docId,
        title,
        eventType: "catering",
        startsAt: WEEK_ONE.startsAt,
        endsAt: WEEK_ONE.endsAt,
        expectedHeadcount: headcount,
        primaryContactName: "Pat Planner",
        budgetAmount: 3000,
        quotedPrice: 4000,
      });
      await events(M.EventDish_createViaAddToEvent, {
        eventId: event.docId,
        dishId: catalog.dishIds[0]!,
        quantityServings: headcount,
      });
      await events(M.Event_submitForApproval, {
        docId: event.docId,
        version: 1,
      });
      return event.docId;
    };
    const lunch = await submitted("Race lunch", 100);
    const dinner = await submitted("Race dinner", 50);

    // Both approvals reconcile the same week's order at the same time.
    await raceThenRetry([
      () =>
        roles.events.mutation(M.Event_approve, { docId: lunch, version: 2 }),
      () =>
        roles.events.mutation(M.Event_approve, { docId: dinner, version: 2 }),
    ]);
    const [draft, ...extra] = await drafts(roles.procurement, tenantId);
    expect(extra).toEqual([]);
    const line = await lineFor(
      roles.procurement,
      tenantId,
      draft!._id,
      flourId,
    );
    // 150 guests x 0.1 kg.
    expect(Number(line!.orderedQuantity)).toBeCloseTo(15, 4);
    expect(
      await linkedEventIds(roles.procurement, tenantId, line!._id),
    ).toEqual([lunch, dinner].sort());

    // Both headcounts change at the same time.
    const lunchVersion = await versionOf(roles.events, lunch);
    const dinnerVersion = await versionOf(roles.events, dinner);
    await raceThenRetry([
      () =>
        roles.events.mutation(M.Event_changeHeadcount, {
          docId: lunch,
          version: lunchVersion,
          newHeadcount: 120,
        }),
      () =>
        roles.events.mutation(M.Event_changeHeadcount, {
          docId: dinner,
          version: dinnerVersion,
          newHeadcount: 60,
        }),
    ]);
    const after = await drafts(roles.procurement, tenantId);
    expect(after.map((o) => o._id)).toEqual([draft!._id]);
    const lineAfter = await lineFor(
      roles.procurement,
      tenantId,
      draft!._id,
      flourId,
    );
    expect(lineAfter!._id).toBe(line!._id);
    // 180 guests x 0.1 kg.
    expect(Number(lineAfter!.orderedQuantity)).toBeCloseTo(18, 4);
    expect(
      await linkedEventIds(roles.procurement, tenantId, lineAfter!._id),
    ).toEqual([lunch, dinner].sort());
  });

  it("a provider that repeats messages and sends them out of order leaves one row each, shown in send order (AC-701)", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({
      subject: "race-inbox-owner",
      tokenIdentifier: "race|inbox-owner",
      role: "org:owner",
      tenantId: "tenant-race-inbox",
    });
    const sentFirst = Date.UTC(2026, 9, 1, 10, 0);
    const sentSecond = Date.UTC(2026, 9, 1, 10, 5);
    const first = JSON.stringify({
      threadId: "thread-77",
      messageId: "msg-1",
      from: "dana@client.test",
      body: "Can you cater 60 guests on the 14th?",
      sent_at: new Date(sentFirst).toISOString(),
    });
    const second = JSON.stringify({
      threadId: "thread-77",
      messageId: "msg-2",
      from: "dana@client.test",
      body: "Also, two of them are vegan.",
      timestamp: sentSecond / 1000,
    });
    const deliver = (rawJson: string) =>
      owner.action(api.messageInbox.ingestProviderEnvelope, {
        provider: "email",
        rawJson,
      });

    // The newer message arrives first, then the older one, then the
    // provider repeats both at once.
    const late = await deliver(second);
    const early = await deliver(first);
    const repeats = await Promise.all([deliver(second), deliver(first)]);
    expect(late.recorded).toBe("ingested");
    expect(early.recorded).toBe("ingested");
    expect(repeats.map((r) => r.messageId)).toEqual([
      late.messageId,
      early.messageId,
    ]);

    const { threads, messages } = await t.run(async (ctx) => ({
      threads: await ctx.db.query("messageThreads").collect(),
      messages: await ctx.db.query("messages").collect(),
    }));
    expect(threads).toHaveLength(1);
    expect(messages).toHaveLength(2);
    expect(messages.map((m) => m.sentAt).sort()).toEqual([
      sentFirst,
      sentSecond,
    ]);
    // Saved in arrival order, shown in send order.
    expect(messages.map((m) => m.providerMessageId)).toEqual([
      "msg-2",
      "msg-1",
    ]);
    const shown = [...messages].sort((a, b) => messageTime(a) - messageTime(b));
    expect(shown.map((m) => m.bodyText)).toEqual([
      "Can you cater 60 guests on the 14th?",
      "Also, two of them are vegan.",
    ]);
  });

  it("a stale screen's save is refused as a conflict with the current version, and a refreshed retry saves (AC-703)", async () => {
    const t = convexTest(schema, modules);
    const sales = t.withIdentity(salesIdentity("tenant-race-stale"));
    const eventId = await plannedEvent(sales);
    const read = () =>
      sales.run(async (ctx) =>
        ctx.db.get(eventId as never),
      ) as Promise<EventRow>;

    // Two screens opened the event at version 1; the first one saves.
    await settle(t);
    const opened = (await read()).version;
    await sales.mutation(M.Event_changeHeadcount, {
      docId: eventId,
      version: opened,
      newHeadcount: 48,
    });
    await settle(t);
    const saved = await read();
    expect(saved.version).toBeGreaterThan(opened);
    expect(saved.expectedHeadcount).toBe(48);

    let refused: unknown;
    await sales
      .mutation(M.Event_changeHeadcount, {
        docId: eventId,
        version: opened,
        newHeadcount: 99,
      })
      .catch((e: unknown) => {
        refused = e;
      });
    expect(refused).toBeDefined();
    const failure = classifyCommandFailure(refused);
    expect(failure.category).toBe("conflict");
    expect(failure.code).toBe("STALE_VERSION");
    expect(failure.action?.reload).toBe(true);
    // The refusal carries the version to refresh to.
    expect(String((refused as Error).message)).toContain(
      `expected ${opened} actual ${saved.version}`,
    );
    expect(await read()).toEqual(saved);

    // The second screen refreshes and saves on top of the first save.
    const fresh = await read();
    await sales.mutation(M.Event_changeHeadcount, {
      docId: eventId,
      version: fresh.version,
      newHeadcount: 99,
    });
    const after = await read();
    expect(after.version).toBeGreaterThan(fresh.version);
    expect(after.expectedHeadcount).toBe(99);
  });

  it("a lost answer replays the first result, and an expired sign-in saves nothing until signed back in (AC-173)", async () => {
    const t = convexTest(schema, modules);
    const sales = t.withIdentity(salesIdentity("tenant-race-lost"));
    const eventId = await plannedEvent(sales);
    const read = () =>
      sales.run(async (ctx) =>
        ctx.db.get(eventId as never),
      ) as Promise<EventRow>;
    const change = (
      as: typeof sales | typeof t,
      version: number,
      newHeadcount: number,
      idempotencyKey: string,
    ) =>
      as.mutation(M.Event_changeHeadcount, {
        docId: eventId,
        version,
        newHeadcount,
        idempotencyKey,
      });

    // The server saved the change but the phone never heard back; the resend
    // gets the same answer and the change is not applied twice.
    await settle(t);
    const opened = (await read()).version;
    const answer = await change(sales, opened, 52, "headcount-tap-1");
    await settle(t);
    const saved = await read();
    expect(saved.expectedHeadcount).toBe(52);
    expect(await change(sales, opened, 52, "headcount-tap-1")).toEqual(answer);
    expect(await read()).toEqual(saved);

    // The sign-in ran out: refused, nothing saved. The server answers a
    // signed-out caller as it answers a stranger (never saying the event
    // exists), and the screen asks for a refresh - which goes through sign-in
    // - rather than claiming it saved.
    let refused: unknown;
    await change(t, saved.version, 70, "headcount-tap-2").catch(
      (e: unknown) => {
        refused = e;
      },
    );
    expect(refused).toBeDefined();
    const failure = classifyCommandFailure(refused);
    expect(failure.code).toBe("NOT_FOUND_OR_FORBIDDEN");
    expect(failure.action?.reload).toBe(true);
    expect(await read()).toEqual(saved);

    // Signed back in, the same retry saves once.
    const retried = await change(sales, saved.version, 70, "headcount-tap-2");
    await settle(t);
    const final = await read();
    expect(final.expectedHeadcount).toBe(70);
    expect(await change(sales, saved.version, 70, "headcount-tap-2")).toEqual(
      retried,
    );
    expect(await read()).toEqual(final);
  });

  it("a venue saved twice with one retry key is one venue, read back by its company and hidden from another (AC-358)", async () => {
    const t = convexTest(schema, modules);
    const owner = (tenantId: string) =>
      t.withIdentity({
        subject: `race-venue-${tenantId}`,
        tokenIdentifier: `race|venue-${tenantId}`,
        role: "org:owner",
        tenantId,
      });
    const mine = owner("tenant-race-venue-a");
    const theirs = owner("tenant-race-venue-b");
    const register = () =>
      mine.mutation(M.Venue_createViaRegister, {
        name: "Riverside Hall",
        venueType: "other",
        capacity: 120,
        addressLine1: "1 River Road",
        idempotencyKey: "venue-save-1",
      } as never) as Promise<{ docId: string }>;

    const [first, resent] = await Promise.all([register(), register()]);
    expect(resent.docId).toBe(first.docId);
    const listed = (await mine.query(api.queries.listVenue, {})) as Array<{
      _id: string;
      name: string;
      capacity: number;
    }>;
    expect(listed.map((v) => [v._id, v.name, v.capacity])).toEqual([
      [first.docId, "Riverside Hall", 120],
    ]);
    const foreign = (await theirs.query(api.queries.listVenue, {})) as Array<{
      _id: string;
    }>;
    expect(foreign.map((v) => v._id)).not.toContain(first.docId);
  });
});
