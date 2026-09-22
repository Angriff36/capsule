import { describe, expect, it } from "vitest";
import { eventTimingStoredMinutes } from "../../../src/features/events/eventTimingInputs";

describe("eventTimingStoredMinutes", () => {
  it("prints the stored minutes over the live catalog suggestion", () => {
    expect(eventTimingStoredMinutes({ stored: 180, suggested: 90 })).toBe(180);
  });

  it("treats a stored 0 as a real input, not a missing one", () => {
    expect(eventTimingStoredMinutes({ stored: 0, suggested: 90 })).toBe(0);
  });

  it("never invents a stored minute from the catalog suggestion", () => {
    expect(
      eventTimingStoredMinutes({ stored: null, suggested: 180 }),
    ).toBeNull();
  });

  it("returns null for a missing stored minute", () => {
    expect(eventTimingStoredMinutes({ stored: undefined })).toBeNull();
    expect(eventTimingStoredMinutes({})).toBeNull();
  });

  it("returns null for a non-finite stored minute", () => {
    expect(
      eventTimingStoredMinutes({ stored: NaN, suggested: 180 }),
    ).toBeNull();
  });

  it("still returns the stored minutes when no suggestion is given", () => {
    expect(eventTimingStoredMinutes({ stored: 60 })).toBe(60);
  });
});
