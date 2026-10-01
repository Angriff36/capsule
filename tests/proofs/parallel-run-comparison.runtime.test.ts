/**
 * PL-CUTOVER runtime proof (AC-285, AC-286, the identity leg of AC-632).
 * The daily TPP vs Capsule comparison:
 *  - reads TPP's side from the import's own saved rows (the real parser's
 *    output), so TPP totals, stage split, revenue and the salesperson,
 *    occasion, service style and venue splits are real, not zero;
 *  - compares each TPP event with the Capsule event its link names, by
 *    identity, and saves one difference per field that differs;
 *  - each difference opens both records, can be given to a person and
 *    settled; the next day's run clears a fixed one, reopens a "fixed" one
 *    that still differs, and keeps an accepted one;
 *  - each run books the next a day later; after the switch (go) it stops;
 *  - open differences are switch blockers; another company sees none of it;
 *    staff without import access cannot read or work it.
 * Synthetic workspaces only.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import { parseTppEvent, type TppEventRecord } from "../../convex/tppParser";
import { modules } from "./convex-test-modules";

const tenantId = "tenant-parallel-run";
const otherTenant = "tenant-parallel-run-other";
const DAY = 24 * 60 * 60 * 1000;

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

function isoDay(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function tppRow(
  id: string,
  startsAt: number,
  extra: Partial<TppEventRecord>,
): TppEventRecord {
  return {
    EventID: id,
    EventName: `TPP event ${id}`,
    EventDate: isoDay(startsAt),
    StartTime: "17:00",
    ExpectedCount: 80,
    ClientID: "C1",
    ...extra,
  } as TppEventRecord;
}

/** The link's saved row, exactly as the events import writes it. */
function rawOf(row: TppEventRecord): string {
  return JSON.stringify({ ...parseTppEvent(row), sourceRow: row });
}

type Row = Record<string, unknown>;

async function seed(t: ReturnType<typeof convexTest>) {
  const now = Date.now();
  return await t.run(async (ctx) => {
    const person = (
      tenant: string,
      given: string,
      role: string,
      subject: string,
    ) =>
      ctx.db.insert("people", {
        tenantId: tenant,
        givenName: given,
        familyName: "Proof",
        email: `${subject}@example.test`,
        role,
        authSubjectId: subject,
        employmentType: "full_time",
        status: "active",
        deletedAt: null,
        version: 1,
      } as never) as Promise<Id<"people">>;
    const olive = await person(tenantId, "Olive", "owner", "pr-owner");
    const sam = await person(tenantId, "Sam", "sales_manager", "pr-sales");
    const kim = await person(tenantId, "Kim", "kitchen_staff", "pr-kitchen");
    await person(otherTenant, "Otto", "owner", "pr-other-owner");

    const e1Start = now + 3 * DAY;
    const e2Start = now + 5 * DAY;
    const rows = {
      e1: tppRow("7001", e1Start, {
        ExpectedCount: 120,
        TotalRevenue: "$5,000.00",
        EventStatus: "Approved",
        SalespersonID: "S9",
        EventType: "Wedding",
        ServiceStyle: "Plated",
        VenueName: "Red Barn",
      }),
      e2: tppRow("7002", e2Start, {
        ExpectedCount: 80,
        TotalRevenue: "2400",
        EventStatus: "Approved",
        SalespersonID: "S9",
        EventType: "Corporate",
        ServiceStyle: "Buffet",
        VenueName: "Hall A",
      }),
      e3: tppRow("7003", now + 7 * DAY, {
        TotalRevenue: "900",
        EventStatus: "Quote",
        EventType: "Birthday",
      }),
      old: tppRow("6999", now - 60 * DAY, { TotalRevenue: "100" }),
    };
    const parsed = {
      e1: parseTppEvent(rows.e1),
      e2: parseTppEvent(rows.e2),
    };

    const event = (title: string, fields: Row) =>
      ctx.db.insert("events", {
        tenantId,
        title,
        eventType: "imported",
        stage: "planning",
        deletedAt: null,
        version: 1,
        ...fields,
      } as never) as Promise<Id<"events">>;
    const c1 = await event("Capsule 7001", {
      startsAt: parsed.e1.startsAt,
      expectedHeadcount: 100,
      quotedPrice: 4500,
      stage: "planning",
      assignedToId: olive,
      eventType: "wedding",
      serviceStyleName: "Buffet",
      venueName: "Red Barn",
    });
    const c2 = await event("Capsule 7002", {
      startsAt: parsed.e2.startsAt,
      expectedHeadcount: 80,
      quotedPrice: 2400,
      stage: "approved",
      assignedToId: sam,
      eventType: "corporate",
      serviceStyleName: "Buffet",
      venueName: "Hall A",
    });
    // Made in Capsule only.
    await event("Capsule only", { startsAt: now + 2 * DAY, quotedPrice: 300 });

    const link = (fields: Row) =>
      ctx.db.insert("externalRecordLinks", {
        tenantId,
        sourceSystem: "tpp_legacy",
        verified: false,
        conflictStatus: "resolved",
        deletedAt: null,
        version: 1,
        ...fields,
      } as never) as Promise<Id<"externalRecordLinks">>;
    await link({
      recordType: "person",
      capsuleEntity: "person",
      externalId: "S9",
      capsuleId: sam,
    });
    const l1 = await link({
      recordType: "event",
      capsuleEntity: "event_record",
      externalId: "7001",
      capsuleId: c1,
      rawSourceData: rawOf(rows.e1),
    });
    await link({
      recordType: "event",
      capsuleEntity: "event_record",
      externalId: "7002",
      capsuleId: c2,
      rawSourceData: rawOf(rows.e2),
    });
    await link({
      recordType: "event",
      capsuleEntity: "event_record",
      externalId: "7003",
      capsuleId: "",
      conflictStatus: "pending_conflict",
      rawSourceData: rawOf(rows.e3),
    });
    await link({
      recordType: "event",
      capsuleEntity: "event_record",
      externalId: "6999",
      capsuleId: "",
      rawSourceData: rawOf(rows.old),
    });
    return { olive, sam, kim, c1, c2, l1 };
  });
}

