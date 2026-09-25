/**
 * Runtime proof (AC-239 first slice): Event.archive hides a live Event from
 * the active list and Event.reactivate brings it back — without moving the
 * stage, touching money/headcount, or soft-deleting the row. Archive is a
 * visibility flag, not a new EventStage: the same command must work on any
 * live stage, refuse a second archive, refuse a kitchen archive, refuse a
 * reactivate of a never-archived Event, and require a real reason.
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
const HEAD_COUNT = 40;
const QUOTED = 4500;
const BUDGET = 3000;
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
      companyName: `Archive proof client ${tenantId} ${title}`,
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
      expectedHeadcount: HEAD_COUNT,
      primaryContactName: "Casey Archive",
      budgetAmount: BUDGET,
      quotedPrice: QUOTED,
    },
  )) as { docId: string };
  return event.docId;
}

type EventDoc = {
  stage: string;
  archivedAt: number | null;
  archiveReason: string | null;
  deletedAt: number | null;
  quotedPrice: number | null;
  budgetAmount: number | null;
  expectedHeadcount: number | null;
  version: number;
};

/** Raw row read: archive state lives on the live Event document itself.
 * Optional fields a row never wrote come back undefined; normalize to null. */
async function liveEvent(actor: Role, eventId: string): Promise<EventDoc> {
  const doc = (await actor.run(async (ctx) =>
    ctx.db.get(eventId as never),
  )) as EventDoc;
  return {
    ...doc,
    archivedAt: doc.archivedAt ?? null,
    archiveReason: doc.archiveReason ?? null,
    deletedAt: doc.deletedAt ?? null,
  };
}

type LifecycleRow = {
  type: string;
  entityId: string;
  payload: Record<string, unknown>;
};

async function lifecycleRows(
  actor: Role,
  eventId: string,
  type: string,
): Promise<LifecycleRow[]> {
  const rows = (await actor.run(async (ctx) =>
    ctx.db.query("manifestEvents").collect(),
  )) as LifecycleRow[];
  return rows.filter((row) => row.type === type && row.entityId === eventId);
}

/** Every live (never soft-deleted) Event row for this tenant. */
async function liveEventCount(actor: Role, tenantId: string): Promise<number> {
  const rows = (await actor.run(async (ctx) =>
    ctx.db.query("events").collect(),
  )) as Array<{ tenantId: string; deletedAt: number | null }>;
  return rows.filter(
    (row) => row.tenantId === tenantId && row.deletedAt == null,
  ).length;
}

describe("event archive and reactivate (AC-239)", () => {
  it("archives a planning event without changing stage or money", async () => {
    const proof = harness();
    const tenantId = "tenant-ac239-archive";
    const { events } = rolesFor(proof, tenantId);
    const eventId = await createEvent(proof, tenantId, "AC-239 archive");

    const reason = "Last year's repeat, hide from upcoming";
    await proof.executeCommand(events, M.Event_archive, {
      docId: eventId,
      version: 1,
      reason,
    });

    expect(await liveEventCount(events, tenantId)).toBe(1);
    const doc = await liveEvent(events, eventId);
    expect(doc.deletedAt).toBeNull();
    expect(doc.stage).toBe("planning");
    expect(doc.archivedAt).toEqual(expect.any(Number));
    expect(doc.archivedAt as unknown as number).toBeGreaterThan(0);
    expect(doc.archiveReason).toBe(reason);
    expect(doc.quotedPrice).toBe(QUOTED);
    expect(doc.budgetAmount).toBe(BUDGET);
    expect(doc.expectedHeadcount).toBe(HEAD_COUNT);

    const rows = await lifecycleRows(events, eventId, "EventArchived");
    expect(rows).toHaveLength(1);
    expect(rows[0].payload.eventId).toBe(eventId);
    expect(rows[0].payload.tenantId).toBe(tenantId);
    expect(rows[0].payload.reason).toBe(reason);
  });

  it("reactivates an archived event and keeps the same stage", async () => {
    const proof = harness();
    const tenantId = "tenant-ac239-reactivate";
    const { events } = rolesFor(proof, tenantId);
    const eventId = await createEvent(proof, tenantId, "AC-239 reactivate");

    await proof.executeCommand(events, M.Event_archive, {
      docId: eventId,
      version: 1,
      reason: "Duplicate booking, hold it out of the list",
    });
    await proof.executeCommand(events, M.Event_reactivate, {
      docId: eventId,
      version: 2,
    });

    const doc = await liveEvent(events, eventId);
    expect(doc.archivedAt).toBeNull();
    expect(doc.archiveReason).toBeNull();
    expect(doc.deletedAt).toBeNull();
    expect(doc.stage).toBe("planning");
    expect(doc.quotedPrice).toBe(QUOTED);
    expect(doc.budgetAmount).toBe(BUDGET);
    expect(doc.expectedHeadcount).toBe(HEAD_COUNT);

    expect(await lifecycleRows(events, eventId, "EventArchived")).toHaveLength(
      1,
    );
    const reactivated = await lifecycleRows(
      events,
      eventId,
      "EventReactivated",
    );
    expect(reactivated).toHaveLength(1);
    expect(reactivated[0].payload.eventId).toBe(eventId);
    expect(reactivated[0].payload.tenantId).toBe(tenantId);
  });

  it("refuses a second archive, a kitchen archive, and reactivate of a live event", async () => {
    const proof = harness();
    const tenantId = "tenant-ac239-refusals";
    const { events, kitchen } = rolesFor(proof, tenantId);
    const eventId = await createEvent(proof, tenantId, "AC-239 refusals");

    // Kitchen cannot archive: the role lacks eventManageAccess.
    await expect(
      proof.executeCommand(kitchen, M.Event_archive, {
        docId: eventId,
        version: 1,
        reason: "Kitchen should not hide events",
      }),
    ).rejects.toThrow(/Guard|Event and sales staff/);
    const afterKitchen = await liveEvent(events, eventId);
    expect(afterKitchen.archivedAt).toBeNull();
    expect(await lifecycleRows(events, eventId, "EventArchived")).toHaveLength(
      0,
    );

    // The event manager archives successfully.
    await proof.executeCommand(events, M.Event_archive, {
      docId: eventId,
      version: 1,
      reason: "Stale inquiry, hide from upcoming",
    });
    expect(await lifecycleRows(events, eventId, "EventArchived")).toHaveLength(
      1,
    );

    // A second archive is refused and writes no second row.
    await expect(
      proof.executeCommand(events, M.Event_archive, {
        docId: eventId,
        version: 2,
        reason: "Second archive must not write",
      }),
    ).rejects.toThrow(/Guard/);
    expect(await lifecycleRows(events, eventId, "EventArchived")).toHaveLength(
      1,
    );
    expect((await liveEvent(events, eventId)).stage).toBe("planning");

    // A never-archived event cannot be reactivated.
    const secondEventId = await createEvent(
      proof,
      tenantId,
      "AC-239 refusals second",
    );
    await expect(
      proof.executeCommand(events, M.Event_reactivate, {
        docId: secondEventId,
        version: 1,
      }),
    ).rejects.toThrow(/Guard/);

    // An empty reason is refused and archives nothing.
    await expect(
      proof.executeCommand(events, M.Event_archive, {
        docId: secondEventId,
        version: 1,
        reason: "",
      }),
    ).rejects.toThrow("Archive reason is required");
    expect((await liveEvent(events, secondEventId)).archivedAt).toBeNull();
    expect(
      await lifecycleRows(events, secondEventId, "EventArchived"),
    ).toHaveLength(0);
  });
});
