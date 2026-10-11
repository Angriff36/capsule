import { describe, expect, it } from "vitest";
import { eventStageGate } from "../src/features/events/dashboard/eventStageGate";

// Event.lockForSales refuses an event with no venue (unless it is a pickup
// order). The "Before sales lock" list must say so instead of reading
// "0 open" and then failing on the button.
describe("sales lock list names the venue", () => {
  const approved = {
    stage: "approved",
    plannedAt: 1,
    clientId: "client-1",
    startsAt: 10,
    endsAt: 20,
    expectedHeadcount: 75,
    hasServiceStyle: true,
  };
  const venueCheck = (hasVenueOrPickup?: boolean) =>
    eventStageGate({ ...approved, hasVenueOrPickup })?.checks?.find(
      (check) => check.key === "venue",
    );

  it("is open and required while the event has no venue", () => {
    expect(venueCheck(false)).toMatchObject({
      label: "Venue picked",
      done: false,
      required: true,
      fix: { label: "Pick venue", to: { kind: "sheet", sheet: "edit" } },
    });
  });

  it("is done with a venue, or for a pickup order", () => {
    expect(venueCheck(true)?.done).toBe(true);
  });
});
