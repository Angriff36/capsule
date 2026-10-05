/**
 * Runtime proof (#428): the Events page's service style filter runs in the
 * database read (convex/eventLedger.ts ledgerWindow), so a Buffet event far
 * outside the first unfiltered window still lists, "No service style" works,
 * the tab counts stay for every style, and the read lists every style the
 * company has (not only the styles in the loaded window).
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";
import type { LedgerWindow } from "../../convex/eventLedger";

const TENANT = "tenant-event-ledger-style";
const OTHER = "tenant-event-ledger-style-other";
const DAY = 86_400_000;

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

describe("runtime proof: the Events style filter reaches every event (#428)", () => {
  it("filters in the read, keeps tab counts, and lists all company styles", async () => {
    const proof = createManifestTestContext({
      convexTest: convexTest as never,
      schema,
      modules,
    });
    const owner = proof.asRole({
      subject: "ledger-style-owner",
      role: "owner",
      tenantId: TENANT,
    });
    const today = new Date(Date.UTC(2026, 9, 3)).getTime();

    const ids = await owner.run(async (ctx) => {
      const style = (name: string, sortOrder: number, tenantId = TENANT) =>
        ctx.db.insert("serviceStyles", {
          tenantId,
          name,
          code: name.toLowerCase(),
          sortOrder,
          status: "active",
          version: 1,
        }) as Promise<Id<"serviceStyles">>;
      const full = await style("Full Service", 1);
      const buffet = await style("Buffet", 2);
      const unused = await style("Food Truck", 3);
      await style("Other company style", 1, OTHER);
      // 120 upcoming Full Service events, then one Buffet event far after
      // them, then one event with no style.
      for (let i = 0; i < 120; i++) {
        await ctx.db.insert("events", {
          tenantId: TENANT,
          title: `Full ${i}`,
          eventType: "dinner",
          stage: "planning",
          startsAt: today + (i + 1) * DAY,
          expectedHeadcount: 80,
          serviceStyleId: full,
          version: 1,
        });
      }
      await ctx.db.insert("events", {
        tenantId: TENANT,
        title: "Late Buffet",
        eventType: "dinner",
        stage: "approved",
        startsAt: today + 400 * DAY,
        expectedHeadcount: 80,
        serviceStyleId: buffet,
        version: 1,
      });
      await ctx.db.insert("events", {
        tenantId: TENANT,
        title: "No style yet",
        eventType: "dinner",
        stage: "approved",
        startsAt: today + 300 * DAY,
        expectedHeadcount: 80,
        version: 1,
      });
      return { full, buffet, unused };
    });

    const read = (args: Partial<{ view: string; style: string }>) =>
      owner.query(api.eventLedger.ledgerWindow, {
        view: "upcoming",
        dir: "asc",
        limit: 50,
        showArchived: false,
        now: today,
        ...args,
      }) as Promise<LedgerWindow | null>;

    // Unfiltered, the first window of 50 holds only Full Service events.
    const plain = await read({});
    expect(plain!.more).toBe(true);
    expect(plain!.rows.map((r) => r.title)).not.toContain("Late Buffet");

    // Buffet reaches the event 400 days out, on Upcoming and on All.
    for (const view of ["upcoming", "all", "approved"]) {
      const buffet = await read({ view, style: ids.buffet });
      expect(buffet!.rows.map((r) => r.title)).toEqual(["Late Buffet"]);
      expect(buffet!.more).toBe(false);
    }

    // "none" lists the event with no style only.
    const none = await read({ view: "all", style: "none" });
    expect(none!.rows.map((r) => r.title)).toEqual(["No style yet"]);

    // A style no event uses lists nothing; counts stay for every style.
    const unused = await read({ style: ids.unused });
    expect(unused!.rows).toEqual([]);
    expect(unused!.upcomingCount).toBe(plain!.upcomingCount);
    expect(plain!.upcomingCount).toBe(122);

    // Every style of this company, in the company's order, none of another's.
    expect(plain!.styles).toEqual([
      { key: String(ids.full), label: "Full Service" },
      { key: String(ids.buffet), label: "Buffet" },
      { key: String(ids.unused), label: "Food Truck" },
    ]);
  }, 120_000);
});
