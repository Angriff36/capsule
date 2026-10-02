/**
 * PL-CUTOVER runtime proof (AC-174, PR14-08): a synthetic cutover rehearsal.
 * The real import path brings over contacts, a venue and events; then:
 *  - source counts reconcile: every source row has exactly one link, the
 *    one event whose client never came over is the only unresolved row and
 *    the switch check names it;
 *  - the daily comparison finds the cleanly imported events identical to
 *    their TPP rows (no difference) and counts the unresolved one;
 *  - opening stock as-of, money basis and backup are recorded and the
 *    switch check reads them;
 *  - importing the same rows again adds nothing (no doubled records);
 *  - the import sends nothing and charges nothing: no outside-send job is
 *    booked, and no payment, vendor order or client message is made;
 *  - role access: kitchen staff cannot import or see the comparison.
 * Synthetic workspace only; nothing leaves the test backend.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

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

type Actor = ReturnType<ReturnType<typeof harness>["asRole"]>;
type ActionRunner = {
  action: (fn: unknown, args?: unknown) => Promise<unknown>;
};
const asActions = (actor: Actor) => actor as unknown as ActionRunner;
type Row = Record<string, unknown> & { tenantId?: string; deletedAt?: unknown };

const tenantId = "tenant-cutover-rehearsal";
const DAY = 24 * 60 * 60 * 1000;

function isoDay(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function rows(owner: Actor, table: string): Promise<Row[]> {
  return (await owner.run(async (ctx) =>
    (await ctx.db.query(table as never).collect()).filter(
      (row) => (row as Row).tenantId === tenantId,
    ),
  )) as Row[];
}

/** Modules that talk to outside services (email, text, push, webhooks, money, calendars, books). */
const OUTSIDE_SENDERS =
  /webhookDeliveries|smsAlerts|emailNotifications|teamChatPushSend|schedulePushSend|googleCalendar|qboSync|invoicePayments|staffSignInEmail|personEmail/;

