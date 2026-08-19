/**
 * Issue #149 — Time records link to events; primary clock in/out exposes
 * editable datetimes. These fail if Clock in loses its event field, if
 * in/out are no longer editable on the primary flow, or if create drops
 * the event association.
 */
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MAX_DATETIME_LOCAL_INPUT_VALUE } from "../src/ui/BoundedDateInputs";
import { TimeSheetClockInForm } from "../src/features/workforce/TimeSheetPage";
import {
  CLOCK_OUT_PROMPT_FIELDS,
  buildClockInCreateArgs,
  currentShiftFor,
  parseTimeWindow,
  persistClockOut,
  persistPrimaryTimeRecord,
  resolveTimeRecordEventId,
} from "../src/features/workforce/timeRecordEntry";

const EVENT_ID = "evt_holiday_dinner";
const PERSON_ID = "per_alex";
const SHIFT_ID = "sh_service";

const FIVE_PM = Date.parse("2026-07-31T17:00:00");
const TEN_PM = Date.parse("2026-07-31T22:00:00");

function renderClockInForm() {
  return renderToStaticMarkup(
    createElement(TimeSheetClockInForm, {
      people: [{ _id: PERSON_ID, givenName: "Alex", familyName: "Rivera" }],
      events: [
        {
          _id: EVENT_ID,
          title: "Holiday Dinner",
          startsAt: FIVE_PM,
        },
      ],
      busy: false,
      defaultClockInLocal: "2026-07-31T17:00",
      onSubmit: () => undefined,
    }),
  );
}

function mockApi() {
  return {
    clockIn: vi.fn(async (args: { eventId?: string }) => ({
      docId: "tr_1",
      eventId: args.eventId,
    })),
    clockOut: vi.fn(async () => ({ version: 2, status: "closed" })),
    correct: vi.fn(async () => ({ version: 3, status: "corrected" })),
  };
}

describe("TimeSheet Clock in form (issue #149)", () => {
  it("exposes an event field on the primary Clock in flow", () => {
    const html = renderClockInForm();
    expect(html).toContain('name="eventId"');
    expect(html).toContain("Holiday Dinner");
    expect(html).toContain("clock-in-event");
  });

  it("exposes editable clock-in and clock-out datetimes on the primary flow", () => {
    const html = renderClockInForm();
    expect(html).toContain('name="clockInAt"');
    expect(html).toContain('name="clockOutAt"');
    expect(html).toContain('type="datetime-local"');
    expect(html).toContain(`max="${MAX_DATETIME_LOCAL_INPUT_VALUE}"`);
    expect(html).toContain("clock-in-at");
    expect(html).toContain("clock-out-at");
  });

  it("keeps the Clock in form fields in TimeSheetPage source", () => {
    const source = readFileSync(
      "src/features/workforce/TimeSheetPage.tsx",
      "utf8",
    );
    expect(source).toContain('name="eventId"');
    expect(source).toContain('name="clockInAt"');
    expect(source).toContain('name="clockOutAt"');
    expect(source).toContain("BoundedDateTimeLocalInput");
    expect(source).toContain("persistPrimaryTimeRecord");
    expect(source).toContain("persistClockOut");
    expect(source).toContain("CLOCK_OUT_PROMPT_FIELDS");
  });
});

describe("primary Clock out is editable", () => {
  it("prompts for an editable clockOutAt datetime, not only stamp-now", () => {
    expect(CLOCK_OUT_PROMPT_FIELDS).toEqual([
      {
        name: "clockOutAt",
        label: "Clock out",
        inputType: "datetime-local",
        required: true,
      },
    ]);
  });
});

