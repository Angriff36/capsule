/**
 * AC-505: preferred roles and approved work places shape suggestions; the
 * roster and crew template screens say them in plain words.
 */
import { describe, expect, it } from "vitest";
import { suggestStaff } from "../../../src/lib/staffSuggestions";
import {
  pickStaffingTemplate,
  templateLineCount,
} from "../../../src/lib/staffingTemplates";
import { schedulingSummary } from "../../../src/features/workforce/StaffSchedulingSection";
import { describeTemplateLines } from "../../../src/features/workforce/StaffingTemplatesPage";

const person = (id: string, extra: Record<string, unknown> = {}) => ({
  _id: id,
  givenName: id,
  familyName: "Crew",
  status: "active",
  ...extra,
});
const work = {
  role: "Bartender",
  startsAt: 10,
  endsAt: 20,
  places: ["Harbor Hall"],
};
const none = { shifts: [], timeOff: [], qualifications: [] };

describe("worker scheduling facts (AC-505)", () => {
  it("preferred roles and approved work locations constrain suggestions", () => {
    const result = suggestStaff(
      work,
      [
        person("Ann"),
        person("Bo", { preferredRoles: ["bartender"] }),
        person("Cy", { approvedWorkLocations: ["Patio"] }),
        person("Dee", { approvedWorkLocations: ["harbor hall"] }),
        person("Eve", { status: "inactive" }),
      ],
      none,
      0,
    );
    expect(result.suggested.map((row) => row.personId)).toEqual([
      "Bo",
      "Ann",
      "Dee",
    ]);
    expect(result.excluded).toEqual([
      {
        personId: "Cy",
        name: "Cy Crew",
        reason: "Not approved to work at Harbor Hall",
      },
      { personId: "Eve", name: "Eve Crew", reason: "Paused - not taking work" },
    ]);
  });

  it("roster and template screens say the facts plainly", () => {
    expect(
      schedulingSummary({
        preferredRoles: ["Server"],
        approvedWorkLocations: ["Patio"],
        staffingVendor: "PeopleReady",
        schedulingHoldReason: "Waiting on paperwork",
      }),
    ).toBe(
      "Do not schedule: Waiting on paperwork · Prefers Server · Only at Patio · Agency: PeopleReady",
    );
    expect(
      describeTemplateLines(
        JSON.stringify([
          { role: "Captain", fixedCount: 1 },
          {
            role: "Server",
            guestsPerWorker: 20,
            minCount: 2,
            qualificationName: "Food handler",
          },
        ]),
      ),
    ).toBe(
      "Captain: 1 · Server: 1 per 20 guests (at least 2, Food handler certificate)",
    );
  });

  it("template sizing and choice", () => {
    const line = { role: "Server", guestsPerWorker: 20, minCount: 2 };
    expect(templateLineCount(line, 10)).toBe(2);
    expect(templateLineCount(line, 50)).toBe(3);
    expect(templateLineCount(line, null)).toBe(2);
    const base = { lines: "[]", status: "active" };
    const picked = pickStaffingTemplate(
      [
        { ...base, _id: "any", name: "Any" },
        {
          ...base,
          _id: "wide",
          name: "Wide",
          serviceStyleId: "s",
          minGuests: 0,
          maxGuests: 500,
        },
        {
          ...base,
          _id: "narrow",
          name: "Narrow",
          serviceStyleId: "s",
          minGuests: 40,
          maxGuests: 120,
        },
        {
          ...base,
          _id: "off",
          name: "Off",
          serviceStyleId: "s",
          status: "retired",
        },
      ],
      { serviceStyleId: "s", guests: 60 },
    );
    expect(picked?._id).toBe("narrow");
    expect(
      pickStaffingTemplate([{ ...base, _id: "x", name: "X", minGuests: 200 }], {
        guests: 60,
      }),
    ).toBeNull();
  });
});
