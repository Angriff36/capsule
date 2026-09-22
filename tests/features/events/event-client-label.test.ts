import { describe, expect, it } from "vitest";
import { eventClientLabel } from "../../../src/features/events/eventClientLabel";

describe("eventClientLabel", () => {
  it("prints the booked snapshot, not a later catalog rename", () => {
    expect(
      eventClientLabel({
        clientId: "client-a",
        clientName: "Acme Catering",
        liveName: "Acme RENAMED",
        clientsLoading: false,
      }),
    ).toBe("Acme Catering");
  });

  it("keeps the snapshot while the client list is still loading", () => {
    expect(
      eventClientLabel({
        clientId: "client-a",
        clientName: "Acme Catering",
        liveName: "—",
        clientsLoading: true,
      }),
    ).toBe("Acme Catering");
  });

  it("falls back to the live client name for legacy events with no snapshot", () => {
    expect(
      eventClientLabel({
        clientId: "client-a",
        clientName: null,
        liveName: "Acme Catering",
        clientsLoading: false,
      }),
    ).toBe("Acme Catering");
  });

  it("says loading while a set client id has no row yet and no snapshot", () => {
    expect(
      eventClientLabel({
        clientId: "client-a",
        clientName: null,
        liveName: "—",
        clientsLoading: true,
      }),
    ).toBe("Loading client…");
  });

  it("says unavailable when a set client id has no row and loading is done", () => {
    expect(
      eventClientLabel({
        clientId: "client-a",
        clientName: null,
        liveName: "—",
        clientsLoading: false,
      }),
    ).toBe("Client unavailable");
  });

  it("returns a dash only when the event has no client id at all", () => {
    expect(
      eventClientLabel({
        clientId: null,
        clientName: null,
        liveName: "—",
        clientsLoading: false,
      }),
    ).toBe("—");
  });
});