describe("runtime proof: cutover rehearsal (AC-174)", () => {
  it("reconciled synthetic migration without external effects", async () => {
    const proof = harness();
    const owner = proof.asRole({
      subject: "rehearsal-owner",
      role: "owner",
      tenantId,
    });
    const kitchen = proof.asRole({
      subject: "rehearsal-cook",
      role: "kitchen_staff",
      tenantId,
    });

    const contacts = [
      { ContactID: "C-1", FirstName: "Ana", LastName: "Rehearsal" },
      { ContactID: "C-2", FirstName: "Ben", LastName: "Rehearsal" },
    ];
    const venues = [
      {
        VenueID: "V-1",
        VenueName: "Lake Hall",
        VenueType: "Office",
        Address: "1 Pine Street",
        City: "Seattle",
        State: "WA",
        ZipCode: "98101",
        Capacity: 120,
      },
    ];
    const soon = Date.now() + 4 * DAY;
    const events = [
      {
        EventID: "E-1",
        EventName: "Ana's wedding",
        ClientID: "C-1",
        EventDate: isoDay(soon),
        StartTime: "17:00",
        EndTime: "22:00",
        ExpectedCount: 90,
        TotalRevenue: 6400,
        EventStatus: "Planning",
        EventType: "Wedding",
        VenueID: "V-1",
        VenueName: "Lake Hall",
      },
      {
        EventID: "E-2",
        EventName: "Ben's retirement",
        ClientID: "C-2",
        EventDate: isoDay(soon + DAY),
        StartTime: "12:00",
        ExpectedCount: 40,
        TotalRevenue: 1800,
        EventStatus: "Planning",
        EventType: "Retirement",
      },
      {
        // Its client was never exported: it waits on the match-up page.
        EventID: "E-3",
        EventName: "Unknown client party",
        ClientID: "C-404",
        EventDate: isoDay(soon + 2 * DAY),
        StartTime: "18:00",
        ExpectedCount: 25,
        TotalRevenue: 900,
        EventStatus: "Planning",
      },
    ];
    const bringOver = async () => {
      for (const [datasetType, data] of [
        ["contacts", contacts],
        ["venues", venues],
        ["events", events],
      ] as const) {
        await asActions(owner).action(api.quickImport.importFile, {
          datasetType,
          sourceSystem: "tpp_legacy",
          rows: data,
        });
      }
    };
    await bringOver();

    // Source counts reconcile: one link per source row, by kind.
    const links = (await rows(owner, "externalRecordLinks")).filter(
      (link) => link.deletedAt == null,
    );
    const linksOf = (recordType: string) =>
      links.filter((link) => link.recordType === recordType);
    expect(linksOf("contact")).toHaveLength(2);
    expect(linksOf("venue")).toHaveLength(1);
    expect(linksOf("event")).toHaveLength(3);
    const unresolved = links.filter(
      (link) => link.conflictStatus === "pending_conflict",
    );
    expect(unresolved.map((link) => link.externalId)).toEqual(["E-3"]);
    const madeEvents = (await rows(owner, "events")).filter(
      (event) => event.deletedAt == null,
    );
    expect(madeEvents).toHaveLength(2);

    // The daily comparison: imported events agree with their TPP rows.
    const compared = (await owner.mutation(internal.parallelRun.compareTenant, {
      tenantId,
      book: false,
    })) as {
      comparedCount: number;
      newCount: number;
      summary: {
        onlyInTpp: number;
        tpp: { revenue: number };
        capsule: { revenue: number };
      };
    };
    expect(compared.comparedCount).toBe(2);
    expect(compared.newCount).toBe(0);
    expect(compared.summary.onlyInTpp).toBe(1);
    expect(compared.summary.tpp.revenue).toBe(6400 + 1800 + 900);
    expect(compared.summary.capsule.revenue).toBe(6400 + 1800);

    // Opening stock, money basis and backup go on the record.
    const frozenAt = Date.now() - 60_000;
    await owner.mutation(api.cutover.saveCutoverFacts, {
      sourceFrozenAt: frozenAt,
      openingStockAsOf: frozenAt,
      financialMode: "reference_history",
      backupEvidence: "Rehearsal backup restored into a scratch backend",
    });
    const gate = (await owner.query(
      api.cutover.validateCutoverReadiness,
      {},
    )) as {
      checks: Record<string, { passed: boolean }>;
      openItems: Array<{ kind: string; externalId: string }>;
    };
    expect(gate.checks.openingStock.passed).toBe(true);
    expect(gate.checks.financialMode.passed).toBe(true);
    expect(gate.checks.backup.passed).toBe(true);
    expect(gate.checks.zeroCriticalMappings.passed).toBe(false);
    expect(gate.openItems).toEqual([
      expect.objectContaining({ kind: "unmatched_link", externalId: "E-3" }),
    ]);

    // The same rows again: nothing doubled.
    await bringOver();
    expect(
      (await rows(owner, "events")).filter((event) => event.deletedAt == null),
    ).toHaveLength(2);
    expect(
      (await rows(owner, "clients")).filter(
        (client) => client.deletedAt == null,
      ),
    ).toHaveLength(2);
    expect(
      (await rows(owner, "externalRecordLinks")).filter(
        (link) => link.deletedAt == null,
      ),
    ).toHaveLength(links.length);

    // Nothing sent, charged or ordered.
    type SystemDb = {
      system: {
        query: (table: "_scheduled_functions") => {
          collect: () => Promise<Array<{ name: string }>>;
        };
      };
    };
    const jobs = await owner.run(async (ctx) =>
      (
        await (ctx.db as unknown as SystemDb).system
          .query("_scheduled_functions")
          .collect()
      ).map((job) => job.name),
    );
    expect(jobs.filter((name) => OUTSIDE_SENDERS.test(name))).toEqual([]);
    for (const table of [
      "payments",
      "vendorOrders",
      "messages",
      "staffMessages",
    ]) {
      expect(await rows(owner, table)).toEqual([]);
    }

    // Role access: kitchen staff can neither import nor see the comparison.
    await expect(
      asActions(kitchen).action(api.quickImport.importFile, {
        datasetType: "contacts",
        sourceSystem: "tpp_legacy",
        rows: contacts,
      }),
    ).rejects.toThrow(/Only organization managers can run imports/);
    expect(await kitchen.query(api.parallelRun.overview, {})).toBeNull();
  });
});