describe("event association is not dropped on create", () => {
  it("forwards the chosen eventId on clock-in create args", () => {
    const args = buildClockInCreateArgs({
      personId: PERSON_ID,
      eventId: EVENT_ID,
      notes: "service",
    });
    expect(args).toEqual({
      personId: PERSON_ID,
      eventId: EVENT_ID,
      notes: "service",
    });
  });

  it("inherits the current shift event when the picker is left blank", () => {
    const shift = {
      _id: SHIFT_ID,
      personId: PERSON_ID,
      status: "started",
      startsAt: FIVE_PM,
      endsAt: TEN_PM,
      eventId: EVENT_ID,
    };
    expect(resolveTimeRecordEventId("", shift)).toBe(EVENT_ID);
    expect(
      buildClockInCreateArgs({ personId: PERSON_ID, eventId: "", shift }),
    ).toEqual({
      personId: PERSON_ID,
      shiftId: SHIFT_ID,
      eventId: EVENT_ID,
    });
  });

  it("lets an explicit event override the shift event", () => {
    const shift = {
      _id: SHIFT_ID,
      personId: PERSON_ID,
      status: "started",
      startsAt: FIVE_PM,
      endsAt: TEN_PM,
      eventId: "evt_other",
    };
    expect(resolveTimeRecordEventId(EVENT_ID, shift)).toBe(EVENT_ID);
  });

  it("persistPrimaryTimeRecord keeps eventId through a 5:00–10:00 PM window", async () => {
    const api = mockApi();
    const result = await persistPrimaryTimeRecord(api, {
      personId: PERSON_ID,
      eventId: EVENT_ID,
      clockInAt: FIVE_PM,
      clockOutAt: TEN_PM,
    });

    expect(api.clockIn).toHaveBeenCalledWith({
      personId: PERSON_ID,
      eventId: EVENT_ID,
    });
    expect(result.eventId).toBe(EVENT_ID);
    expect(result.window).toEqual({
      clockInAt: FIVE_PM,
      clockOutAt: TEN_PM,
    });
    expect(api.clockOut).toHaveBeenCalledWith({
      docId: "tr_1",
      version: 1,
    });
    expect(api.correct).toHaveBeenCalledWith({
      docId: "tr_1",
      version: 2,
      clockInAt: FIVE_PM,
      clockOutAt: TEN_PM,
    });
  });

  it("clock-in-now still attaches the event and does not close the record", async () => {
    const api = mockApi();
    const result = await persistPrimaryTimeRecord(api, {
      personId: PERSON_ID,
      eventId: EVENT_ID,
      stampNow: true,
      clockInAt: FIVE_PM,
      clockOutAt: TEN_PM,
    });
    expect(result.eventId).toBe(EVENT_ID);
    expect(result.window).toBeNull();
    expect(api.clockOut).not.toHaveBeenCalled();
    expect(api.correct).not.toHaveBeenCalled();
  });

  it("fails closed if a caller drops eventId from the create payload", () => {
    const dropped = buildClockInCreateArgs({
      personId: PERSON_ID,
      eventId: EVENT_ID,
    });
    // Guard: reversing the association (omitting eventId) must fail this suite.
    expect(dropped.eventId).toBeDefined();
    expect(JSON.stringify(dropped)).toContain(EVENT_ID);
  });
});

describe("window parsing and clock-out", () => {
  it("parses a finished 5:00–10:00 PM window", () => {
    expect(parseTimeWindow("2026-07-31T17:00", "2026-07-31T22:00")).toEqual({
      clockInAt: Date.parse("2026-07-31T17:00"),
      clockOutAt: Date.parse("2026-07-31T22:00"),
    });
  });

  it("rejects a clock-out before clock-in", () => {
    expect(parseTimeWindow(TEN_PM, FIVE_PM)).toBeNull();
  });

  it("applies the prompted clock-out time on the primary Clock out action", async () => {
    const api = mockApi();
    await persistClockOut(api, {
      docId: "tr_open",
      version: 1,
      existingClockInAt: FIVE_PM,
      clockOutAt: TEN_PM,
    });
    expect(api.clockOut).toHaveBeenCalledWith({
      docId: "tr_open",
      version: 1,
    });
    expect(api.correct).toHaveBeenCalledWith({
      docId: "tr_open",
      version: 2,
      clockInAt: FIVE_PM,
      clockOutAt: TEN_PM,
    });
  });

  it("matches a started shift covering now so event can be inherited", () => {
    const now = FIVE_PM + 60 * 60 * 1000;
    const shift = currentShiftFor(
      PERSON_ID,
      [
        {
          _id: SHIFT_ID,
          personId: PERSON_ID,
          status: "started",
          startsAt: FIVE_PM,
          endsAt: TEN_PM,
          eventId: EVENT_ID,
        },
      ],
      now,
    );
    expect(shift?._id).toBe(SHIFT_ID);
    expect(shift?.eventId).toBe(EVENT_ID);
  });
});
