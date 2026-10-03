/**
 * Timing proof (PL-SCALE, AC-172 server leg): a synthetic company with
 * 10,000 events, 5,000 dishes, 200 clients and 20,000 menu lines. Every
 * list/detail read a busy screen makes is timed 120 times after one cold
 * call; the all-time export walk and a 1,000-event bulk write are timed
 * separately. Hardware is recorded with the numbers.
 *
 * What this measures: the server functions themselves, in process
 * (convex-test, no network, no browser). convex-test walks the whole
 * database for every index read, so reads that make many index reads
 * (the calendar) look far slower here than on a real backend; see below.
 * It is NOT the browser interaction
 * time and NOT a running-backend round trip; those AC-172 legs stay open.
 * Results: .artifacts/product-scale-timings.json and the console; the
 * recorded run is in docs/qualification/product-scale-timings.md.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const TENANT = "tenant-product-scale";
const DAY = 86_400_000;
const EVENTS = 10_000;
const DISHES = 5_000;
const CLIENTS = 200;
const LINES_PER_EVENT = 2;
const SAMPLES = 120;
// A long seed or sampling loop that only awaits in-memory work never lets the
// test worker answer vitest, which then fails the run with "Timeout calling
// onTaskUpdate" after 60s even though every test passed. Yield now and then.
const breathe = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const LIST_DETAIL_P95_MS = 1000;

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

type Timing = {
  read: string;
  samples: number;
  coldMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
};

function percentile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)]!;
}

async function time(
  read: string,
  call: () => Promise<unknown>,
  samples = SAMPLES,
): Promise<Timing> {
  let start = performance.now();
  await call();
  const coldMs = performance.now() - start;
  const runs: number[] = [];
  for (let i = 0; i < samples; i++) {
    await breathe();
    start = performance.now();
    await call();
    runs.push(performance.now() - start);
  }
  runs.sort((a, b) => a - b);
  const round = (n: number) => Math.round(n * 10) / 10;
  return {
    read,
    samples,
    coldMs: round(coldMs),
    p50Ms: round(percentile(runs, 0.5)),
    p95Ms: round(percentile(runs, 0.95)),
    maxMs: round(runs[runs.length - 1]!),
  };
}

describe("timing proof: busy screens' reads at 10,000 events and 5,000 dishes (AC-172)", () => {
  it("times every list/detail read 120 times and records the hardware", async () => {
    const proof = createManifestTestContext({
      convexTest: convexTest as never,
      schema,
      modules,
    });
    const owner = proof.asRole({
      subject: "product-scale-owner",
      role: "owner",
      tenantId: TENANT,
    });
    const today = new Date(Date.UTC(2026, 9, 3)).getTime();

    const seedStart = performance.now();
    const ids = await owner.run(async (ctx) => {
      const clientIds: Id<"clients">[] = [];
      for (let c = 0; c < CLIENTS; c++) {
        clientIds.push(
          (await ctx.db.insert("clients", {
            tenantId: TENANT,
            clientType: "company",
            companyName: `Client ${c}`,
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
        if (d % 250 === 0) await breathe();
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
      const eventIds: Id<"events">[] = [];
      for (let i = 0; i < EVENTS; i++) {
        if (i % 250 === 0) await breathe();
        const eventId = await ctx.db.insert("events", {
          tenantId: TENANT,
          title: `Event ${i}`,
          eventType: "dinner",
          stage: i % 3 === 0 ? "approved" : "planning",
          startsAt: i % 97 === 0 ? null : today + ((i % 1095) - 730) * DAY,
          expectedHeadcount: 50 + (i % 200),
          clientId: clientIds[i % CLIENTS]!,
          venueName: `Venue ${i % 50}`,
          quotedPrice: 1000 + i,
          version: 1,
        });
        eventIds.push(eventId as Id<"events">);
        for (let l = 0; l < LINES_PER_EVENT; l++) {
          await ctx.db.insert("eventDishes", {
            tenantId: TENANT,
            eventId,
            dishId: dishIds[(i * LINES_PER_EVENT + l) % DISHES]!,
            quantityServings: 100,
            version: 1,
          });
        }
      }
      return { eventIds, dishIds };
    });
    const seedMs = performance.now() - seedStart;

    const sixWeeksFrom = today - 7 * DAY;
    const anEvent = ids.eventIds[EVENTS - 3]!;
    const aDish = ids.dishIds[1234]!;

    const timings: Timing[] = [];
    timings.push(
      await time(
        "Events page window (eventLedger.ledgerWindow, 200 rows)",
        () =>
          owner.query(api.eventLedger.ledgerWindow, {
            view: "upcoming",
            dir: "asc",
            limit: 200,
            showArchived: false,
            now: today,
          }),
      ),
    );
    timings.push(
      await time("Event detail (queries.getEvent, with menu)", () =>
        owner.query(api.queries.getEvent, { id: anEvent }),
      ),
    );
    // The calendar makes three small index reads per event on the grid
    // (~500 events here, ~1,500 reads). convex-test answers every index read
    // by walking every document in the database (node_modules/convex-test
    // _iterateDocs), so this number grows with the whole database, unlike a
    // real backend's index. Timed with fewer samples, recorded, not held to
    // the target here; its real p95 belongs to the running-backend leg.
    const calendar = await time(
      "Calendar home, six weeks (eventCalendarMonth.month) - harness-bound",
      () =>
        owner.query(api.eventCalendarMonth.month, {
          from: sixWeeksFrom,
          to: sixWeeksFrom + 42 * DAY,
        }),
      10,
    );
    timings.push(
      await time("Today page (todayDesk.desk)", () =>
        owner.query(api.todayDesk.desk, { startOfToday: today }),
      ),
    );
    timings.push(
      await time("Event picker window (eventLookup.range)", () =>
        owner.query(api.eventLookup.range, {
          from: today - 183 * DAY,
          to: today + 731 * DAY,
          withUndated: true,
        }),
      ),
    );
    timings.push(
      await time("Dish list, all 5,000 (queries.listDish)", () =>
        owner.query(api.queries.listDish, {}),
      ),
    );
    timings.push(
      await time("Dish detail (queries.getDish)", () =>
        owner.query(api.queries.getDish, { id: aDish }),
      ),
    );

    // All-time export read: every event in pages of 500, walked end to end.
    const exportWalk = await time(
      "All-time event export walk (eventLookup.reportPage, 500 a page)",
      async () => {
        let cursor: string | null = null;
        for (;;) {
          const page = (await owner.query(api.eventLookup.reportPage, {
            paginationOpts: { numItems: 500, cursor },
          })) as { isDone: boolean; continueCursor: string };
          if (page.isDone) break;
          cursor = page.continueCursor;
        }
      },
      10,
    );

    // Bulk write: 1,000 more events with their menu lines in one run.
    const bulkStart = performance.now();
    await owner.run(async (ctx) => {
      for (let i = 0; i < 1000; i++) {
        const eventId = await ctx.db.insert("events", {
          tenantId: TENANT,
          title: `Bulk ${i}`,
          eventType: "dinner",
          stage: "planning",
          startsAt: today + (i % 365) * DAY,
          version: 1,
        });
        await ctx.db.insert("eventDishes", {
          tenantId: TENANT,
          eventId,
          dishId: ids.dishIds[i % DISHES]!,
          quantityServings: 100,
          version: 1,
        });
      }
    });
    const bulkMs = performance.now() - bulkStart;

    const cpu = os.cpus();
    const report = {
      recordedAt: new Date().toISOString(),
      hardware: {
        cpu: cpu[0]?.model ?? "unknown",
        cores: cpu.length,
        memoryGb: Math.round(os.totalmem() / 1024 ** 3),
        os: `${os.platform()} ${os.release()}`,
        runtime: `node ${process.versions.node}`,
      },
      network: "none: in-process convex-test, no backend round trip",
      data: {
        events: EVENTS,
        dishes: DISHES,
        clients: CLIENTS,
        menuLines: EVENTS * LINES_PER_EVENT,
      },
      seedWriteMs: Math.round(seedMs),
      timings,
      calendar,
      exportWalk,
      bulkWrite1000EventsMs: Math.round(bulkMs),
    };
    mkdirSync(".artifacts", { recursive: true });
    writeFileSync(
      ".artifacts/product-scale-timings.json",
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report, null, 2));

    for (const t of timings) {
      expect(t.samples).toBeGreaterThanOrEqual(100);
      expect(t.p95Ms, t.read).toBeLessThan(LIST_DETAIL_P95_MS);
    }
  }, 900_000);
});
