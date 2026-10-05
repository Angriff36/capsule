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
    ).toThrow("Pick what type of event this is.");
  });

  it("stamps the trimmed service style name next to the style id", () => {
    const args = new EventPlanEngagementFormMapper().toCommandArgs(
      validInput({
        serviceStyleId: "style-id",
        serviceStyle: { name: "  Full Service  " },
      }),
    );

    expect(args).toMatchObject({
      serviceStyleId: "style-id",
      serviceStyleName: "Full Service",
    });
  });

  it("stamps the trimmed occasion name next to the occasion id", () => {
    const args = new EventPlanEngagementFormMapper().toCommandArgs(
      validInput({
        occasionId: "occ-id",
        occasion: { name: "  Wedding  " },
      }),
    );

    expect(args).toMatchObject({
      occasionId: "occ-id",
      occasionName: "Wedding",
    });
  });

  it("stamps the trimmed client name next to the client id", () => {
    const args = new EventPlanEngagementFormMapper().toCommandArgs(
      validInput({
        clientId: "client-id",
        client: { name: "  Acme Catering  " },
      }),
    );

    expect(args).toMatchObject({
      clientId: "client-id",
      clientName: "Acme Catering",
    });
  });

  it("stamps the trimmed owner name next to the salesperson id", () => {
    const args = new EventPlanEngagementFormMapper().toCommandArgs(
      validInput({
        salespersonId: "person-id",
        salesperson: { name: "  Pat Owner  " },
      }),
    );

    expect(args).toMatchObject({
      assignedToId: "person-id",
      ownerName: "Pat Owner",
    });
  });

  it("stamps the referral source id", () => {
    const args = new EventPlanEngagementFormMapper().toCommandArgs(
      validInput({ referralSourceId: "  ref-id  " }),
    );

    expect(args).toMatchObject({ referralSourceId: "ref-id" });
  });
});
