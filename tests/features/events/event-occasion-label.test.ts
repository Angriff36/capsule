import { describe, expect, it } from "vitest";
import { eventOccasionLabel } from "../../../src/features/events/eventOccasionLabel";

describe("eventOccasionLabel", () => {
  it("prints the booked snapshot, not a later catalog rename", () => {
    expect(
      eventOccasionLabel({
        occasionId: "occ-a",
        occasionName: "Wedding",
        occasion: { name: "Wedding RENAMED" },
        occasionsLoading: false,
      }),
    ).toBe("Wedding");
  });

  it("keeps the snapshot while the occasion list is still loading", () => {
    expect(
      eventOccasionLabel({
        occasionId: "occ-a",
        occasionName: "Wedding",
        occasion: null,
        occasionsLoading: true,
      }),
    ).toBe("Wedding");
  });

  it("falls back to the live occasion name for legacy events with no snapshot", () => {
    expect(
      eventOccasionLabel({
        occasionId: "occ-a",
        occasionName: null,
        occasion: { name: "Anniversary" },
        occasionsLoading: false,
      }),
    ).toBe("Anniversary");
  });

  it("says loading while a set occasion id has no row yet and no snapshot", () => {
    expect(
      eventOccasionLabel({
        occasionId: "occ-a",
        occasionName: null,
        occasion: null,
        occasionsLoading: true,
      }),
    ).toBe("Loading occasion…");
  });

  it("says unavailable when a set occasion id has no row and loading is done", () => {
    expect(
      eventOccasionLabel({
        occasionId: "occ-a",
        occasionName: null,
        occasion: null,
        occasionsLoading: false,
      }),
    ).toBe("Occasion unavailable");
  });

  it("returns null only when the event has no occasion id at all", () => {
    expect(
      eventOccasionLabel({
        occasionId: null,
        occasionName: null,
        occasion: null,
        occasionsLoading: false,
      }),
    ).toBeNull();
  });
});
