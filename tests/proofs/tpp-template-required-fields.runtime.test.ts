/**
 * Runtime proof (AC-141, PR11-02): each report family prints its own fields
 * and names a missing source fact instead of leaving it out.
 * - Documents: the BEO, Event Timeline, Event Worksheet and Heating & Serving
 *   menu each have their own sections (they used to share one generic set);
 *   an empty section says "Not on file" and why, a section the reader's role
 *   may not see says "Not shown" and why.
 * - Labels: a dish with no heating method says "Service method not recorded."
 * - Worksheets: an event with no menu says so.
 * - Financial: Venue Sales carries its venue and money columns.
 */
import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import { seedOverridableDishLines } from "./override-survival.runtime.helpers";
import {
  harness,
  run,
  M,
  seedVenueEvent,
} from "./venue-layout.runtime.helpers";

type Row = { label?: string; value: string };
type Doc = { sections: Array<{ id: string; heading?: string; rows: Row[] }> };

describe("runtime proof: each report family prints its own required fields", () => {
  it("documents differ per template and name what is missing", async () => {
    const proof = harness();
    const tenantId = "tenant-ac141-templates";
    const { roles, eventId, clientId, venueId } = await seedVenueEvent(
      proof,
      tenantId,
    );
    await seedOverridableDishLines(proof, tenantId, eventId);
    const report = async (
      role: typeof roles.owner,
      reportId: string,
      id = eventId,
    ) =>
      (await role.query(api.tppReports.events.run, {
        reportId,
        parameters: { eventId: id },
      })) as unknown;
    const sectionIds = async (reportId: string) =>
      ((await report(roles.owner, reportId)) as Doc).sections.map((s) => s.id);

    expect(await sectionIds("event-beo")).toEqual([
      "event",
      "service",
      "venue",
      "menu",
      "timeline",
      "staff",
      "equipment",
      "notes",
    ]);
    expect(await sectionIds("event-timeline")).toEqual([
      "event",
      "venue",
      "timeline",
      "staff",
    ]);
    expect(await sectionIds("event-worksheet")).toEqual([
      "event",
      "service",
      "menu",
      "staff",
      "equipment",
      "rentals",
      "notes",
    ]);
    expect(await sectionIds("heating-serving-event-menu")).toEqual([
      "event",
      "menu",
    ]);

    const beo = (await report(roles.owner, "event-beo")) as Doc;
    const rows = (id: string) => beo.sections.find((s) => s.id === id)!.rows;
    // Venue facts print from the venue record.
    expect(rows("venue")).toEqual(
      expect.arrayContaining([
        {
          label: "Load-in window",
          value: "Load in from 7:00am, out by 11:30pm",
        },
        { label: "Load-in", value: "Dock door 3" },
        { label: "Oven on site", value: "Yes" },
        { label: "Fridge on site", value: "No" },
      ]),
    );
    // Service answers: the style is answered, the rest named as not answered.
    expect(rows("service")[0]).toEqual({
      label: "Service style",
      value: "Plated",
    });
    expect(rows("service").at(-1)?.label).toBe("Not answered yet");
    // Nothing on the timeline or crew yet: said, not left out.
    expect(rows("timeline")).toEqual([
      { label: "Not on file", value: "No timeline steps on this event yet." },
    ]);
    expect(rows("staff")).toEqual([
      { label: "Not on file", value: "Nobody is on this event's crew yet." },
    ]);
    expect(rows("menu").length).toBeGreaterThan(0);
    expect(rows("menu")[0].value).toMatch(/servings/);

    // A role that may not see dishes reads why the menu is missing.
    const driver = proof.asRole({
      subject: `driver-${tenantId}`,
      role: "driver",
      tenantId,
    });
    const driverBeo = (await report(driver, "event-beo")) as Doc;
    expect(driverBeo.sections.find((s) => s.id === "menu")!.rows).toEqual([
      { label: "Not shown", value: "Your role can't see this event's menu." },
    ]);

    // Labels: a dish with no heating method on file says so.
    const labels = (await report(roles.owner, "heating-serving-labels")) as {
      labels: Array<{ lines: string[] }>;
    };
    expect(labels.labels.length).toBeGreaterThan(0);
    expect(labels.labels.flatMap((l) => l.lines)).toContain(
      "Service method not recorded.",
    );

    // Worksheet: an event with no menu says it has none.
    const bare = await run(
      proof,
      roles.sales,
      M.Event_createViaPlanEngagement,
      {
        clientId,
        title: "No menu yet",
        eventType: "meeting",
        startsAt: Date.now() + 40 * 86_400_000,
        endsAt: Date.now() + 40 * 86_400_000 + 3_600_000,
        expectedHeadcount: 10,
        primaryContactName: "Pat Planner",
        budgetAmount: 100,
        quotedPrice: 100,
        venueId,
        venueName: "Garden Hall",
      },
    );
    const worksheet = (await report(
      roles.owner,
      "event-menu-item-production",
      bare.docId,
    )) as Doc;
    expect(
      worksheet.sections.flatMap((s) => s.rows.map((r) => r.value)),
    ).toContain("No menu items or prep steps recorded.");

    // Financial: Venue Sales has its own venue and money columns.
    const sales = (await roles.owner.query(api.tppReports.financial.run, {
      reportId: "venue-sales",
      parameters: {},
    })) as { columns: Array<{ key: string }> };
    expect(sales.columns.map((c) => c.key)).toEqual(
      expect.arrayContaining(["venue", "revenue", "paid", "balance"]),
    );
  });
});
