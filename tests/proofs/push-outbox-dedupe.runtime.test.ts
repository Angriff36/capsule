/**
 * Runtime proof (AC-191 web push slice): phone notifications go out once.
 *
 * Run-of-show alerts (convex/runOfShowAlerts.ts + runOfShowAlertsSend.ts)
 * dedupe against the manifestEvents ledger: repeated scans inside one fire
 * window push each alert once per device, a push no device took is tried
 * again on the next scan, a device the push service says is gone is retired
 * and never pushed again, a scan that no longer owns the loop sends nothing,
 * and the alerts of one tenant never reach the people or devices of another.
 *
 * Team chat push (convex/teamChatPushSend.ts) is scheduled once per saved
 * message by convex/teamChatSend.ts; one delivery pushes each recipient
 * device once, never the devices of the sender or of another tenant, and a
 * message older than five minutes wakes no phone.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";

const push = vi.hoisted(() => ({
  sent: [] as string[],
  failWith: new Map<string, number>(),
}));

vi.mock("web-push", () => ({
  default: {
    setVapidDetails: () => undefined,
    sendNotification: async (subscription: { endpoint: string }) => {
      const status = push.failWith.get(subscription.endpoint);
      if (status != null) {
        throw Object.assign(new Error("push failed"), { statusCode: status });
      }
      push.sent.push(subscription.endpoint);
      return { statusCode: 201 };
    },
  },
}));

const setup = () => convexTest(schema, modules);
type TestConvex = ReturnType<typeof setup>;

const TENANT = "tenant-push-a";
const OTHER_TENANT = "tenant-push-b";

beforeEach(() => {
  push.sent.length = 0;
  push.failWith.clear();
  vi.stubEnv("VAPID_PUBLIC_KEY", "proof-public");
  vi.stubEnv("VAPID_PRIVATE_KEY", "proof-private");
  vi.stubEnv("VAPID_SUBJECT", "mailto:proof@example.test");
  vi.stubEnv(
    "CONVEX_FIELD_ENCRYPTION_KEY",
    "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=",
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

async function addPerson(
  t: TestConvex,
  tenantId: string,
  subject: string,
  endpoints: string[],
): Promise<Id<"people">> {
  return await t.run(async (ctx) => {
    const personId = await ctx.db.insert("people", {
      tenantId,
      givenName: "Pat",
      familyName: subject,
      email: subject + "@example.test",
      role: "kitchen_staff",
      employmentType: "full_time",
      status: "active",
      authSubjectId: subject,
      version: 1,
    });
    await ctx.db.insert("chatNotifyPreferences", {
      tenantId,
      ownerId: subject,
      enabled: true,
      version: 1,
    });
    for (const endpoint of endpoints) {
      await ctx.db.insert("pushSubscriptions", {
        tenantId,
        authSubjectId: subject,
        personId,
        endpoint,
        p256dh: "p256dh-" + endpoint,
        auth: "auth-" + endpoint,
        version: 1,
      });
    }
    return personId;
  });
}

async function addTaskStartingNow(
  t: TestConvex,
  tenantId: string,
  crew: Id<"people">[],
  assigneePersonIds?: string[],
): Promise<string> {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const eventId = await ctx.db.insert("events", {
      tenantId,
      title: "Garden Wedding",
      eventType: "wedding",
      stage: "executing",
      startsAt: now,
      version: 1,
    });
    for (const personId of crew) {
      await ctx.db.insert("eventAssignments", {
        tenantId,
        eventId,
        personId,
        role: "server",
        status: "confirmed",
        version: 1,
      });
    }
    const activityId = await ctx.db.insert("eventTimelineActivities", {
      tenantId,
      eventId,
      name: "Pass appetizers",
      startsAt: now - 1_000,
      assigneePersonIds,
      version: 1,
    });
    return String(activityId);
  });
}

async function claim(t: TestConvex, tenantId: string): Promise<string> {
  const generation = await t.mutation(internal.runOfShowAlerts.claimLoop, {
    tenantId,
  });
  if (generation == null) throw new Error("loop already owned");
  return generation;
}

const pause = () => new Promise((resolve) => setTimeout(resolve, 5));

async function tick(t: TestConvex, tenantId: string, generation: string) {
  await t.action(internal.runOfShowAlerts.tick, {
    tenantId,
    scheduleNext: false,
    generation,
  });
}

async function sentRows(t: TestConvex) {
  return await t.run(async (ctx) =>
    (await ctx.db.query("manifestEvents").collect())
      .filter((row) => row.type === "RunAlertSent")
      .map((row) => row.payload as { activityId: string; kind: string }),
  );
}

async function liveEndpoints(t: TestConvex): Promise<string[]> {
  return await t.run(async (ctx) =>
    (await ctx.db.query("pushSubscriptions").collect())
      .filter((row) => row.deletedAt == null)
      .map((row) => row.endpoint)
      .sort(),
  );
}

describe("run-of-show push alerts go out once", () => {
  it("repeated scans push the start alert once to each crew device", async () => {
    const t = setup();
    const cook = await addPerson(t, TENANT, "cook", ["phone-1", "tablet-1"]);
    const server = await addPerson(t, TENANT, "server", ["phone-2"]);
    const activityId = await addTaskStartingNow(t, TENANT, [cook, server]);
    const generation = await claim(t, TENANT);

    for (let scan = 0; scan < 3; scan += 1) await tick(t, TENANT, generation);

    expect([...push.sent].sort()).toEqual(["phone-1", "phone-2", "tablet-1"]);
    expect(await sentRows(t)).toEqual([{ activityId, kind: "start" }]);
  });

  it("a push no device took is tried again on the next scan, then sent once", async () => {
    const t = setup();
    const cook = await addPerson(t, TENANT, "cook", ["phone-1"]);
    const activityId = await addTaskStartingNow(t, TENANT, [cook]);
    const generation = await claim(t, TENANT);

    push.failWith.set("phone-1", 503);
    await tick(t, TENANT, generation);
    expect(push.sent).toEqual([]);
    expect(await sentRows(t)).toEqual([]);

    push.failWith.clear();
    await tick(t, TENANT, generation);
    await tick(t, TENANT, generation);
    expect(push.sent).toEqual(["phone-1"]);
    expect(await sentRows(t)).toEqual([{ activityId, kind: "start" }]);
  });

  it("a device the push service says is gone is retired and never pushed again", async () => {
    const t = setup();
    const cook = await addPerson(t, TENANT, "cook", ["old-phone", "phone-1"]);
    await addTaskStartingNow(t, TENANT, [cook]);
    const generation = await claim(t, TENANT);

    push.failWith.set("old-phone", 410);
    await tick(t, TENANT, generation);
    await tick(t, TENANT, generation);

    expect(push.sent).toEqual(["phone-1"]);
    expect(await liveEndpoints(t)).toEqual(["phone-1"]);
  });

  it("a scan that no longer owns the loop sends nothing", async () => {
    const t = setup();
    const cook = await addPerson(t, TENANT, "cook", ["phone-1"]);
    await addTaskStartingNow(t, TENANT, [cook]);
    const oldGeneration = await claim(t, TENANT);
    // A manager turns alerts off, then on again a moment later.
    await pause();
    await t.mutation(internal.runOfShowAlerts.recordDisabled, {
      tenantId: TENANT,
    });
    await pause();
    const newGeneration = await claim(t, TENANT);

    await tick(t, TENANT, oldGeneration);
    expect(push.sent).toEqual([]);

    await tick(t, TENANT, newGeneration);
    expect(push.sent).toEqual(["phone-1"]);
  });

  it("the alerts of one tenant never reach the people or devices of another", async () => {
    const t = setup();
    const cook = await addPerson(t, TENANT, "cook", ["phone-1"]);
    const outsider = await addPerson(t, OTHER_TENANT, "outsider", ["phone-9"]);
    const activityId = await addTaskStartingNow(
      t,
      TENANT,
      [cook],
      [String(cook), String(outsider)],
    );
    const otherGeneration = await claim(t, OTHER_TENANT);
    const generation = await claim(t, TENANT);

    await tick(t, OTHER_TENANT, otherGeneration);
    expect(push.sent).toEqual([]);

    await tick(t, TENANT, generation);
    expect(push.sent).toEqual(["phone-1"]);
    expect(await sentRows(t)).toEqual([{ activityId, kind: "start" }]);
  });
});

async function addMessage(
  t: TestConvex,
  tenantId: string,
  sender: Id<"people">,
  recipient: Id<"people">,
): Promise<Id<"staffMessages">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("staffMessages", {
      tenantId,
      senderPersonId: sender,
      recipientPersonId: recipient,
      senderAuthSubjectId: (await ctx.db.get(sender))?.authSubjectId ?? null,
      body: "Ice is in the walk-in",
      createdAt: Date.now(),
      version: 1,
    }),
  );
}

async function scheduledPushes(t: TestConvex) {
  return await t.run(async (ctx) =>
    (await ctx.db.system.query("_scheduled_functions").collect()).filter(
      (job) => job.name.includes("teamChatPushSend"),
    ),
  );
}

describe("team chat push goes out once per message", () => {
  it("one delivery pushes each recipient device once and skips the sender", async () => {
    const t = setup();
    const sender = await addPerson(t, TENANT, "sender", ["sender-phone"]);
    const recipient = await addPerson(t, TENANT, "recipient", [
      "phone-1",
      "tablet-1",
    ]);
    const messageId = await addMessage(t, TENANT, sender, recipient);

    await t.action(internal.teamChatPushSend.deliver, { messageId });

    expect([...push.sent].sort()).toEqual(["phone-1", "tablet-1"]);
  });

  it("a resent draft with the same key schedules one push, not two", async () => {
    const t = setup();
    const sender = await addPerson(t, TENANT, "sender", []);
    const recipient = await addPerson(t, TENANT, "recipient", ["phone-1"]);
    const staff = t.withIdentity({
      subject: "sender",
      org_id: TENANT,
      role: "kitchen_staff",
    });
    const send = () =>
      staff.mutation(api.teamChatSend.sendWithFiles, {
        recipientPersonId: String(recipient),
        body: "Ice is in the walk-in",
        files: [],
        idempotencyKey: "draft-1",
        sender: { tenantId: TENANT, personId: String(sender) },
      });

    const first = await send();
    const second = await send();

    expect(second.docId).toBe(first.docId);
    expect(await scheduledPushes(t)).toHaveLength(1);
  });

  it("the devices of another tenant are never pushed, even when addressed", async () => {
    const t = setup();
    const sender = await addPerson(t, TENANT, "sender", []);
    const outsider = await addPerson(t, OTHER_TENANT, "outsider", ["phone-9"]);
    const messageId = await addMessage(t, TENANT, sender, outsider);

    await t.action(internal.teamChatPushSend.deliver, { messageId });

    expect(push.sent).toEqual([]);
  });

  it("a message older than five minutes wakes no phone", async () => {
    const t = setup();
    const sender = await addPerson(t, TENANT, "sender", []);
    const recipient = await addPerson(t, TENANT, "recipient", ["phone-1"]);
    const messageId = await addMessage(t, TENANT, sender, recipient);

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 6 * 60_000);
    await t.action(internal.teamChatPushSend.deliver, { messageId });

    expect(push.sent).toEqual([]);
  });
});
