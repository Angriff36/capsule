/**
 * PL-CUTOVER runtime proof (AC-293): 'test-year totals reconcile within the
 * documented tolerances'. The tolerances were written down first
 * (codex-plans/production-readiness-next/migration-reconciliation.md):
 * no TPP event without its Capsule event, no Capsule-only event in the
 * period, money within one cent per event, no open difference.
 * A test year with a wrong price, a stage TPP keeps differently and a double
 * made in Capsule fails with each reason in plain words; once the price is
 * corrected, the stage difference is marked fine and the double removed, the
 * same check passes. The result is kept, and the daily check is not mistaken
 * for it. Synthetic workspace only.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import { parseTppEvent, type TppEventRecord } from "../../convex/tppParser";
import { modules } from "./convex-test-modules";

const tenantId = "tenant-tolerance";

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

const FROM = new Date(2025, 0, 1).getTime();
const TO = new Date(2025, 11, 31, 23, 59, 59, 999).getTime();

function tppRow(id: string, day: string, revenue: number): TppEventRecord {
  return {
    EventID: id,
    EventName: `TPP event ${id}`,
    EventDate: day,
    StartTime: "18:00",
    ExpectedCount: 100,
    TotalRevenue: revenue,
    EventStatus: "Complete",
    EventType: "Wedding",
    ClientID: "C1",
  } as TppEventRecord;
}

describe("runtime proof: test-year reconcile (AC-293)", () => {
  it("test-year totals reconcile within the documented tolerances", async () => {
    const t = convexTest(schema, modules);
    const { wrongPrice, double } = await t.run(async (ctx) => {
      await ctx.db.insert("people", {
        tenantId,
        givenName: "Olive",
        familyName: "Proof",
        email: "olive-tolerance@example.test",
        role: "owner",
        authSubjectId: "tol-owner",
        employmentType: "full_time",
        status: "active",
        deletedAt: null,
        version: 1,
      } as never);
      const rows = [
        tppRow("5001", "2025-03-14", 4200),
        tppRow("5002", "2025-06-21", 8800.5),
        tppRow("5003", "2025-10-04", 3100),
        // Outside the test year: never counted.
        tppRow("4999", "2024-12-31", 999),
      ];
      const ids: Record<string, Id<"events">> = {};
      for (const row of rows) {
        const parsed = parseTppEvent(row);
        ids[row.EventID] = (await ctx.db.insert("events", {
          tenantId,
          title: row.EventName,
          eventType: "wedding",
          startsAt: parsed.startsAt,
          expectedHeadcount: 100,
          // 5002 came over with the wrong price.
          quotedPrice: row.EventID === "5002" ? 8850.5 : row.TotalRevenue,
          // TPP says complete; 5003 was closed out in Capsule.
          stage: row.EventID === "5003" ? "closed_out" : "completed",
          deletedAt: null,
          version: 1,
        } as never)) as Id<"events">;
        await ctx.db.insert("externalRecordLinks", {
          tenantId,
          sourceSystem: "tpp_legacy",
          recordType: "event",
          capsuleEntity: "event_record",
          externalId: row.EventID,
          capsuleId: ids[row.EventID]!,
          verified: false,
          conflictStatus: "resolved",
          rawSourceData: JSON.stringify({ ...parsed, sourceRow: row }),
          deletedAt: null,
          version: 1,
        } as never);
      }
      // A double typed into Capsule in the test year.
      const doubleId = (await ctx.db.insert("events", {
        tenantId,
        title: "TPP event 5001 (copy)",
        eventType: "wedding",
        startsAt: new Date(2025, 2, 14, 18).getTime(),
        quotedPrice: 0,
        stage: "planning",
        deletedAt: null,
        version: 1,
      } as never)) as Id<"events">;
      return { wrongPrice: ids["5002"]!, double: doubleId };
    });
    const owner = t.withIdentity({ subject: "tol-owner", tenantId });

    const first = await owner.mutation(api.parallelRun.reconcilePeriod, {
      from: FROM,
      to: TO,
    });
    expect(first.verdict.passed).toBe(false);
    expect(first.summary.tpp.events).toBe(3);
    expect(first.summary.tpp.revenue).toBeCloseTo(4200 + 8800.5 + 3100, 2);
    expect(first.verdict.reasons).toEqual([
      "1 Capsule event(s) in this period are not in TPP. Check for doubles or wrong dates.",
      "Prices differ by $50.00 in total (allowed: 1 cent per event).",
      "2 difference(s) for events in this period are not settled yet.",
    ]);
    // The period's differences join the list people settle.
    const view = await owner.query(api.parallelRun.overview, {});
    expect(view!.differences.map((row) => row.field).sort()).toEqual([
      "price",
      "stage",
    ]);
    expect(view!.periodCheck!.verdict.passed).toBe(false);
    // A period check is not the daily check.
    expect(view!.comparison).toBeNull();

    // Correct the price, remove the double, say the stage difference is fine.
    await t.run(async (ctx) => {
      await ctx.db.patch(wrongPrice, { quotedPrice: 8800.5 });
      await ctx.db.patch(double, { deletedAt: Date.now() });
    });
    await owner.mutation(api.parallelRun.acceptAllOfField, {
      field: "stage",
      note: "Capsule closes out events TPP only marks complete",
    });

    const second = await owner.mutation(api.parallelRun.reconcilePeriod, {
      from: FROM,
      to: TO,
    });
    expect(second.verdict).toEqual({ passed: true, reasons: [] });
    expect(second.summary.capsule.events).toBe(3);
    expect(second.summary.onlyInTpp).toBe(0);
    expect(second.summary.onlyInCapsule).toBe(0);
    const after = await owner.query(api.parallelRun.overview, {});
    expect(after!.periodCheck!.verdict.passed).toBe(true);
    expect(after!.periodCheck!.from).toBe(FROM);

    // The check left a history row.
    const types = await t.run(async (ctx) =>
      (await ctx.db.query("manifestEvents").collect()).map(
        (event) => (event as { type: string }).type,
      ),
    );
    expect(
      types.filter((type) => type === "parallel_run.period_checked"),
    ).toHaveLength(2);

    await expect(
      owner.mutation(api.parallelRun.reconcilePeriod, { from: TO, to: FROM }),
    ).rejects.toThrow(/last day must come after the first day/);
  });
});
