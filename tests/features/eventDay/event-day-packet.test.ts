import { describe, expect, it } from "vitest";
import {
  deriveEventDay,
  type EventDayInputs,
} from "../../../src/features/eventDay/eventDayModel";
const sections = [
  "venue",
  "staffing",
  "timeline",
  "menu",
  "vehicles",
  "layouts",
  "equipment",
  "contacts",
  "packlist",
];
function completeInput(): EventDayInputs {
  return {
    event: {
      _id: "event",
      stage: "final",
      startsAt: Date.parse("2026-09-17T12:00:00Z"),
      venueName: "Venue",
      primaryContactName: "Contact",
      primaryContactPhone: "555-0100",
    },
    assignments: [{ status: "confirmed" }],
    staffNeeds: [],
    activities: [{ startsAt: 1 }],
    eventDishes: [{}],
    deliveries: [],
    layoutSections: [],
    equipmentReservations: [],
    clientContacts: [],
    packLists: [{ _id: "pack", status: "packed" }],
    packListItems: [],
    packetReadiness: {
      ready: true,
      requiredOpenIssueCount: 0,
      finalSignoffsComplete: true,
      sections: sections.map((section) => ({
        section,
        status: "ready",
        openIssueCount: 0,
        urgentAction: null,
      })),
    },
  } as unknown as EventDayInputs;
}
describe("Event Day packet readiness", () => {
  it("does not show ready for an otherwise complete event with packet issues", () => {
    const input: any = completeInput();
    input.packetReadiness.ready = false;
    input.packetReadiness.requiredOpenIssueCount = 2;
    input.packetReadiness.sections[4] = {
      section: "vehicles",
      status: "blocked",
      openIssueCount: 2,
      urgentAction: "Confirm vehicle assignment with the manager.",
    };
    const summary = deriveEventDay(input);
    expect(summary.ringLabel).not.toBe("Show ready");
    expect(summary.readinessPct).toBeLessThan(100);
    expect(summary.sections).toHaveLength(9);
    expect(summary.sections.find((s) => s.key === "vehicles")).toMatchObject({
      status: "blocked",
      openIssueCount: 2,
      urgentAction: "Confirm vehicle assignment with the manager.",
    });
  });
  it("keeps final signoffs and unavailable packet state from showing ready", () => {
    const input: any = completeInput();
    input.packetReadiness.finalSignoffsComplete = false;
    input.packetReadiness.ready = false;
    expect(deriveEventDay(input).ringLabel).not.toBe("Show ready");
    delete input.packetReadiness;
    expect(deriveEventDay(input).ringLabel).not.toBe("Show ready");
  });
  it("shows ready only when native completeness and packet readiness both agree", () => {
    expect(deriveEventDay(completeInput()).ringLabel).toBe("Show ready");
    const input = completeInput();
    input.staffNeeds = [
      {
        _id: "need",
        eventId: "event",
        status: "open",
        deletedAt: null,
        startsAt: null,
        endsAt: null,
        role: "server",
        quantity: 1,
      },
    ] as EventDayInputs["staffNeeds"];
    expect(deriveEventDay(input).ringLabel).toBe("Needs review");
  });
});
