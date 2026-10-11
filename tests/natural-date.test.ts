import { describe, expect, it } from "vitest";
import { addLocalDateTimeHours, parseNaturalDate } from "../src/ui/naturalDate";

const now = new Date(2026, 9, 5, 10, 0);

function parse(
  input: string,
  options: Parameters<typeof parseNaturalDate>[1] = { kind: "datetime" },
) {
  return parseNaturalDate(input, { now, ...options });
}

describe("natural schedule date entry", () => {
  it("resolves complete date phrases in local calendar time", () => {
    expect(parse("today", { kind: "date" })).toMatchObject({
      ok: true,
      value: "2026-10-05",
    });
    expect(parse("tomorrow", { kind: "date" })).toMatchObject({
      ok: true,
      value: "2026-10-06",
    });
    expect(parse("Friday", { kind: "date" })).toMatchObject({
      ok: true,
      value: "2026-10-09",
    });
    expect(parse("next Friday", { kind: "date" })).toMatchObject({
      ok: true,
      value: "2026-10-16",
    });
    // From a Saturday, the next week's Wednesday is four days away.
    expect(
      parseNaturalDate("next Wednesday", {
        kind: "date",
        now: new Date(2026, 9, 10, 11, 0),
      }),
    ).toMatchObject({ ok: true, value: "2026-10-14" });
    expect(parse("in 2 weeks", { kind: "date" })).toMatchObject({
      ok: true,
      value: "2026-10-19",
    });
  });

  it("uses an explicit default time and can retain a historical year", () => {
    expect(parse("June 14 3pm")).toMatchObject({
      ok: true,
      value: "2027-06-14T15:00",
    });
    expect(
      parse("June 14 3pm", { kind: "datetime", direction: "any" }),
    ).toMatchObject({
      ok: true,
      value: "2026-06-14T15:00",
    });
    expect(parse("10/16", { kind: "datetime" })).toMatchObject({
      ok: true,
      value: "2026-10-16T09:00",
    });
  });

  it("resolves end-field phrases against the start without UTC date conversion", () => {
    expect(
      parse("+4h", { kind: "datetime", anchor: "2026-10-16T18:00" }),
    ).toMatchObject({
      ok: true,
      value: "2026-10-16T22:00",
    });
    expect(
      parse("+30m", { kind: "datetime", anchor: "2026-10-16T18:00" }),
    ).toMatchObject({ ok: true, value: "2026-10-16T18:30" });
    expect(
      parse("11pm", { kind: "datetime", anchor: "2026-10-16T18:00" }),
    ).toMatchObject({
      ok: true,
      value: "2026-10-16T23:00",
    });
    expect(addLocalDateTimeHours("2026-10-31T22:00", 8)).toBe(
      "2026-11-01T06:00",
    );
  });

  it("rejects incomplete and impossible phrases", () => {
    expect(parse("asdf")).toMatchObject({ ok: false, reason: "unparseable" });
    expect(parse("")).toMatchObject({ ok: false, reason: "empty" });
    expect(parse("June 31")).toMatchObject({
      ok: false,
      reason: "unparseable",
    });
  });
});
