/**
 * AC-518: My Day shows the call time (the shift start, which follows the run
 * the worker travels with), venue, what to wear, notes and whether the worker
 * still has to confirm the assignment.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  MyShiftWorkDetails,
  shiftWorkDetails,
} from "../../../src/features/staff/MyShiftWorkDetails";
import { formatTime } from "../../../src/lib/format";

const CALL = Date.parse("2026-10-18T15:45:00Z");
const shift = {
  personId: "p_kit",
  startsAt: CALL,
  eventStaffingSourceIds: ["a_captain", "n_bar"],
};
const event = { venueName: "Harbor Hall", venueAddress: "1 Pier Rd" };
const need = {
  _id: "n_bar",
  uniform: "Black shirt, black pants",
  workLocation: "Bar tent",
  description: "Two stations",
};

describe("My Day call time and acknowledgement (AC-518)", () => {
  it("My Day shows the route-aware call time and acknowledgement state for the assignment", () => {
    const waiting = shiftWorkDetails(
      shift,
      [
        {
          _id: "a_captain",
          version: 1,
          personId: "p_kit",
          status: "assigned",
          notes: "Bring a wine key",
        },
      ],
      [need],
      event,
    );
    expect(waiting).toMatchObject({
      callTime: CALL,
      venue: "Harbor Hall",
      wear: ["Black shirt, black pants"],
      notes: ["At Bar tent", "Two stations", "Bring a wine key"],
      toConfirm: { docId: "a_captain", version: 1 },
      confirmed: false,
    });
    const html = renderToStaticMarkup(
      createElement(MyShiftWorkDetails, {
        details: waiting,
        busy: false,
        onConfirm: () => undefined,
      }),
    );
    expect(html).toContain(`Call time ${formatTime(CALL)}`);
    expect(html).toContain("Harbor Hall");
    expect(html).toContain("Wear: Black shirt, black pants");
    expect(html).toContain("Please confirm you can work this");

    const done = shiftWorkDetails(
      shift,
      [
        {
          _id: "a_captain",
          version: 2,
          personId: "p_kit",
          status: "confirmed",
        },
      ],
      [need],
      event,
    );
    expect(done).toMatchObject({ toConfirm: null, confirmed: true });
    expect(
      renderToStaticMarkup(
        createElement(MyShiftWorkDetails, {
          details: done,
          busy: false,
          onConfirm: () => undefined,
        }),
      ),
    ).toContain("You confirmed this shift");

    // Someone else's assignment on the same shift source never shows here.
    const other = shiftWorkDetails(
      shift,
      [{ _id: "a_captain", version: 1, personId: "p_lou", status: "assigned" }],
      [],
      event,
    );
    expect(other.toConfirm).toBeNull();
  });
});
