/**
 * Runtime proof (CF-3-1; AC-214, AC-215, AC-216, AC-217): an imported event
 * and a newly created event both open, take an edit through a governed
 * command, read the same after a fresh read, and agree between the event
 * list and the event page read. A missing, deleted, or other-company event
 * reads as the same nothing, so the page shows one "Event unavailable"
 * state (tests/features/events/event-detail-route-guard.test.ts) and never
 * tells whether the event exists.
 *
 * The old is_active crash has no field left to fail on: events carry no
 * is_active / isActive field, and "active" means not deleted (deletedAt).
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const TENANT = "tenant-event-open-list-detail";
const OTHER = "tenant-event-open-list-detail-other";

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

type EventRow = Record<string, unknown> & {
  _id: string;
  title: string;
  stage: string;
  startsAt: number;
  expectedHeadcount: number;
  version: number;
  deletedAt?: number | null;
};

describe("runtime proof: events open, edit and list the same (AC-214..217)", () => {
  it("imported and new events agree in list and detail; missing, deleted and other-company events read as nothing", async () => {
    const proof = createManifestTestContext({
      convexTest: convexTest as never,
      schema,
      modules,
    });
    const owner = proof.asRole({
      subject: "event-open-owner",
      role: "owner",
      tenantId: TENANT,
    });
    const outsider = proof.asRole({
      subject: "event-open-outsider",
      role: "owner",
      tenantId: OTHER,
    });
    const action = (fn: unknown, args: unknown) =>
      (
        owner as unknown as {
          action: (f: unknown, a: unknown) => Promise<unknown>;
        }
      ).action(fn, args);
    const getEvent = (actor: typeof owner, id: string) =>
      actor.query(api.queries.getEvent, {
        id: id as never,
      }) as Promise<EventRow | null>;
    const listEvents = async (actor: typeof owner) =>
      (await actor.query(api.queries.listEvent, {})) as EventRow[];

    // An imported event: the TPP contact and event come in through the import.
    await action(api.quickImport.importFile, {
      datasetType: "contacts",
      sourceSystem: "tpp_legacy",
      rows: [{ ContactID: "OL-C1", FirstName: "Ines", LastName: "Ward" }],
    });
    await action(api.quickImport.importFile, {
      datasetType: "events",
      sourceSystem: "tpp_legacy",
      rows: [
        {
          EventID: "OL-E1",
          EventName: "Ward Anniversary",
          ClientID: "OL-C1",
          EventDate: "2026-11-14",
          StartTime: "18:00",
          EndTime: "22:00",
          ExpectedCount: 40,
          EventStatus: "Definite",
        },
      ],
    });
    const link = (await owner.run(async (ctx) =>
      (await ctx.db.query("externalRecordLinks").collect()).find(
        (row) =>
          (row as { externalId?: string }).externalId === "OL-E1" &&
          (row as { tenantId?: string }).tenantId === TENANT,
      ),
    )) as { capsuleId: string } | undefined;
    const importedId = link?.capsuleId ?? "";
    expect(importedId).not.toBe("");

    // A newly created event.
    const client = (await proof.executeCommand(
      owner,
      api.mutations.Client_createViaRegister,
      { clientType: "company", companyName: "Open List Co" },
    )) as { docId: string };
    const created = (await proof.executeCommand(
      owner,
      api.mutations.Event_createViaPlanEngagement,
      {
        clientId: client.docId,
        title: "Open List Lunch",
        eventType: "catering",
        startsAt: Date.UTC(2026, 10, 20, 16, 0),
        endsAt: Date.UTC(2026, 10, 20, 19, 0),
        expectedHeadcount: 25,
        primaryContactName: "Pat Planner",
        budgetAmount: 1000,
        quotedPrice: 1200,
      },
    )) as { docId: string };
    const nativeId = created.docId;

    // AC-214: no is_active field to fail on, in either kind of event.
    for (const id of [importedId, nativeId]) {
      const raw = (await owner.run(async (ctx) =>
        ctx.db.get(id as never),
      )) as Record<string, unknown>;
      expect(raw).not.toHaveProperty("is_active");
      expect(raw).not.toHaveProperty("isActive");
    }

    // AC-217: both take an edit through a governed command.
    for (const [id, headcount] of [
      [importedId, 44],
      [nativeId, 30],
    ] as const) {
      const before = (await getEvent(owner, id))!;
      await proof.executeCommand(owner, api.mutations.Event_changeHeadcount, {
        docId: id,
        version: before.version,
        newHeadcount: headcount,
      } as never);
    }

    // AC-215 / AC-217: after the edit, a fresh list read and a fresh detail
    // read agree on every event, field by field.
    const listed = await listEvents(owner);
    for (const [id, headcount] of [
      [importedId, 44],
      [nativeId, 30],
    ] as const) {
      const fromList = listed.find((row) => row._id === id);
      const fromDetail = await getEvent(owner, id);
      expect(fromList).toBeDefined();
      expect(fromDetail).not.toBeNull();
      expect(fromDetail!.expectedHeadcount).toBe(headcount);
      for (const field of [
        "title",
        "stage",
        "startsAt",
        "endsAt",
        "expectedHeadcount",
        "clientId",
        "version",
      ]) {
        expect(fromDetail![field]).toEqual(fromList![field]);
      }
    }
    expect(listed.find((row) => row._id === importedId)!.title).toBe(
      "Ward Anniversary",
    );

    // AC-216: another company sees nothing of either event.
    expect(await getEvent(outsider, importedId)).toBeNull();
    expect(await getEvent(outsider, nativeId)).toBeNull();
    expect(
      (await listEvents(outsider)).filter(
        (row) => row._id === importedId || row._id === nativeId,
      ),
    ).toHaveLength(0);

    // A deleted event and an id that no longer exists read the same nothing.
    const gone = (await proof.executeCommand(
      owner,
      api.mutations.Event_createViaPlanEngagement,
      {
        clientId: client.docId,
        title: "Gone Event",
        eventType: "catering",
        startsAt: Date.UTC(2026, 10, 21, 16, 0),
        endsAt: Date.UTC(2026, 10, 21, 19, 0),
        expectedHeadcount: 10,
        primaryContactName: "Pat Planner",
        budgetAmount: 500,
        quotedPrice: 600,
      },
    )) as { docId: string };
    await owner.run(async (ctx) => {
      await ctx.db.patch(nativeId as never, { deletedAt: Date.now() } as never);
      await (ctx.db as unknown as { delete(id: never): Promise<void> }).delete(
        gone.docId as never,
      );
    });
    const reads = [
      await getEvent(owner, nativeId),
      await getEvent(owner, gone.docId),
      await getEvent(outsider, importedId),
    ];
    expect(reads).toEqual([null, null, null]);
    expect(
      (await listEvents(owner)).some(
        (row) => row._id === nativeId || row._id === gone.docId,
      ),
    ).toBe(false);
  });
});
