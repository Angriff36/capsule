import { describe, expect, it } from "vitest";

import { NAV_AREAS } from "../src/app/nav";
import { orgCapabilityNavPolicy } from "../src/app/navigation/OrgCapabilityNavPolicy";
import { eventDetailPath } from "../src/features/events/eventRoutes";

describe("Event workbooks navigation", () => {
  it("ships Event Workbooks in primary nav under Operate", () => {
    const workbooks = NAV_AREAS.find((area) => area.path === "/workbooks");
    expect(workbooks).toBeDefined();
    expect(workbooks?.label).toMatch(/Event Workbooks/);
    expect(workbooks?.group).toBe("Operate");
  });

  it("leaves the workbooks area ungated by org capability", () => {
    // The packet seam's manager check is the only gate; the nav policy must
    // not duplicate it (domain-gating restraint).
    expect(orgCapabilityNavPolicy.capabilityForPath("/workbooks")).toBeNull();
  });

  it("deep links into the event overview tab where the packet panel lives", () => {
    expect(eventDetailPath("k57", "overview")).toBe("/events/k57?tab=overview");
  });
});
