/**
 * Runtime proof: removing a dish from an event stands down that dish's
 * unfinished prep through DECLARED reactions (src/production/task.manifest,
 * `on EventDishRemoved fanOut PrepTask … run standDown match … status = …`),
 * not the hand-written branch that used to live in
 * convex/lib/operationalEvents.ts.
 *
 * Equivalence with the old branch: every pending/claimed/in_progress/blocked
 * task of the removed dish is stood down exactly once with the removal
 * reason; completed/cancelled/soft-deleted tasks and other dishes' tasks are
 * never invoked (no second PrepTaskCancelled, no version bump); the stand-down
 * runs as the caller, so a caller who may remove the dish but not stand prep
 * down is still refused as a whole; an idempotent replay adds nothing.
 */
import { convexTest } from "convex-test";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { compileProjectToIR } from "@angriff36/manifest/multi-compiler";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";
import { ensureTestFieldEncryptionKey } from "./test-field-encryption-key";

const M = api.mutations;
const REASON = "Client dropped the soup course";
const LIVE = ["pending", "claimed", "in_progress", "blocked"] as const;

beforeAll(ensureTestFieldEncryptionKey);

function harness() {
  return createManifestTestContext({
    convexTest: convexTest as never,
    schema,
    modules,
  });
}

type Proof = ReturnType<typeof harness>;
type Actor = ReturnType<Proof["asRole"]>;

async function seed(actor: Actor, tenantId: string) {
  return (await actor.run(async (ctx) => {
    const clientId = await ctx.db.insert("clients", {
      tenantId,
      clientType: "company",
      companyName: "Prep stand-down proof",
      taxExempt: false,
      paymentTermsDays: 30,
      status: "active",
      version: 0,
    });
    const eventId = await ctx.db.insert("events", {
      tenantId,
      clientId,
      title: "Prep stand-down proof",
      eventType: "proof",
      expectedHeadcount: 20,
      budgetAmount: 1000,
      quotedPrice: 1500,
      stage: "planning",
      version: 0,
    });
    const dishId = await ctx.db.insert("dishes", {
      tenantId,
      name: "Soup",
      portionSize: 1,
      portionUnit: "portion",
      dietaryTags: [],
      status: "active",
      version: 0,
    });
    const addDish = () =>
      ctx.db.insert("eventDishes", {
        tenantId,
        eventId,
        dishId,
        quantityServings: 20,
        addedAt: Date.now(),
        version: 0,
      });
    const eventDishId = await addDish();
    const otherEventDishId = await addDish();
    const task = (
      onDish: typeof eventDishId,
      status: string,
      extra: Record<string, unknown> = {},
    ) =>
      ctx.db.insert("prepTasks", {
        tenantId,
        eventDishId: onDish,
        eventId,
        dishId,
        name: `Prep ${status}`,
        category: "mise",
        taskType: "prep",
        isGenerated: false,
        quantity: 1,
        unit: "each",
        status: status as never,
        version: 3,
        ...extra,
      });
    const live: Record<string, string> = {};
    for (const status of LIVE)
      live[status] = String(await task(eventDishId, status));
    const completed = await task(eventDishId, "completed", {
      completedAt: 1,
    });
    const cancelled = await task(eventDishId, "cancelled", {
      cancelledAt: 1,
      cancellationReason: "Earlier reason",
    });
    const deleted = await task(eventDishId, "pending", { deletedAt: 1 });
    const otherDish = await task(otherEventDishId, "pending");
    return {
      eventDishId: eventDishId as string,
      live,
      settled: [completed, cancelled, deleted, otherDish] as string[],
    };
  })) as {
    eventDishId: string;
    live: Record<string, string>;
    settled: string[];
  };
}

async function rows(actor: Actor, ids: string[]) {
  return (await actor.run(async (ctx) =>
    Promise.all(ids.map((id) => ctx.db.get(id as never))),
  )) as Array<Record<string, unknown>>;
}

async function cancelledEvents(actor: Actor) {
  return (await actor.run(async (ctx) =>
    (await ctx.db.query("manifestEvents").collect()).filter(
      (row) => row.type === "PrepTaskCancelled",
    ),
  )) as Array<{ entityId: string; payload: Record<string, unknown> }>;
}