async function differences(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) =>
    (await ctx.db.query("parallelRunDifferences").collect()).filter(
      (row) => row.tenantId === tenantId,
    ),
  );
}

describe("runtime proof: the daily TPP comparison (PL-CUTOVER)", () => {
  it("compares by identity with real TPP numbers, and every difference can be assigned and settled", async () => {
    const t = convexTest(schema, modules);
    const { olive, sam, kim, c1, l1 } = await seed(t);
    const owner = t.withIdentity({ subject: "pr-owner", tenantId });
    const kitchen = t.withIdentity({ subject: "pr-kitchen", tenantId });
    const otherOwner = t.withIdentity({
      subject: "pr-other-owner",
      tenantId: otherTenant,
    });

    const first = await t.mutation(internal.parallelRun.compareTenant, {
      tenantId,
      book: true,
    });
    // AC-285: TPP's side is the import's own rows, non-zero and exact.
    const view = await owner.query(api.parallelRun.overview, {});
    const summary = view!.comparison!.summary!;
    expect(summary.tpp.events).toBe(3);
    expect(summary.tpp.revenue).toBe(5000 + 2400 + 900);
    expect(summary.tpp.byStage).toEqual({ approved: 2, quote: 1 });
    expect(summary.tpp.bySalesperson).toEqual({
      "Sam Proof": 2,
      "Not set": 1,
    });
    expect(summary.tpp.byOccasion).toEqual({
      wedding: 1,
      corporate: 1,
      birthday: 1,
    });
    expect(summary.tpp.byServiceStyle).toEqual({
      plated: 1,
      buffet: 1,
      "Not set": 1,
    });
    expect(summary.tpp.byVenue).toEqual({
      red_barn: 1,
      hall_a: 1,
      "Not set": 1,
    });
    expect(summary.capsule.events).toBe(3);
    expect(summary.capsule.revenue).toBe(4500 + 2400 + 300);
    expect(summary.onlyInTpp).toBe(1);
    expect(summary.onlyInCapsule).toBe(1);
    expect(first.comparedCount).toBe(2);

    // Field by field, by identity: 7001 differs, 7002 matches.
    let rows = await differences(t);
    expect(rows.map((row) => row.field).sort()).toEqual([
      "guests",
      "price",
      "salesperson",
      "service_style",
      "stage",
    ]);
    expect(rows.every((row) => row.externalId === "7001")).toBe(true);
    const byField = (field: string) => rows.find((row) => row.field === field)!;
    expect(byField("salesperson").sourceValue).toBe("Sam Proof");
    expect(byField("salesperson").capsuleValue).toBe("Olive Proof");
    expect(byField("price").sourceValue).toBe("$5000.00");
    expect(byField("price").capsuleValue).toBe("$4500.00");

    // AC-286: each row opens both records.
    const listed = view!.differences.find((row) => row.field === "guests")!;
    expect(listed.externalId).toBe("7001");
    expect(listed.tppTitle).toBe("TPP event 7001");
    expect(listed.eventId).toBe(String(c1));
    expect(listed.eventTitle).toBe("Capsule 7001");

    // The next run is booked a day later.
    const booked = await t.run(async (ctx) =>
      (await ctx.db.system.query("_scheduled_functions").collect()).filter(
        (job) =>
          job.name.includes("parallelRun") && job.state.kind === "pending",
      ),
    );
    expect(booked.length).toBe(1);
    expect(first.nextRunAt).toBeGreaterThan(Date.now() + DAY - 60_000);

    // Open differences hold the switch.
    const gate = (await owner.query(
      api.cutover.validateCutoverReadiness,
      {},
    )) as {
      openItems: Array<{ kind: string; externalId: string }>;
      blockers: string[];
    };
    expect(
      gate.openItems.filter((item) => item.kind === "comparison_difference"),
    ).toHaveLength(5);
    expect(gate.blockers.join(" ")).toContain(
      "5 difference(s) from the daily TPP comparison are not settled yet",
    );

    // Give one to a person; settle others.
    const guests = byField("guests");
    await owner.mutation(api.mutations.ParallelRunDifference_assign, {
      docId: guests._id,
      assignedToPersonId: kim,
      version: guests.version,
    });
    const price = byField("price");
    await owner.mutation(api.mutations.ParallelRunDifference_settle, {
      docId: price._id,
      resolution: "fixed",
      version: price.version,
    });
    const style = byField("service_style");
    await expect(
      owner.mutation(api.mutations.ParallelRunDifference_settle, {
        docId: style._id,
        resolution: "cleared",
        version: style.version,
      }),
    ).rejects.toThrow(/one system was fixed or the difference is fine/);
    await owner.mutation(api.mutations.ParallelRunDifference_settle, {
      docId: style._id,
      resolution: "accepted",
      note: "TPP had the old style",
      version: style.version,
    });
    expect(
      await owner.mutation(api.parallelRun.acceptAllOfField, {
        field: "stage",
        note: "TPP keeps its own stages",
      }),
    ).toEqual({ accepted: 1 });
    rows = await differences(t);
    expect(byField("guests").assignedToPersonId).toBe(kim);
    expect(byField("guests").assignedById).toBeTruthy();
    expect(byField("price").status).toBe("fixed");
    expect(byField("price").resolvedByUserId).toBeTruthy();
    expect(byField("stage").status).toBe("accepted");
    expect(byField("stage").resolutionNote).toBe("TPP keeps its own stages");

    // Kim fixes the guest count in Capsule; nobody fixed the price.
    await t.run(async (ctx) => {
      await ctx.db.patch(c1, { expectedHeadcount: 120 });
    });
    const second = await owner.mutation(api.parallelRun.compareNow, {});
    expect(second.dailyAlreadyBooked).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 20));
    await t.finishInProgressScheduledFunctions();
    rows = await differences(t);
    expect(byField("guests").status).toBe("cleared");
    expect(byField("price").status).toBe("open");
    expect(byField("price").resolvedByUserId).toBeNull();
    expect(byField("stage").status).toBe("accepted");
    expect(byField("service_style").status).toBe("accepted");
    expect(byField("salesperson").status).toBe("open");
    // "Compare now" did not book a second daily run.
    const stillBooked = await t.run(async (ctx) =>
      (await ctx.db.system.query("_scheduled_functions").collect()).filter(
        (job) =>
          job.name.includes("parallelRun") &&
          job.state.kind === "pending" &&
          (job.args[0] as { book: boolean }).book,
      ),
    );
    expect(stillBooked.length).toBe(1);

    // Another company sees nothing; staff without import access neither.
    const other = await otherOwner.query(api.parallelRun.overview, {});
    expect(other!.differences).toEqual([]);
    expect(other!.comparison).toBeNull();
    expect(await kitchen.query(api.parallelRun.overview, {})).toBeNull();
    await expect(
      kitchen.mutation(api.parallelRun.compareNow, {}),
    ).rejects.toThrow(/Only staff who run imports/);
    const salesperson = byField("salesperson");
    await expect(
      kitchen.mutation(api.mutations.ParallelRunDifference_assign, {
        docId: salesperson._id,
        assignedToPersonId: kim,
        version: salesperson.version,
      }),
    ).rejects.toThrow();
    await expect(
      otherOwner.mutation(api.mutations.ParallelRunDifference_assign, {
        docId: salesperson._id,
        version: salesperson.version,
      }),
    ).rejects.toThrow();

    // After the switch (go) the daily run stops booking itself.
    await t.run(async (ctx) => {
      await ctx.db.insert("cutoverDecisions", {
        tenantId,
        status: "go",
        decidedAt: Date.now(),
        decidedBy: String(olive),
        reason: "switched",
        rollbackPlan: "restore",
      } as never);
    });
    const after = await t.mutation(internal.parallelRun.compareTenant, {
      tenantId,
      book: true,
    });
    expect(after.nextRunAt).toBeNull();
    void sam;
    void l1;
  });
});
