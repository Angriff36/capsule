/**
 * Runtime proof (PL-SCALE, AC-172 bounded-read leg): the event reads that
 * replace the generated every-event list on date-window screens, pickers,
 * client tabs and all-time reports (convex/eventLookup.ts) stay bounded at
 * 10,000 events and stay inside the company:
 * - range: one window, matches a brute-force count, says when it is capped;
 * - rangeDocs: the same window as whole records, without the import draft or
 *   contact fields;
 * - picker: the next events soonest first, the recent past and undated ones,
 *   at a fixed most;
 * - byClient: one client's live events only;
 * - reportPage: every event in pages no larger than asked for, nothing twice.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";
import {
  PICKER_AHEAD,
  PICKER_BACK,
  RANGE_CAP,
  type EventLookupRow,
} from "../../convex/eventLookup";

const TENANT = "tenant-event-lookup-scale";
const OTHER = "tenant-event-lookup-scale-other";
const DAY = 86_400_000;
const EVENTS = 10_000;
const CLIENTS = 200;

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

describe("runtime proof: event reads stay bounded at 10,000 events (AC-172)", () => {
  it("windows, client lists and report pages read only what they return, in one company", async () => {
    const proof = createManifestTestContext({
      convexTest: convexTest as never,
      schema,
      modules,
    });
    const owner = proof.asRole({
      subject: "lookup-scale-owner",
      role: "owner",
      tenantId: TENANT,
    });
    const outsider = proof.asRole({
      subject: "lookup-scale-outsider",
      role: "owner",
      tenantId: OTHER,
    });
    const today = new Date(Date.UTC(2026, 9, 3)).getTime();

    type Seed = { startsAt: number | null; deleted: boolean; client: number };
    const seeds: Seed[] = [];
    for (let i = 0; i < EVENTS; i++) {
      seeds.push({
        startsAt: i % 97 === 0 ? null : today + ((i % 1095) - 730) * DAY,
        deleted: i % 307 === 0,
        client: i % CLIENTS,
      });
    }
    const clientIds: Id<"clients">[] = [];
    await owner.run(async (ctx) => {
      for (let c = 0; c < CLIENTS; c++) {
        clientIds.push(
          (await ctx.db.insert("clients", {
            tenantId: TENANT,
            clientType: "company",
            companyName: `Client ${c}`,
            taxExempt: false,
            paymentTermsDays: 30,
            status: "active",
            version: 1,
          })) as Id<"clients">,
        );
      }
      for (let i = 0; i < EVENTS; i++) {
        const s = seeds[i]!;
        await ctx.db.insert("events", {
          tenantId: TENANT,
          title: `Event ${i}`,
          eventType: "dinner",
          stage: "planning",
          startsAt: s.startsAt,
          clientId: clientIds[s.client]!,
          quotedPrice: 1000 + i,
          importDraftJson: "secret draft",
          deletedAt: s.deleted ? today - DAY : null,
          version: 1,
        });
      }
      await ctx.db.insert("events", {
        tenantId: OTHER,
        title: "Other company event",
        eventType: "dinner",
        stage: "planning",
        startsAt: today + DAY,
        clientId: clientIds[0]!,
        version: 1,
      });
    });

    const live = seeds.filter((s) => !s.deleted);
    const inWindow = (from: number, to: number) =>
      live.filter(
        (s) => s.startsAt != null && s.startsAt >= from && s.startsAt < to,
      ).length;
    const undated = live.filter((s) => s.startsAt == null).length;

    // A dispatch-sized window: next seven days.
    const week = (await owner.query(api.eventLookup.range, {
      from: today,
      to: today + 7 * DAY,
    })) as { rows: EventLookupRow[]; capped: boolean };
    expect(week.capped).toBe(false);
    expect(week.rows).toHaveLength(inWindow(today, today + 7 * DAY));
    expect(week.rows.length).toBeLessThan(EVENTS / 50);
    expect(
      week.rows.every(
        (r) => r.startsAt! >= today && r.startsAt! < today + 7 * DAY,
      ),
    ).toBe(true);
    expect(week.rows.every((r) => r.quotedPrice != null)).toBe(true);

    // The picker window adds undated events.
    const pickerFrom = today - 183 * DAY;
    const pickerTo = today + 731 * DAY;
    const picker = (await owner.query(api.eventLookup.range, {
      from: pickerFrom,
      to: pickerTo,
      withUndated: true,
    })) as { rows: EventLookupRow[]; capped: boolean };
    const pickerTruth = inWindow(pickerFrom, pickerTo);
    expect(pickerTruth).toBeGreaterThan(RANGE_CAP);
    expect(picker.capped).toBe(true);
    // The cap counts the records read; removed ones read are then left out.
    const pickerDated = picker.rows.filter((r) => r.startsAt != null);
    expect(pickerDated.length).toBeLessThanOrEqual(RANGE_CAP);
    expect(pickerDated.length).toBeGreaterThan(RANGE_CAP * 0.99);
    expect(picker.rows.length - pickerDated.length).toBe(undated);

    // A window wider than the cap is cut at the cap and says so.
    const everything = (await owner.query(api.eventLookup.range, {
      from: today - 1000 * DAY,
      to: today + 1000 * DAY,
    })) as { rows: EventLookupRow[]; capped: boolean };
    expect(everything.capped).toBe(true);
    expect(everything.rows.length).toBeLessThanOrEqual(RANGE_CAP);

    // A picker: the next PICKER_AHEAD events soonest first, the last
    // PICKER_BACK of the past 90 days, and every undated event.
    const offered = (await owner.query(api.eventLookup.picker, {
      today,
    })) as { rows: EventLookupRow[]; capped: boolean };
    const dated = offered.rows.filter((r) => r.startsAt != null);
    const ahead = dated.filter((r) => r.startsAt! >= today - DAY);
    const back = dated.filter((r) => r.startsAt! < today - DAY);
    expect(offered.capped).toBe(true);
    expect(ahead.length).toBeLessThanOrEqual(PICKER_AHEAD);
    expect(ahead.length).toBeGreaterThan(PICKER_AHEAD * 0.99);
    expect(back.length).toBeLessThanOrEqual(PICKER_BACK);
    expect(back.length).toBeGreaterThan(PICKER_BACK * 0.99);
    expect(back.every((r) => r.startsAt! >= today - 90 * DAY)).toBe(true);
    // Soonest first: the next events, not the oldest of a long window.
    const truthAhead = live
      .filter((s) => s.startsAt != null && s.startsAt >= today - DAY)
      .map((s) => s.startsAt!)
      .sort((a, b) => a - b);
    expect(Math.max(...ahead.map((r) => r.startsAt!))).toBeLessThanOrEqual(
      truthAhead[PICKER_AHEAD]!,
    );
    const startsInOrder = dated.map((r) => r.startsAt!);
    expect([...startsInOrder].sort((a, b) => a - b)).toEqual(startsInOrder);
    expect(offered.rows.length - dated.length).toBe(undated);
    expect(offered.rows.every((r) => r.deletedAt == null)).toBe(true);

    // Whole records for the same week, without the draft or contacts.
    const records = (await owner.query(api.eventLookup.rangeDocs, {
      from: today,
      to: today + 7 * DAY,
    })) as { rows: { importDraftJson?: string | null; tenantId: string }[] };
    expect(records.rows).toHaveLength(week.rows.length);
    expect(records.rows.every((r) => r.importDraftJson == null)).toBe(true);
    expect(records.rows.every((r) => r.tenantId === TENANT)).toBe(true);

    // One client's events: that client's live events only.
    const mine = (await owner.query(api.eventLookup.byClient, {
      clientId: clientIds[7]!,
    })) as EventLookupRow[];
    expect(mine).toHaveLength(live.filter((s) => s.client === 7).length);
    expect(mine.every((r) => r.clientId === clientIds[7])).toBe(true);
    // Client 0 also has the other company's event; it never shows.
    const zero = (await owner.query(api.eventLookup.byClient, {
      clientId: clientIds[0]!,
    })) as EventLookupRow[];
    expect(zero.some((r) => r.title === "Other company event")).toBe(false);

    // All-time pages: each page at most the size asked for, every event once.
    const seen = new Set<string>();
    let cursor: string | null = null;
    let pages = 0;
    for (;;) {
      const page = (await owner.query(api.eventLookup.reportPage, {
        paginationOpts: { numItems: 500, cursor },
      })) as {
        page: EventLookupRow[];
        isDone: boolean;
        continueCursor: string;
      };
      expect(page.page.length).toBeLessThanOrEqual(500);
      for (const row of page.page) {
        expect(seen.has(row._id)).toBe(false);
        seen.add(row._id);
      }
      pages += 1;
      if (page.isDone) break;
      cursor = page.continueCursor;
    }
    expect(seen.size).toBe(EVENTS);
    expect(pages).toBeGreaterThanOrEqual(EVENTS / 500);

    // Another company sees only its own event, in every read.
    const theirs = (await outsider.query(api.eventLookup.range, {
      from: today - 1000 * DAY,
      to: today + 1000 * DAY,
      withUndated: true,
    })) as { rows: EventLookupRow[] };
    expect(theirs.rows.map((r) => r.title)).toEqual(["Other company event"]);
    const theirClientView = (await outsider.query(api.eventLookup.byClient, {
      clientId: clientIds[0]!,
    })) as EventLookupRow[];
    expect(theirClientView.map((r) => r.title)).toEqual([
      "Other company event",
    ]);
    const theirPage = (await outsider.query(api.eventLookup.reportPage, {
      paginationOpts: { numItems: 500, cursor: null },
    })) as { page: EventLookupRow[] };
    expect(theirPage.page.map((r) => r.title)).toEqual(["Other company event"]);
  }, 600_000);
});
