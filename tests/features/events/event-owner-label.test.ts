import { describe, expect, it } from "vitest";
import { eventOwnerLabel } from "../../../src/features/events/eventOwnerLabel";

describe("eventOwnerLabel", () => {
  it("prints the booked snapshot, not a later catalog rename", () => {
    expect(
      eventOwnerLabel({
        assignedToId: "person-a",
        ownerName: "Pat Owner",
        liveName: "Pat Owner RENAMED",
        peopleLoading: false,
      }),
    ).toBe("Pat Owner");
  });

  it("keeps the snapshot while the people list is still loading", () => {
    expect(
      eventOwnerLabel({
        assignedToId: "person-a",
        ownerName: "Pat Owner",
        liveName: "—",
        peopleLoading: true,
      }),
    ).toBe("Pat Owner");
  });

  it("falls back to the live person name for legacy events with no snapshot", () => {
    expect(
      eventOwnerLabel({
        assignedToId: "person-a",
        ownerName: null,
        liveName: "Pat Owner",
        peopleLoading: false,
      }),
    ).toBe("Pat Owner");
  });

  it("says loading while a set person id has no row yet and no snapshot", () => {
    expect(
      eventOwnerLabel({
        assignedToId: "person-a",
        ownerName: null,
        liveName: "—",
        peopleLoading: true,
      }),
    ).toBe("Loading owner…");
  });

  it("says unavailable when a set person id has no row and loading is done", () => {
    expect(
      eventOwnerLabel({
        assignedToId: "person-a",
        ownerName: null,
        liveName: "—",
        peopleLoading: false,
      }),
    ).toBe("Owner unavailable");
  });

  it("says no owner when the event has no assigned person at all", () => {
    expect(
      eventOwnerLabel({
        assignedToId: null,
        ownerName: null,
        liveName: "—",
        peopleLoading: false,
      }),
    ).toBe("No owner assigned to this event.");
  });
});
