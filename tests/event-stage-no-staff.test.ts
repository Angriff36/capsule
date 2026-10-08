import { describe, expect, it } from "vitest";
import { nextAutoStageStep } from "../src/lib/eventStageMoves";

const facts = (serviceStyleName: string) => ({
  stage: "planning",
  title: "Board lunch",
  clientId: "client-1",
  hasAssignedClient: true,
  plannedAt: 1,
  startsAt: Date.now() + 86_400_000,
  endsAt: Date.now() + 90_000_000,
  expectedHeadcount: 24,
  hasMenuDishes: true,
  hasStaffAssigned: false,
  serviceStyleName,
});

describe("automatic stage moves without staff", () => {
  it("moves a drop-off on with no staff", () => {
    expect(
      nextAutoStageStep(facts("Drop Off"), new Set(), Date.now()),
    ).toMatchObject({ kind: "move", to: "pending_approval" });
  });

  it("keeps a plated dinner with no staff where it is", () => {
    expect(
      nextAutoStageStep(facts("Plated"), new Set(), Date.now()).kind,
    ).not.toBe("move");
  });
});
