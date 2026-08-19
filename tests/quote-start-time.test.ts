import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("public quote form has a start time", () => {
  it("submits eventDate at the typed start, not midnight, and shows Start Time", () => {
    const page = readFileSync(
      "src/features/sales/QuoteSubmissionPage.tsx",
      "utf8",
    );
    expect(page).toContain('name="eventStartTime"');
    expect(page).toContain("Start Time");
    expect(page).toContain("eventEndTime");
    expect(page).toContain("startTimeStr");
    expect(page).toContain('startTimeStr || "00:00"');
    expect(page).not.toContain("Date.parse(`${dateStr}T00:00`)");
  });
});
