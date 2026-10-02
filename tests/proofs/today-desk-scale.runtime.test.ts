/**
 * Runtime proof (PL-SCALE, AC-172 bounded-read leg): the Today page read
 * (convex/todayDesk.ts desk) returns what the page shows, not the company's
 * tables. A synthetic company with 5,000 events, 600 waiting prep tasks,
 * invoices and pack lists in every status, and a draft closeout: the events
 * read stays inside today + eight days (plus the next few and a few with no
 * date), lane counts match a brute-force count of the open statuses and stop
 * at LANE_CAP with a "capped" mark, read rules follow the generated lists,
 * and another company sees none of it. HomeAttentionPolicy on the result gives
 * the same today / week numbers as on every row.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";
import { LANE_CAP, type TodayDesk } from "../../convex/todayDesk";
import { HomeAttentionPolicy } from "../../src/features/home/HomeAttentionPolicy";

const TENANT = "tenant-today-desk-scale";
const OTHER = "tenant-today-desk-scale-other";
const DAY = 86_400_000;
const EVENTS = 5_000;
const STAGES = [
  "quote",
  "planning",
  "approved",
  "executing",
  "completed",
  "cancelled",
  "closed_out",
] as const;
const INVOICE = ["draft", "sent", "overdue", "paid", "voided"] as const;
const PACK = ["draft", "packing", "dispatched", "cancelled"] as const;

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

describe("runtime proof: the Today page reads only what it shows (AC-172)", () => {
  it("bounds the events read, counts open lanes by status, caps, follows read rules and stays in its company", async () => {
    const proof = createManifestTestContext({
      convexTest: convexTest as never,
      schema,
      modules,
    });
    const owner = proof.asRole({
      subject: "today-owner",
      role: "owner",
      tenantId: TENANT,
    });
    const staff = proof.asRole({
      subject: "today-staff",
      role: "staff",
      tenantId: TENANT,
    });
    const outsider = proof.asRole({
      subject: "today-outsider",
      role: "owner",
      tenantId: OTHER,
    });
    const today = new Date(2026, 9, 3).getTime();
    const now = today + 12 * 3_600_000;

    type Row = { stage: string; startsAt: number | null; deleted: boolean };
    const seeds: Row[] = [];
    for (let i = 0; i < EVENTS; i++) {
      seeds.push({
        stage: STAGES[i % STAGES.length]!,
        startsAt: i % 101 === 0 ? null : today + ((i % 730) - 365) * DAY,
        deleted: i % 263 === 0,
      });
    }
    let invoiceRows: string[] = [];
    let packRows: string[] = [];
    await owner.run(async (ctx) => {
      const insert = (table: string, doc: Record<string, unknown>) =>
        ctx.db.insert(
          table as never,
          { tenantId: TENANT, version: 1, ...doc } as never,
        );
      const ids: string[] = [];
      for (let i = 0; i < EVENTS; i++) {
        const s = seeds[i]!;
        ids.push(
          String(
            await insert("events", {
              title: `Event ${i}`,
              eventType: "dinner",
              stage: s.stage,
              startsAt: s.startsAt,
              deletedAt: s.deleted ? today - DAY : null,
            }),
          ),
        );
      }
      const clientId = await insert("clients", {
        clientType: "company",
        companyName: "Harbor Foods",
        taxExempt: false,
        paymentTermsDays: 30,
        status: "active",
      });
      const dishId = await insert("dishes", {
        name: "Seared Salmon",
        portionSize: 1,
        portionUnit: "portion",
        status: "active",
      });
      const eventDishId = await insert("eventDishes", {
        eventId: ids[1],
        dishId,
        quantityServings: 40,
      });
      // 600 waiting prep tasks (past the lane cap), some done or deleted.
      for (let p = 0; p < 640; p++) {
        await insert("prepTasks", {
          eventDishId,
          eventId: ids[1],
          name: `Task ${p}`,
          category: "hot",
          taskType: "prep",
          isGenerated: false,
          quantity: 1,
          unit: "portion",
          status: p < 600 ? "pending" : "completed",
          deletedAt: p % 300 === 7 ? today : null,
        });
      }
      for (let n = 0; n < 50; n++) {
        const status = INVOICE[n % INVOICE.length]!;
        invoiceRows.push(status);
        await insert("invoices", {
          clientId,
          eventId: ids[n],
          invoiceNumber: String(1000 + n),
          subtotal: 100,
          taxAmount: 0,
          discountAmount: 0,
          total: 100,
          amountPaid: 0,
          amountDue: 100,
          paymentTermsDays: 30,
          status,
        });
      }
      for (let n = 0; n < 40; n++) {
        const status = PACK[n % PACK.length]!;
        packRows.push(status);
        await insert("packLists", {
          eventId: ids[n],
          name: `Pack ${n}`,
          status,
        });
      }
      const money = {
        actualRevenue: 0,
        budgetedRevenue: 0,
        revenueVariance: 0,
        actualIngredientCost: 0,
        actualWasteCost: 0,
        actualLaborCost: 0,
        actualVendorCost: 0,
        budgetedCost: 0,
        totalActualCost: 0,
        costVariance: 0,
        grossProfit: 0,
        expectedHeadcount: 0,
        actualHeadcount: 0,
      };
      await insert("eventCloseouts", {
        ...money,
        eventId: ids[2],
        status: "draft",
      });
      await insert("eventCloseouts", {
        ...money,
        eventId: ids[3],
        status: "finalized",
      });
    });

    const desk = (await owner.query(api.todayDesk.desk, {
      startOfToday: today,
    })) as TodayDesk;

    // Events: never the table. Dated rows sit in today + 8 days, plus at
    // most 8 later and 16 undated; none deleted, cancelled or closed out.
    const windowEnd = today + 8 * DAY;
    const dated = desk.events.filter((e) => e.startsAt != null);
    const inWindow = dated.filter((e) => e.startsAt! < windowEnd);
    expect(dated.every((e) => e.startsAt! >= today)).toBe(true);
    expect(dated.length - inWindow.length).toBeLessThanOrEqual(8);
    expect(
      desk.events.filter((e) => e.startsAt == null).length,
    ).toBeLessThanOrEqual(16);
    expect(desk.events.length).toBeLessThan(EVENTS / 10);
    expect(
      desk.events.every((e) => !["cancelled", "closed_out"].includes(e.stage)),
    ).toBe(true);
    const expectedInWindow = seeds.filter(
      (s) =>
        !s.deleted &&
        !["cancelled", "closed_out"].includes(s.stage) &&
        s.startsAt != null &&
        s.startsAt >= today &&
        s.startsAt < windowEnd,
    ).length;
    expect(inWindow.length).toBe(expectedInWindow);

    // Lanes: brute-force open counts; prep stops at the cap and says so.
    const openInvoices = invoiceRows.filter((s) =>
      ["draft", "sent", "viewed", "overdue", "partial"].includes(s),
    ).length;
    const openPacks = packRows.filter((s) =>
      ["draft", "packing", "packed", "loaded"].includes(s),
    ).length;
    expect(desk.invoices).toHaveLength(openInvoices);
    expect(desk.packLists).toHaveLength(openPacks);
    expect(desk.closeouts).toHaveLength(1);
    expect(desk.prepTasks).toHaveLength(LANE_CAP);
    expect(desk.capped).toEqual(["open_prep"]);

    // The page's numbers from the bounded read match the numbers from every
    // row (today count, week-ahead count, lane counts below the cap).
    const policy = new HomeAttentionPolicy();
    const fromDesk = policy.build({ role: "owner", nowMs: now, ...desk });
    const allEvents = seeds.map((s, i) => ({
      _id: `e${i}`,
      title: `Event ${i}`,
      stage: s.stage,
      startsAt: s.startsAt,
      deletedAt: s.deleted ? 1 : null,
    }));
    const fromAll = policy.build({
      role: "owner",
      nowMs: now,
      events: allEvents,
      invoices: desk.invoices,
      prepTasks: desk.prepTasks,
      packLists: desk.packLists,
      closeouts: desk.closeouts,
    });
    expect(fromDesk.todayCount).toBe(fromAll.todayCount);
    expect(fromDesk.weekAheadCount).toBe(fromAll.weekAheadCount);
    expect(
      fromDesk.attention.find((a) => a.id === "services_this_week")?.count,
    ).toBe(fromAll.attention.find((a) => a.id === "services_this_week")?.count);
    expect(fromDesk.upcoming.map((u) => u.startsAt)).toEqual(
      fromAll.upcoming.map((u) => u.startsAt),
    );

    // Read rules: plain staff see events and pack lists, not invoices,
    // prep or closeouts (as the generated lists).
    const staffDesk = (await staff.query(api.todayDesk.desk, {
      startOfToday: today,
    })) as TodayDesk;
    expect(staffDesk.events.length).toBe(desk.events.length);
    expect(staffDesk.packLists).toHaveLength(openPacks);
    expect(staffDesk.invoices).toEqual([]);
    expect(staffDesk.prepTasks).toEqual([]);
    expect(staffDesk.closeouts).toEqual([]);

    // Another company sees nothing of this one.
    const other = (await outsider.query(api.todayDesk.desk, {
      startOfToday: today,
    })) as TodayDesk;
    expect(other.events).toEqual([]);
    expect(other.invoices).toEqual([]);
    expect(other.prepTasks).toEqual([]);
    expect(other.packLists).toEqual([]);
    expect(other.closeouts).toEqual([]);
  }, 300_000);
});
