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
describe("Event Day and the workbook checklist", () => {
  it("shows ready from real records even while workbook checks are unanswered", () => {
    const input: any = completeInput();
    input.packetReadiness.ready = false;
    input.packetReadiness.finalSignoffsComplete = false;
    input.packetReadiness.requiredOpenIssueCount = 46;
    input.packetReadiness.sections[4] = {
      section: "vehicles",
      status: "blocked",
      openIssueCount: 2,
      openIssues: [
        { label: "Verify vehicle assignment", owner: "Ops", count: 2 },
      ],
      urgentAction: "Operations review or required verification is pending",
    };
    const summary = deriveEventDay(input);
    expect(summary.ringLabel).toBe("Show ready");
    expect(summary.readinessPct).toBe(100);
    expect(summary.blockers).toEqual([]);
    expect(summary.sections).toHaveLength(9);
    // The unanswered checks still ride along for the manager's jump link.
    expect(summary.sections.find((s) => s.key === "vehicles")).toMatchObject({
      status: "dormant",
      caption: "No deliveries",
      openIssueCount: 2,
      urgentAction: null,
    });
    expect(
      summary.sections.find((s) => s.key === "vehicles")?.openIssues,
    ).toHaveLength(1);
  });
  it("works the same with no workbook at all", () => {
    const input: any = completeInput();
    delete input.packetReadiness;
    const summary = deriveEventDay(input);
    expect(summary.ringLabel).toBe("Show ready");
    expect(summary.sections.every((s) => s.openIssueCount === 0)).toBe(true);
  });
  it("still needs review when a real record is open", () => {
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
        description: null,
      },
    ] as EventDayInputs["staffNeeds"];
    expect(deriveEventDay(input).ringLabel).toBe("Needs review");
  });
});
