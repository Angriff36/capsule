import { describe, expect, it } from "vitest";
import { clockOutEvidenceLabel } from "../../../src/features/workforce/TimeSheetPage";

describe("clock-out location on the time sheet", () => {
  const clockIn = { clockInLatitude: 40.7128, clockInLongitude: -74.006 };

  it("shows nothing when the phone gave no clock-out location", () => {
    expect(clockOutEvidenceLabel(clockIn)).toBeNull();
  });

  it("says how far the clock-out was from the clock-in", () => {
    expect(
      clockOutEvidenceLabel({
        ...clockIn,
        clockOutLatitude: 40.758,
        clockOutLongitude: -73.9855,
        clockOutAccuracyMeters: 20,
      }),
    ).toBe(
      "Phone location 40.7580, -73.9855 (±20 m) · 5.3 km from the clock-in",
    );
  });

  it("calls a nearby clock-out the same place", () => {
    expect(
      clockOutEvidenceLabel({
        ...clockIn,
        clockOutLatitude: 40.713,
        clockOutLongitude: -74.0062,
      }),
    ).toBe("Phone location 40.7130, -74.0062 · same place as the clock-in");
  });

  it("shows the clock-out location alone when the clock-in had none", () => {
    expect(
      clockOutEvidenceLabel({ clockOutLatitude: 1, clockOutLongitude: 2 }),
    ).toBe("Phone location 1.0000, 2.0000");
  });
});
