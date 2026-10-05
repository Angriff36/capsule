/**
 * AC-514: a person working two roles in one merged shift is one roster row
 * ("Bartender / Captain"), keeps both coverage sources and the certificate the
 * need asks for, and is not counted twice.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { EventStaffingCoverageView } from "../../../src/features/events/EventStaffingCoverageView";
import { EventTimelineStaffRoster } from "../../../src/features/events/eventTimelineStaffRoster";

const EVENT = "evt_split";
const FIVE = Date.parse("2026-10-18T17:00:00Z");
const TEN = Date.parse("2026-10-18T22:00:00Z");
const ann = { _id: "p_ann", givenName: "Ann", familyName: "Pool" };
const assignment = {
  _id: "a_captain",
  eventId: EVENT,
  personId: ann._id,
  role: "Captain",
  status: "confirmed",
  startsAt: FIVE,
  endsAt: TEN,
  version: 2,
};
const need = {
  _id: "n_bar",
  eventId: EVENT,
  role: "Bartender",
  status: "filled" as const,
  filledByPersonId: ann._id,
  startsAt: FIVE + 3_600_000,
  endsAt: TEN,
  version: 3,
  qualificationName: "Food handler",
};
const shift = {
  _id: "s_one",
  eventId: EVENT,
  personId: ann._id,
  status: "scheduled",
  startsAt: FIVE,
  endsAt: TEN,
  role: "Bartender / Captain",
  eventStaffingSourceIds: [assignment._id, need._id],
};

describe("roster without double-counting split roles (AC-514)", () => {
  it("a person with two overlapping coverage sources renders one merged shift row", () => {
    const roster = EventTimelineStaffRoster.staffingRosterEntries({
      eventId: EVENT,
      assignments: [assignment],
      people: [ann],
      staffNeeds: [need],
      shifts: [shift],
    });
    expect(roster).toHaveLength(1);
    expect(roster[0]).toMatchObject({
      personId: ann._id,
      role: "Bartender / Captain",
      sourceIds: [assignment._id, need._id],
      startsAt: FIVE,
      endsAt: TEN,
      unassign: { docId: assignment._id, version: 2 },
    });
    const html = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(EventStaffingCoverageView, {
          roster,
          canManage: true,
          eventNeeds: [need],
          people: [ann],
          activePeople: [ann],
          busy: null,
          needPersonIds: {},
          onNeedPersonChange: () => undefined,
          onUnassign: () => undefined,
          onClaim: () => undefined,
          onFill: () => undefined,
          onCancel: () => undefined,
          conflictsFor: () => ({
            overlappingShifts: [],
            approvedOff: [],
            available: false,
          }),
        }),
      ),
    );
    expect(html.match(/data-testid="event-staffing-roster-row"/g)).toHaveLength(
      1,
    );
    expect(html).toContain("1 on the roster");
    expect(html).toContain("Bartender / Captain");
    expect(html).toContain("Food handler certificate on file");
  });
});
