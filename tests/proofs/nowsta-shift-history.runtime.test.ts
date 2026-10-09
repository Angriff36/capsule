/**
 * Runtime proof: past Nowsta shifts come in as finished shifts and nothing
 * else (PL-REPLACEMENT-PROOF, Nowsta history).
 *
 * A row lands as one completed Shift of its worker on its event, with its
 * planned and worked times, plus one import link. No Manifest event, no time
 * entry (so nothing reaches the time sheet or payroll), no schedule notice and
 * nothing scheduled. A second read finds it already in; a shift still ahead,
 * another workspace's worker and a person who does not schedule shifts are
 * refused. Synthetic workspace.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";

const tenantId = "tenant-nowsta-history";
const HOUR = 3_600_000;
const DAY_START = new Date(2026, 5, 20).getTime();

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5jqU=";
  }
});

async function refused(call: () => Promise<unknown>) {
  try {
    await call();
    return false;
  } catch {
    return true;
  }
}

async function seed(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const base = {
      familyName: "Proof",
      employmentType: "full_time",
      status: "active",
      deletedAt: null,
      version: 1,
    };
    await ctx.db.insert("people", {
      ...base,
      tenantId,
      givenName: "Olive",
      email: "olive@example.test",
      role: "owner",
      authSubjectId: "nowsta-owner",
    } as never);
    await ctx.db.insert("people", {
      ...base,
      tenantId,
      givenName: "Stan",
      email: "stan@example.test",
      role: "staff",
      authSubjectId: "nowsta-staff",
    } as never);
    const workerId = (await ctx.db.insert("people", {
      ...base,
      tenantId,
      givenName: "Ana",
      email: "ana@example.test",
      role: "staff",
    } as never)) as Id<"people">;
    const strangerId = (await ctx.db.insert("people", {
      ...base,
      tenantId: "tenant-other",
      givenName: "Zed",
      email: "zed@example.test",
      role: "staff",
    } as never)) as Id<"people">;
    const eventId = (await ctx.db.insert("events", {
      tenantId,
      title: "Park Wedding",
      eventType: "wedding",
      stage: "approved",
      startsAt: DAY_START + 17 * HOUR,
      endsAt: DAY_START + 23 * HOUR,
      deletedAt: null,
      version: 1,
    } as never)) as Id<"events">;
    return { workerId, strangerId, eventId };
  });
}

const counts = (t: ReturnType<typeof convexTest>) =>
  t.run(async (ctx) => {
    const query = ctx.db.query as (table: string) => {
      collect(): Promise<unknown[]>;
    };
    const out: Record<string, number> = {};
    for (const table of [
      "shifts",
      "timeRecords",
      "manifestEvents",
      "weeklyScheduleNotices",
      "externalRecordLinks",
    ]) {
      out[table] = (await query(table).collect()).length;
    }
    const system = (
      ctx.db as unknown as {
        system: { query(t: string): { collect(): Promise<unknown[]> } };
      }
    ).system;
    out.scheduled = (
      await system.query("_scheduled_functions").collect()
    ).length;
    return out;
  });

describe("runtime proof: Nowsta past shifts", () => {
  it("brings a past shift in finished, once, and starts nothing", async () => {
    const t = convexTest(schema, modules);
    const { workerId, strangerId, eventId } = await seed(t);
    const owner = t.withIdentity({
      subject: "nowsta-owner",
      tokenIdentifier: "proof|nowsta-owner",
      tenantId,
    });
    const staff = t.withIdentity({
      subject: "nowsta-staff",
      tokenIdentifier: "proof|nowsta-staff",
      tenantId,
    });
    const row = {
      externalId: "2026-06-20/park-wedding/ana@example.test/catering-boh/930",
      dayStart: DAY_START,
      dayEnd: DAY_START + 24 * HOUR,
      eventName: "park  WEDDING ",
    };

    expect(
      await owner.query(api.nowstaShiftHistory.match, { rows: [row] }),
    ).toEqual([
      { externalId: row.externalId, imported: false, eventIds: [eventId] },
    ]);
    expect(
      await owner.query(api.nowstaShiftHistory.match, {
        rows: [{ ...row, eventName: "Other Party" }],
      }),
    ).toEqual([{ externalId: row.externalId, imported: false, eventIds: [] }]);
    expect(
      await staff.query(api.nowstaShiftHistory.match, { rows: [row] }),
    ).toBeNull();

    const before = await counts(t);
    const shift = {
      externalId: row.externalId,
      personId: workerId,
      eventId,
      role: "Catering - BOH",
      startsAt: DAY_START + 15.5 * HOUR,
      endsAt: DAY_START + 23.5 * HOUR,
      actualStartsAt: DAY_START + 15.6 * HOUR,
      actualEndsAt: DAY_START + 23 * HOUR,
      rawSourceData: JSON.stringify({ line: 2, Breaks: "0:30" }),
    };
    expect(
      await refused(() =>
        staff.mutation(api.nowstaShiftHistory.bringIn, shift),
      ),
    ).toBe(true);
    const first = await owner.mutation(api.nowstaShiftHistory.bringIn, shift);
    expect(first.already).toBe(false);

    const saved = await t.run((ctx) => ctx.db.get(first.shiftId));
    expect(saved).toMatchObject({
      tenantId,
      personId: workerId,
      eventId,
      role: "Catering - BOH",
      status: "completed",
      startsAt: shift.startsAt,
      endsAt: shift.endsAt,
      startedAt: shift.actualStartsAt,
      completedAt: shift.actualEndsAt,
      deletedAt: null,
    });
    const link = await t.run((ctx) =>
      ctx.db
        .query("externalRecordLinks")
        .withIndex("by_tenantId_and_capsuleId", (q) =>
          q.eq("tenantId", tenantId).eq("capsuleId", first.shiftId),
        )
        .first(),
    );
    expect(link).toMatchObject({
      sourceSystem: "nowsta",
      recordType: "shift",
      capsuleEntity: "shift",
      externalId: row.externalId,
      conflictStatus: "resolved",
      deletedAt: null,
    });

    const after = await counts(t);
    expect(after).toEqual({
      ...before,
      shifts: before.shifts! + 1,
      externalRecordLinks: before.externalRecordLinks! + 1,
    });

    // A second read of the same file: already in, nothing written twice.
    expect(
      await owner.query(api.nowstaShiftHistory.match, { rows: [row] }),
    ).toEqual([
      { externalId: row.externalId, imported: true, eventIds: [eventId] },
    ]);
    const again = await owner.mutation(api.nowstaShiftHistory.bringIn, shift);
    expect(again).toEqual({ shiftId: first.shiftId, already: true });
    expect((await counts(t)).shifts).toBe(after.shifts);

    // Still ahead, another workspace's worker: refused.
    const ahead = Date.now() + 48 * HOUR;
    expect(
      await refused(() =>
        owner.mutation(api.nowstaShiftHistory.bringIn, {
          ...shift,
          externalId: "ahead",
          startsAt: ahead,
          endsAt: ahead + 4 * HOUR,
          actualStartsAt: undefined,
          actualEndsAt: undefined,
        }),
      ),
    ).toBe(true);
    expect(
      await refused(() =>
        owner.mutation(api.nowstaShiftHistory.bringIn, {
          ...shift,
          externalId: "stranger",
          personId: strangerId,
        }),
      ),
    ).toBe(true);
    expect((await counts(t)).shifts).toBe(after.shifts);
  });
});