describe("EventDishRemoved → PrepTask.standDown (declared reaction)", () => {
  it("declares the stand-down as IR reactions, one per unfinished status", async () => {
    const root = path.resolve(__dirname, "../..");
    const { ir } = await compileProjectToIR({
      entries: [path.join(root, "src/app.manifest")],
      host: {
        readFile: (p: string) => readFile(p, "utf8"),
        resolvePath: (from: string, rel: string) => path.resolve(from, rel),
        fileExists: (p: string) =>
          access(p).then(
            () => true,
            () => false,
          ),
      },
      basePath: root,
    });
    const reactions = (ir!.reactions ?? []).filter(
      (r) =>
        r.event === "EventDishRemoved" &&
        r.targetEntity === "PrepTask" &&
        r.targetCommand === "standDown",
    );
    expect(reactions).toHaveLength(LIVE.length);
    for (const reaction of reactions) {
      expect(reaction.fanOut?.matchField).toBe("eventDishId");
      expect(reaction.match?.map((m) => m.field)).toEqual([
        "eventDishId",
        "status",
      ]);
      expect(reaction.params?.map((p) => p.name)).toEqual(["reason"]);
      expect(reaction.elseCreate).not.toBe(true);
    }
    const hooks = await readFile(
      path.join(root, "convex/lib/operationalEvents.ts"),
      "utf8",
    );
    expect(hooks).not.toMatch(/"EventDishRemoved"/);
  });

  it("stands down exactly the dish's unfinished prep, once, with the reason", async () => {
    const proof = harness();
    const tenantId = "tenant-prep-standdown";
    const manager = proof.asRole({
      subject: "event-manager",
      role: "event_manager",
      tenantId,
    });
    const seeded = await seed(manager, tenantId);
    const settledBefore = await rows(manager, seeded.settled);

    await proof.executeCommand(manager, M.EventDish_remove, {
      docId: seeded.eventDishId,
      reason: REASON,
      idempotencyKey: "remove-soup-once",
    });

    const live = await rows(manager, Object.values(seeded.live));
    for (const row of live) {
      expect(row.status).toBe("cancelled");
      expect(row.cancellationReason).toBe(REASON);
      expect(row.version).toBe(4);
    }
    expect(await rows(manager, seeded.settled)).toEqual(settledBefore);

    const events = await cancelledEvents(manager);
    expect(events.map((e) => e.entityId).sort()).toEqual(
      Object.values(seeded.live).sort(),
    );
    expect(events.map((e) => e.payload.previousStatus).sort()).toEqual(
      [...LIVE].sort(),
    );
    for (const event of events) expect(event.payload.reason).toBe(REASON);

    // Replaying the same removal returns the cached result and stands
    // nothing down again.
    await proof.executeCommand(manager, M.EventDish_remove, {
      docId: seeded.eventDishId,
      reason: REASON,
      idempotencyKey: "remove-soup-once",
    });
    expect(await cancelledEvents(manager)).toHaveLength(LIVE.length);
  });

  it("keeps authorization: the stand-down runs as the caller", async () => {
    const proof = harness();
    const tenantId = "tenant-prep-standdown-auth";
    const kitchen = proof.asRole({
      subject: "kitchen-staff",
      role: "kitchen_staff",
      tenantId,
    });
    const sales = proof.asRole({
      subject: "sales-manager",
      role: "sales_manager",
      tenantId,
    });
    const seeded = await seed(kitchen, tenantId);
    const before = await rows(kitchen, Object.values(seeded.live));

    // Kitchen staff may not remove a dish at all.
    await expect(
      proof.executeCommand(kitchen, M.EventDish_remove, {
        docId: seeded.eventDishId,
        reason: REASON,
      }),
    ).rejects.toThrow(/Guard 0 failed/);
    // A sales manager may remove a dish but may not stand prep down, so the
    // removal with unfinished prep is refused as a whole — as it was when the
    // hand-written branch called PrepTask_standDown as the same caller.
    await expect(
      proof.executeCommand(sales, M.EventDish_remove, {
        docId: seeded.eventDishId,
        reason: REASON,
      }),
    ).rejects.toThrow(/PrepTask|Guard 1 failed/);

    // Control: the same sales manager removes a dish whose prep is all
    // settled, so the refusal above came from the stand-down, not the removal.
    const settledDish = (await kitchen.run(async (ctx) => {
      const source = await ctx.db.get(seeded.eventDishId as never);
      const { _id, _creationTime, ...copy } = source as Record<string, never>;
      void _id;
      void _creationTime;
      const id = await ctx.db.insert("eventDishes", copy);
      await ctx.db.insert("prepTasks", {
        tenantId,
        eventDishId: id,
        eventId: copy.eventId,
        dishId: copy.dishId,
        name: "Done prep",
        category: "mise",
        taskType: "prep",
        isGenerated: false,
        quantity: 1,
        unit: "each",
        status: "completed",
        completedAt: 1,
        version: 0,
      });
      return id;
    })) as string;
    await proof.executeCommand(sales, M.EventDish_remove, {
      docId: settledDish,
      reason: REASON,
    });

    expect(await rows(kitchen, Object.values(seeded.live))).toEqual(before);
    expect(await cancelledEvents(kitchen)).toHaveLength(0);
    const [dish] = await rows(kitchen, [seeded.eventDishId]);
    expect(dish.deletedAt).toBeUndefined();
  });
});
