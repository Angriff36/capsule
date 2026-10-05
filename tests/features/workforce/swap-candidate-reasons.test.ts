/**
 * AC-515 / AC-504 screens: every left-out person shows a named reason (staff
 * swap list and the manager's suggestion list), and a staffing need shows
 * what the work needs in plain words.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SwapCandidateExclusions } from "../../../src/features/staff/SwapCandidateExclusions";
import { StaffNeedSuggestionList } from "../../../src/features/events/StaffNeedSuggestions";
import { waitlistLine } from "../../../src/features/events/StaffNeedWaitlist";
import {
  autoFillSummary,
  staffNeedDemandSummary,
} from "../../../src/features/events/eventStaffNeedDemand";

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ");

describe("left-out people always show a reason", () => {
  it("each excluded swap candidate renders its named exclusion reason", () => {
    const html = text(
      renderToStaticMarkup(
        createElement(SwapCandidateExclusions, {
          excluded: [
            {
              personId: "p1",
              name: "Kai Swap",
              reason: "Not free at this time",
            },
            {
              personId: "p2",
              name: "Lee Swap",
              reason: "Has no Capsule sign-in yet",
            },
          ],
        }),
      ),
    );
    expect(html).toContain("Can't take this shift (2)");
    expect(html).toContain("Kai Swap - Not free at this time");
    expect(html).toContain("Lee Swap - Has no Capsule sign-in yet");
  });

  it("the manager's suggestion list ranks picks and names every exclusion", () => {
    const html = text(
      renderToStaticMarkup(
        createElement(StaffNeedSuggestionList, {
          suggested: [
            {
              personId: "a",
              name: "Ann Pool",
              prefersRole: true,
              agency: null,
              hoursBooked: 4,
            },
            {
              personId: "f",
              name: "Fay Pool",
              prefersRole: false,
              agency: "PeopleReady",
              hoursBooked: 0,
            },
          ],
          excluded: [
            {
              personId: "b",
              name: "Bo Pool",
              reason: "Approved time off at this time",
            },
            {
              personId: "c",
              name: "Cy Pool",
              reason: "No current Food handler certificate",
            },
          ],
          onPick: () => undefined,
          disabled: false,
        }),
      ),
    );
    expect(html.indexOf("Ann Pool")).toBeLessThan(html.indexOf("Fay Pool"));
    expect(html).toContain("prefers this role");
    expect(html).toContain("agency: PeopleReady");
    expect(html).toContain("Left out (2)");
    expect(html).toContain("Bo Pool - Approved time off at this time");
    expect(html).toContain("Cy Pool - No current Food handler certificate");
  });
});

describe("waiting list line (AC-507)", () => {
  it("names who is waiting, oldest first, and skips people who left", () => {
    const entry = (
      id: string,
      personId: string,
      joinedAt: number,
      status = "waiting",
    ) => ({
      _id: id,
      version: 1,
      staffNeedId: "need",
      personId,
      status,
      joinedAt,
    });
    expect(
      waitlistLine(
        [
          entry("e1", "bo", 20),
          entry("e2", "ann", 10),
          entry("e3", "cy", 5, "left"),
        ],
        "need",
        [
          { _id: "ann", givenName: "Ann", familyName: "Pool" },
          { _id: "bo", givenName: "Bo", familyName: "Pool" },
          { _id: "cy", givenName: "Cy", familyName: "Pool" },
        ],
      ),
    ).toBe("Waiting list: Ann Pool, Bo Pool");
    expect(waitlistLine([], "need", [])).toBe("");
  });
});

describe("what the work needs, in plain words (AC-504)", () => {
  it("summarises certificate, skills, uniform, place, pay and crew template spot", () => {
    expect(
      staffNeedDemandSummary({
        qualificationName: "Food handler",
        skills: "French service",
        uniform: "Black shirt",
        workLocation: "Dining room",
        payBasis: "hourly",
        budgetHourlyRate: 24,
        templateSlot: 2,
      }),
    ).toBe(
      "Needs Food handler certificate · Skills: French service · Wear: Black shirt · At: Dining room · Hourly, budget $24.00/hr · Crew template spot 2",
    );
    expect(staffNeedDemandSummary({})).toBe("");
  });

  it("says who auto-fill placed and what is still open", () => {
    expect(
      autoFillSummary({
        filled: [{ role: "Server", name: "Ann Pool" }],
        left: [{ role: "Server", reason: "Nobody suitable is free" }],
      }),
    ).toBe(
      "Filled 1: Ann Pool (Server). Still open: Server - nobody suitable is free.",
    );
  });
});
