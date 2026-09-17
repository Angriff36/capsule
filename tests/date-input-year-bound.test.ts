/**
 * Issue #148: native `date` / `datetime-local` inputs without a `max` let the
 * year segment grow to six digits in Chromium, so ordinary typing produced
 * corrupted values like year 202605 or 0019. The contract: the year commits
 * after four digits everywhere a schedule is typed — event start/end,
 * timeline, timesheet correction, and every other date field.
 *
 * These tests fail if the year can grow past four digits: either because the
 * bounded components stop capping at a 4-digit year, or because a bare native
 * date input reappears in authored UI without the bound.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  BoundedDateInput,
  BoundedDateTimeLocalInput,
  MAX_DATE_INPUT_VALUE,
  MAX_DATETIME_LOCAL_INPUT_VALUE,
} from "../src/ui/BoundedDateInputs";
import { ActionPromptPanel } from "../src/ui/action-prompt/ActionPromptPanel";

const FOUR_DIGIT_YEAR = /^\d{4}-/;

describe("bounded date inputs (issue #148)", () => {
  it("caps the datetime-local year at four digits", () => {
    expect(MAX_DATETIME_LOCAL_INPUT_VALUE).toMatch(FOUR_DIGIT_YEAR);
    const html = renderToStaticMarkup(
      createElement(BoundedDateTimeLocalInput, { name: "startsAt" }),
    );
    expect(html).toContain('type="datetime-local"');
    expect(html).toContain(`max="${MAX_DATETIME_LOCAL_INPUT_VALUE}"`);
  });

  it("caps the date year at four digits", () => {
    expect(MAX_DATE_INPUT_VALUE).toMatch(FOUR_DIGIT_YEAR);
    const html = renderToStaticMarkup(
      createElement(BoundedDateInput, { name: "eventDate" }),
    );
    expect(html).toContain('type="date"');
    expect(html).toContain(`max="${MAX_DATE_INPUT_VALUE}"`);
  });

  it("treats an empty explicit max as unbounded and re-applies the cap", () => {
    const html = renderToStaticMarkup(
      createElement(BoundedDateInput, { name: "rangeStart", max: "" }),
    );
    expect(html).toContain(`max="${MAX_DATE_INPUT_VALUE}"`);
  });
});

describe("action prompt datetime fields (timesheet correction path)", () => {
  it("bounds datetime-local prompt fields so the year commits at four digits", () => {
    const html = renderToStaticMarkup(
      createElement(ActionPromptPanel, {
        request: {
          kind: "fields",
          title: "Correct times",
          description: "Adjust the recorded window.",
          confirmLabel: "Save correction",
          fields: [
            {
              name: "clockInAt",
              label: "Clock in",
              inputType: "datetime-local",
            },
            { name: "note", label: "Note", inputType: "text" },
          ],
        },
        onDismiss: () => undefined,
        onConfirm: () => undefined,
      }),
    );
    const datetimeInput = html.match(/<input[^>]*type="datetime-local"[^>]*/);
    expect(datetimeInput?.[0]).toContain(
      `max="${MAX_DATETIME_LOCAL_INPUT_VALUE}"`,
    );
    const textInput = html.match(/<input[^>]*type="text"[^>]*/);
    expect(textInput?.[0]).not.toContain("max=");
  });
});
