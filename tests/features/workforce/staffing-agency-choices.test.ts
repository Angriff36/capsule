/**
 * Nowsta dossier "agency is a name, not a vendor": the person's staffing
 * agency box offers the company's vendors and the agencies already in use,
 * and another spelling of a known agency saves as that agency's own name.
 */
import { describe, expect, it } from "vitest";
import {
  agencyChoices,
  matchAgency,
} from "../../../src/features/workforce/StaffSchedulingSection";

describe("staffing agency choices", () => {
  it("offers vendors first-spelled once, plus agencies already on people", () => {
    const agencies = agencyChoices(
      ["Elite  Staffing", "Sysco"],
      [
        { staffingVendor: "elite staffing" },
        { staffingVendor: "Party Pros" },
        { staffingVendor: null },
        { staffingVendor: " " },
      ],
    );
    expect(agencies).toEqual(["Elite Staffing", "Party Pros", "Sysco"]);
  });

  it("saves another spelling as the known agency, keeps new names, blank clears", () => {
    const agencies = ["Elite Staffing", "Party Pros"];
    expect(matchAgency("  ELITE   staffing ", agencies)).toBe("Elite Staffing");
    expect(matchAgency("Temp Hands", agencies)).toBe("Temp Hands");
    expect(matchAgency("   ", agencies)).toBeUndefined();
  });
});
