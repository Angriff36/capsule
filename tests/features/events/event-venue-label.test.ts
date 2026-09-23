import { describe, expect, it } from "vitest";
import { eventVenueLabel } from "../../../src/features/events/eventVenueLabel";

describe("eventVenueLabel", () => {
  it("prints the booked snapshot, not a later catalog rename", () => {
    expect(
      eventVenueLabel({
        venueId: "venue-a",
        venueName: "Garden Hall",
        venue: { name: "Garden Hall RENAMED" },
        venuesLoading: false,
      }),
    ).toBe("Garden Hall");
  });

  it("keeps the snapshot while the venue list is still loading", () => {
    expect(
      eventVenueLabel({
        venueId: "venue-a",
        venueName: "Garden Hall",
        venue: null,
        venuesLoading: true,
      }),
    ).toBe("Garden Hall");
  });

  it("falls back to the live venue name for legacy events with no snapshot", () => {
    expect(
      eventVenueLabel({
        venueId: "venue-a",
        venueName: null,
        venue: { name: "Lakeside Pavilion" },
        venuesLoading: false,
      }),
    ).toBe("Lakeside Pavilion");
  });

  it("says loading while a set venueId has no row yet and no snapshot", () => {
    expect(
      eventVenueLabel({
        venueId: "venue-a",
        venueName: null,
        venue: null,
        venuesLoading: true,
      }),
    ).toBe("Loading venue…");
  });

  it("says unavailable when a set venueId has no row and loading is done", () => {
    expect(
      eventVenueLabel({
        venueId: "venue-a",
        venueName: null,
        venue: null,
        venuesLoading: false,
      }),
    ).toBe("Venue isn't available");
  });

  it("says no venue yet only when the event has no venueId at all", () => {
    expect(
      eventVenueLabel({
        venueId: null,
        venueName: null,
        venue: null,
        venuesLoading: false,
      }),
    ).toBe("No venue yet");
  });

  it("never says no venue yet while a venue is attached", () => {
    for (const venuesLoading of [true, false]) {
      const label = eventVenueLabel({
        venueId: "venue-a",
        venueName: "",
        venue: undefined,
        venuesLoading,
      });
      expect(label).not.toBe("No venue yet");
    }
  });
});
