import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { EventStaffingCoverageView } from "../../../src/features/events/EventStaffingCoverageView";
import { EventTimelineStaffRoster } from "../../../src/features/events/eventTimelineStaffRoster";

const EVENT_ID = "evt_staffing_1";

const renee = {
  _id: "person_renee",
  givenName: "Renee",
  familyName: "Kopf",
};

const sam = {
  _id: "person_sam",
  givenName: "Sam",
  familyName: "Server",
};

const filledNeed = {
  _id: "need_bar",
  eventId: EVENT_ID,
  role: "Bartender",
  status: "filled" as const,
  filledByPersonId: renee._id,
  version: 2,
  description: "Bar coverage",
};

const serverAssignment = {
  _id: "asg_server",
  eventId: EVENT_ID,
  personId: sam._id,
  role: "Server",
  status: "assigned",
  version: 1,
};

const noopConflict = () => ({
  overlappingShifts: [],
  approvedOff: [],
  available: false,
});

function renderCoverage() {
  const roster = EventTimelineStaffRoster.staffingRosterEntries({
    eventId: EVENT_ID,
    assignments: [serverAssignment],
    people: [renee, sam],
    staffNeeds: [filledNeed],
  });
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      {},
      createElement(EventStaffingCoverageView, {
        roster,
        eventNeeds: [filledNeed],
        people: [renee, sam],
        activePeople: [renee, sam],
        busy: null,
        needPersonIds: {},
        onNeedPersonChange: () => undefined,
        onUnassign: () => undefined,
        onClaim: () => undefined,
        onFill: () => undefined,
        onCancel: () => undefined,
        conflictsFor: noopConflict,
      }),
    ),
  );
}

describe("filled open shift shows who covered it", () => {
  it("titles a FILLED need as Role — Person", () => {
    expect(EventTimelineStaffRoster.titleForNeed(filledNeed, renee)).toBe(
      "Bartender — Renee Kopf",
    );
  });

  it("omits the person from an open need title", () => {
    expect(
      EventTimelineStaffRoster.titleForNeed(
        { role: "Bartender", status: "open" },
        renee,
      ),
    ).toBe("Bartender");
  });

  it("adds the filled assignee to the assigned-staff roster", () => {
    const roster = EventTimelineStaffRoster.fromAssignments({
      eventId: EVENT_ID,
      assignments: [serverAssignment],
      people: [renee, sam],
      staffNeeds: [filledNeed],
    });
    expect(roster.map((row) => row.label)).toEqual([
      "Renee Kopf",
      "Sam Server",
    ]);
  });

  it("paints the FILLED row with the person name", () => {
    const html = renderCoverage();
    const needBlock = html.split('data-testid="event-staff-need-row"')[1];
    expect(needBlock).toContain("Bartender — Renee Kopf");
  });

  it("lists the filled assignee on the roster above the open shifts", () => {
    const html = renderCoverage();
    const rosterBlock = html.split('data-testid="event-staffing-roster"')[1];
    const rosterHtml = rosterBlock.split('data-testid="event-staff-needs"')[0];
    expect(rosterHtml).toContain("Renee Kopf");
    expect(rosterHtml).toContain("Bartender");
    expect(rosterHtml).toContain("Sam Server");
    expect(html).not.toContain("No staff assigned yet.");
  });

  it("does not roster a filled need that never stored personId", () => {
    const orphan = {
      ...filledNeed,
      filledByPersonId: undefined,
    };
    expect(EventTimelineStaffRoster.titleForNeed(orphan, undefined)).toBe(
      "Bartender",
    );
    const roster = EventTimelineStaffRoster.staffingRosterEntries({
      eventId: EVENT_ID,
      assignments: [serverAssignment],
      people: [renee, sam],
      staffNeeds: [orphan],
    });
    expect(roster.map((row) => row.personId)).toEqual([sam._id]);
  });

  it("wires filled needs into the Staffing tab and timeline roster", () => {
    const tab = readFileSync(
      "src/features/events/EventStaffingTab.tsx",
      "utf8",
    );
    const timeline = readFileSync(
      "src/features/events/EventTimelinePanel.tsx",
      "utf8",
    );
    expect(tab).toContain("staffingRosterEntries");
    expect(tab).toContain("staffNeeds: eventNeeds");
    expect(timeline).toContain("useListEventStaffNeed");
    expect(timeline).toContain("staffNeeds");
  });
});
