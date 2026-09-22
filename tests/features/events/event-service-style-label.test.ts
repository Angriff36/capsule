import { describe, expect, it } from "vitest";
import { eventServiceStyleLabel } from "../../../src/features/events/eventServiceStyleLabel";

describe("eventServiceStyleLabel", () => {
  it("prints the booked snapshot, not a later catalog rename", () => {
    expect(
      eventServiceStyleLabel({
        serviceStyleId: "style-a",
        serviceStyleName: "Full Service",
        serviceStyle: { name: "Full Service RENAMED" },
        serviceStylesLoading: false,
      }),
    ).toBe("Full Service");
  });

  it("keeps the snapshot while the style list is still loading", () => {
    expect(
      eventServiceStyleLabel({
        serviceStyleId: "style-a",
        serviceStyleName: "Full Service",
        serviceStyle: null,
        serviceStylesLoading: true,
      }),
    ).toBe("Full Service");
  });

  it("falls back to the live style name for legacy events with no snapshot", () => {
    expect(
      eventServiceStyleLabel({
        serviceStyleId: "style-a",
        serviceStyleName: null,
        serviceStyle: { name: "Plated" },
        serviceStylesLoading: false,
      }),
    ).toBe("Plated");
  });

  it("says loading while a set style id has no row yet and no snapshot", () => {
    expect(
      eventServiceStyleLabel({
        serviceStyleId: "style-a",
        serviceStyleName: null,
        serviceStyle: null,
        serviceStylesLoading: true,
      }),
    ).toBe("Loading service style…");
  });

  it("says unavailable when a set style id has no row and loading is done", () => {
    expect(
      eventServiceStyleLabel({
        serviceStyleId: "style-a",
        serviceStyleName: null,
        serviceStyle: null,
        serviceStylesLoading: false,
      }),
    ).toBe("Service style unavailable");
  });

  it("returns null only when the event has no style id at all", () => {
    expect(
      eventServiceStyleLabel({
        serviceStyleId: null,
        serviceStyleName: null,
        serviceStyle: null,
        serviceStylesLoading: false,
      }),
    ).toBeNull();
  });
});
