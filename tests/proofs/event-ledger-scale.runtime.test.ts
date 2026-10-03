/**
 * Runtime proof (PL-SCALE, AC-172 bounded-read leg): a synthetic tenant with
 * 10,000 events, 5,000 dishes, 200 clients and 10,000 menu lines. The Events
 * page read (convex/eventLedger.ts ledgerWindow) returns one window, never the
 * table: the row count stays at the window size, the tab counts match a
 * brute-force count of the same rules, "Show more" grows the window, a search
 * finds an event far outside the window, and another company sees nothing.
 *
 * The timings printed here are in-memory (convex-test) and are NOT the AC-172
 * p95 on recorded hardware; that leg needs the running backend.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";
import { needsAction, type LedgerWindow } from "../../convex/eventLedger";
import type { CalendarMonth } from "../../convex/eventCalendarMonth";

const TENANT = "tenant-event-ledger-scale";
const OTHER = "tenant-event-ledger-scale-other";
const DAY = 86_400_000;
const EVENTS = 10_000;
const DISHES = 5_000;
const CLIENTS = 200;
// A long seed or sampling loop that only awaits in-memory work never lets the
// test worker answer vitest, which then fails the run with "Timeout calling
// onTaskUpdate" after 60s even though every test passed. Yield now and then.
const breathe = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const STAGES = [
  "quote",
  "planning",
  "pending_approval",
  "approved",
  "sales_lock",
  "executing",
  "final",
  "completed",
  "cancelled",
  "closed_out",
] as const;

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

describe("runtime proof: the Events page reads a bounded window at 10,000 events (AC-172)", () => {
  it("returns one window with true counts, grows on Show more, searches every event, and stays in its company", async () => {
    const proof = createManifestTestContext({
      convexTest: convexTest as never,
      schema,
      modules,
    });
    const owner = proof.asRole({
      subject: "ledger-scale-owner",
      role: "owner",
      tenantId: TENANT,
    });
    const outsider = proof.asRole({
      subject: "ledger-scale-outsider",
      role: "owner",
      tenantId: OTHER,
    });
    const today = new Date(Date.UTC(2026, 9, 3)).getTime();

    // Seed: events spread two years back and one year ahead, every stage,
    // some without a date, some archived, some deleted.
    type Seed = {
      stage: (typeof STAGES)[number];
      startsAt: number | null;
      expectedHeadcount: number | null;
      archived: boolean;
      deleted: boolean;
    };
    const seeds: Seed[] = [];
    for (let i = 0; i < EVENTS; i++) {
      seeds.push({
        stage: STAGES[i % STAGES.length]!,
        startsAt: i % 97 === 0 ? null : today + ((i % 1095) - 730) * DAY,
        expectedHeadcount: i % 7 === 0 ? null : 50 + (i % 200),
        archived: i % 211 === 0,
        deleted: i % 307 === 0,
      });
    }
    await owner.run(async (ctx) => {
      const clientIds: Id<"clients">[] = [];
      for (let c = 0; c < CLIENTS; c++) {
        clientIds.push(
          (await ctx.db.insert("clients", {
            tenantId: TENANT,
            clientType: "company",
            companyName: c === 0 ? "Zanzibar Vineyard Group" : `Client ${c}`,
            // convex-test's search fake cannot read a missing field.
            givenName: "Pat",
            familyName: `Contact${c}`,
            taxExempt: false,
            paymentTermsDays: 30,
            status: "active",
            version: 1,
          })) as Id<"clients">,
        );
      }
      const dishIds: Id<"dishes">[] = [];
      for (let d = 0; d < DISHES; d++) {
        dishIds.push(
          (await ctx.db.insert("dishes", {
            tenantId: TENANT,
            name: `Dish ${d}`,
            portionSize: 1,
            portionUnit: "each",
            status: "active",
            version: 1,
          })) as Id<"dishes">,
        );
      }
      for (let i = 0; i < EVENTS; i++) {
        if (i % 250 === 0) await breathe();
        const s = seeds[i]!;
        const eventId = await ctx.db.insert("events", {
          tenantId: TENANT,
          title: i === 4321 ? "Harborlight Gala" : `Event ${i}`,
          eventType: "dinner",
          stage: s.stage,
          startsAt: s.startsAt,
          expectedHeadcount: s.expectedHeadcount,
          clientId: clientIds[i % CLIENTS]!,
          venueName: `Venue ${i % 50}`,
          archivedAt: s.archived ? today - DAY : null,
          deletedAt: s.deleted ? today - DAY : null,
          version: 1,
        });
        if (i === 733) {
          // Starts three days from today: on the calendar grid below.
          await ctx.db.insert("invoices", {
            tenantId: TENANT,
            clientId: clientIds[i % CLIENTS]!,
            eventId,
            invoiceNumber: "60733",
            subtotal: 1000,
            taxAmount: 0,
            discountAmount: 0,
            total: 1000,
            amountPaid: 0,
            amountDue: 1000,
            paymentTermsDays: 30,
            status: "sent",
            version: 1,
          });
        }
        await ctx.db.insert("eventDishes", {
          tenantId: TENANT,
          eventId,
          dishId: dishIds[i % DISHES]!,
          quantityServings: 100,
          version: 1,
        });
      }
      await ctx.db.insert("events", {
        tenantId: OTHER,
        title: "Other company event",
        eventType: "dinner",
        stage: "planning",
        startsAt: today + DAY,
        version: 1,
      });
    });

    const read = (
      actor: typeof owner,
      args: Partial<{
        view: string;
        dir: "asc" | "desc";
        limit: number;
        showArchived: boolean;
        search: string;
      }> = {},
    ) =>
      actor.query(api.eventLedger.ledgerWindow, {
        view: "upcoming",
        dir: "asc",
        limit: 200,
        showArchived: false,
        now: today,
        ...args,
      }) as Promise<LedgerWindow | null>;

    // Brute-force truth over the seeds.
    const visible = seeds.filter((s) => !s.deleted && !s.archived);
    const done = new Set(["completed", "cancelled", "closed_out"]);
    const upcomingTruth = visible.filter(
      (s) =>
        !done.has(s.stage) && (s.startsAt == null || s.startsAt >= today - DAY),
    ).length;

    const timings: number[] = [];
    let first: LedgerWindow | null = null;
    for (let sample = 0; sample < 100; sample++) {
      await breathe();
      const started = performance.now();
      first = await read(owner);
      timings.push(performance.now() - started);
    }
    timings.sort((a, b) => a - b);
    console.log(
      `ledgerWindow in-memory: p50 ${timings[49]!.toFixed(1)} ms, p95 ${timings[94]!.toFixed(1)} ms over 100 samples (not the hardware p95)`,
    );

    expect(first).not.toBeNull();
    expect(first!.rows.length).toBeLessThanOrEqual(200 + 103 /* undated */);
    expect(first!.more).toBe(true);
    // The upcoming count is capped at 500 and says so.
    expect(upcomingTruth).toBeGreaterThan(500);
    expect(first!.upcomingCapped).toBe(true);
    expect(first!.upcomingCount).toBeGreaterThanOrEqual(500);
    for (const row of first!.rows) {
      expect(row.stage === "completed" || row.stage === "cancelled").toBe(
        false,
      );
      expect(row.startsAt == null || row.startsAt >= today - DAY).toBe(true);
      expect(row.archivedAt).toBeNull();
      expect(row.clientLabel).toMatch(/Client|Zanzibar/);
    }

    // Needs action: every row the brute-force rule picks among quotes and
    // pending approvals is in the attention list.
    const attention = await read(owner, { view: "attention" });
    for (const row of attention!.rows) {
      expect(needsAction(row, today)).toBe(true);
    }
    expect(attention!.attentionCount).toBe(attention!.rows.length);

    // All, newest first, grows with Show more and stays ordered.
    const all = await read(owner, { view: "all", dir: "desc", limit: 200 });
    const allMore = await read(owner, { view: "all", dir: "desc", limit: 400 });
    expect(all!.rows).toHaveLength(200);
    expect(allMore!.rows).toHaveLength(400);
    expect(allMore!.rows.slice(0, 200).map((r) => r._id)).toEqual(
      all!.rows.map((r) => r._id),
    );
    const starts = allMore!.rows.map((r) => r.startsAt ?? -Infinity);
    expect([...starts].sort((a, b) => b - a)).toEqual(starts);

    // One stage through the stage index.
    const quotes = await read(owner, { view: "quote", dir: "asc", limit: 50 });
    expect(quotes!.rows).toHaveLength(50);
    expect(quotes!.rows.every((r) => r.stage === "quote")).toBe(true);

    // Archived rows only when asked for.
    const withArchived = await read(owner, {
      view: "all",
      limit: 2000,
      showArchived: true,
    });
    expect(withArchived!.rows.some((r) => r.archivedAt != null)).toBe(true);

    // Search reaches an event far outside the first window, by title and by
    // client name.
    const byTitle = await read(owner, { search: "Harborlight" });
    expect(byTitle!.searchRows.map((r) => r.title)).toContain(
      "Harborlight Gala",
    );
    const byClient = await read(owner, { search: "Zanzibar" });
    expect(byClient!.searchRows.length).toBeGreaterThan(0);
    expect(
      byClient!.searchRows.every(
        (r) => r.clientLabel === "Zanzibar Vineyard Group",
      ),
    ).toBe(true);

    // Client names follow the client read rule: plain staff see none and
    // cannot find events by client name.
    const crew = proof.asRole({
      subject: "ledger-scale-crew",
      role: "staff",
      tenantId: TENANT,
    });
    const crewView = await read(crew, { search: "Zanzibar" });
    expect(crewView!.rows.length).toBeGreaterThan(0);
    expect(crewView!.rows.every((r) => r.clientLabel === "—")).toBe(true);
    expect(crewView!.searchRows).toEqual([]);

    // The calendar home reads the six weeks on screen only.
    const from = today - 3 * DAY;
    const to = from + 42 * DAY;
    const month = (actor: typeof owner) =>
      actor.query(api.eventCalendarMonth.month, {
        from,
        to,
      }) as Promise<CalendarMonth | null>;
    const ownerMonth = await month(owner);
    const inGrid = seeds.filter(
      (s) =>
        !s.deleted &&
        s.startsAt != null &&
        s.startsAt >= from &&
        s.startsAt < to,
    ).length;
    const undatedLive = seeds.filter(
      (s) => !s.deleted && s.startsAt == null,
    ).length;
    expect(ownerMonth!.capped).toBe(false);
    expect(ownerMonth!.events).toHaveLength(inGrid + undatedLive);
    expect(ownerMonth!.events.length).toBeLessThan(EVENTS / 10);
    expect(ownerMonth!.events.every((e) => e.importDraftJson == null)).toBe(
      true,
    );
    expect(ownerMonth!.invoices.map((i) => i.invoiceNumber)).toEqual(["60733"]);
    // Only the number travels: no amounts reach the calendar.
    for (const key of Object.keys(ownerMonth!.invoices[0]!)) {
      expect(["deletedAt", "eventId", "invoiceNumber"]).toContain(key);
    }
    expect(ownerMonth!.clients.length).toBeGreaterThan(0);
    const crewMonth = await month(crew);
    expect(crewMonth!.events).toHaveLength(inGrid + undatedLive);
    expect(crewMonth!.invoices).toEqual([]);
    expect(crewMonth!.clients).toEqual([]);
    const theirMonth = await month(outsider);
    expect(theirMonth!.events.map((e) => e.title)).toEqual([
      "Other company event",
    ]);

    // Another company sees only its own event.
    const theirs = await read(outsider, { view: "all" });
    expect(theirs!.rows.map((r) => r.title)).toEqual(["Other company event"]);
  }, 600_000);
});
