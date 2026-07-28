import { describe, expect, it } from "vitest";
import {
  EventPlanEngagementFormMapper,
  type EventPlanEngagementFormInput,
} from "../../../src/features/events/EventPlanEngagementFormMapper";

function validInput(
  overrides: Partial<EventPlanEngagementFormInput> = {},
): EventPlanEngagementFormInput {
  return {
    clientId: "client-id",
    venueId: "venue-id",
    venue: undefined,
    title: "Summer dinner",
    eventTypeRaw: "  corporate dinner  ",
    occasionId: "",
    serviceStyleId: "",
    salespersonId: "",
    referralSourceId: "",
    startsAtRaw: "2026-08-01T18:00:00.000Z",
    endsAtRaw: "2026-08-01T22:00:00.000Z",
    expectedHeadcountRaw: "60",
    primaryContactName: "Ryan",
    primaryContactEmail: "",
    primaryContactPhone: "",
    budgetAmountRaw: "5000",
    quotedPriceRaw: "6000",
    accessibilityNeedsRaw: "",
    serviceRequirements: "",
    operationalRequirements: "",
    ...overrides,
  };
}

describe("EventPlanEngagementFormMapper", () => {
  it("includes the trimmed event type in planEngagement command args", () => {
    const args = new EventPlanEngagementFormMapper().toCommandArgs(
      validInput(),
    );

    expect(args).toMatchObject({ eventType: "corporate dinner" });
  });

  it("rejects a blank event type", () => {
    expect(() =>
      new EventPlanEngagementFormMapper().toCommandArgs(
        validInput({ eventTypeRaw: "   " }),
      ),
    ).toThrow("Event type is required.");
  });
});
