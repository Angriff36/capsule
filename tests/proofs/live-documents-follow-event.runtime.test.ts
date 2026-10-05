/**
 * Runtime proof (AC-388 documents slice, live documents): the event papers
 * other than the printed packet are built from the Event each time they open
 * (§1.3 "customer, kitchen, warehouse, crew, driver, and finance documents
 * from the same Event"), so a headcount or venue change shows on the next
 * print with no second entry, and a deliberate dish override stays on them.
 * The printed packet, which is kept history, is covered by
 * packet-out-of-date-readiness.runtime.test.ts.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  createPlannedEvent,
  harness,
  rolesFor,
  runner,
  seedOverridableDishLines,
  type Role,
} from "./override-survival.runtime.helpers";

const M = api.mutations;
const TENANT = "tenant-ac388-documents";
const ROAST = `Override roast ${TENANT}`;
const SOUP = `Follow soup ${TENANT}`;
const NEW_VENUE = "Lakeside Pavilion · 1 Shore Road";

type Row = { label: string; value: string };
type DocumentReport = { sections: Array<{ id: string; rows: Row[] }> };

async function report(actor: Role, reportId: string, eventId: string) {
  return (await actor.query(api.tppReports.events.run, {
    reportId,
    parameters: { eventId },
  })) as unknown;
}

function sectionRows(doc: unknown, id: string) {
  const found = (doc as DocumentReport).sections.find((s) => s.id === id);
  expect(found).toBeDefined();
  return found!.rows;
}

// One section of a document report as label -> value.
function section(doc: unknown, id: string) {
  return new Map(
    sectionRows(doc, id).map((row) => [row.label, row.value] as const),
  );
}

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

describe("event documents follow the event (AC-388)", () => {
  it("BEO, production worksheet and serving menu show the change and keep the override", async () => {
    const proof = harness();
    const { events, owner } = rolesFor(proof, TENANT);
    const run = runner(proof, events);
    const { eventId } = await createPlannedEvent(
      proof,
      TENANT,
      "AC-388 documents",
    );
    const { lineA } = await seedOverridableDishLines(proof, TENANT, eventId);
    await run(M.EventDish_setHeadcountOverride, {
      docId: lineA,
      headcountOverride: 25,
    });

    const beoBefore = section(
      await report(owner, "event-beo", eventId),
      "event",
    );
    expect(beoBefore.get("Guests")).toBe("40");
    expect(beoBefore.get("Venue")).not.toBe(NEW_VENUE);

    const servingBefore = await report(
      owner,
      "heating-serving-event-menu",
      eventId,
    );
    const servingHeaderBefore = section(servingBefore, "event");
    expect(servingHeaderBefore.get("Guests")).toBe("40");
    expect(servingHeaderBefore.get("Venue")).not.toBe(NEW_VENUE);
    const servingMenuBefore = section(servingBefore, "menu");
    expect(servingMenuBefore.has(`${SOUP} · 40 servings`)).toBe(true);

    await run(M.Event_changeHeadcount, {
      docId: eventId,
      version: 1,
      newHeadcount: 60,
    });
    await run(M.Event_changeVenue, {
      docId: eventId,
      version: 2,
      venueName: "Lakeside Pavilion",
      venueAddress: "1 Shore Road",
    });

    const beo = await report(owner, "event-beo", eventId);
    const beoHeader = section(beo, "event");
    expect(beoHeader.get("Guests")).toBe("60");
    expect(beoHeader.get("Venue")).toBe(NEW_VENUE);
    const beoMenu = sectionRows(beo, "menu")
      .map((row) => row.value)
      .join("\n");
    expect(beoMenu).toContain(ROAST);
    expect(beoMenu).toContain(SOUP);

    // The kitchen worksheet: the overridden dish keeps 25 servings, the
    // following dish moves to the new count, and every row shows the change.
    const production = (await report(
      owner,
      "event-menu-item-production",
      eventId,
    )) as {
      exportTable: { rows: Array<{ values: Record<string, unknown> }> };
    };
    const rows = production.exportTable.rows.map((row) => row.values);
    expect(rows.length).toBeGreaterThan(0);
    const byDish = new Map(rows.map((row) => [row.dish, row] as const));
    expect(byDish.get(ROAST)?.servings).toBe(25);
    expect(byDish.get(SOUP)?.servings).toBe(60);
    for (const row of rows) {
      expect(row.guests).toBe(60);
      expect(String(row.venue)).toContain("Lakeside Pavilion");
    }

    // The heating and serving menu used on site: its header shows the new
    // guest count and venue, and its lines read the same servings.
    const serving = await report(owner, "heating-serving-event-menu", eventId);
    const servingHeader = section(serving, "event");
    expect(servingHeader.get("Guests")).toBe("60");
    expect(servingHeader.get("Venue")).toBe(NEW_VENUE);
    const servingMenu = section(serving, "menu");
    expect(servingMenu.has(`${ROAST} · 25 servings`)).toBe(true);
    expect(servingMenu.has(`${SOUP} · 60 servings`)).toBe(true);
    expect(servingMenu.has(`${SOUP} · 40 servings`)).toBe(false);
  });
});
