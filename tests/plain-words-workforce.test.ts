import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Words the owner banned from user-visible copy (2026-09-23).
const FORBIDDEN =
  /\b(idempotency|tenant|seam|projection|canonical|hydrate|mapped|reaction|guard|policy|constraint|manifest|convex|builder|directory|record)\b/i;

function expectPlain(text: string) {
  expect(text).not.toMatch(FORBIDDEN);
  expect(text).not.toContain("CONVEX_FIELD_ENCRYPTION_KEY");
  expect(text).not.toContain("bun run");
}

describe("plain words on workforce manifests", () => {
  it("keeps leftover workforce-manifest policy copy free of command jargon", () => {
    const files = [
      "src/workforce/time.manifest",
      "src/workforce/shift.manifest",
      "src/workforce/hiring.manifest",
      "src/workforce/availability.manifest",
      "src/workforce/assignment.manifest",
      "src/workforce/staff-message.manifest",
      "src/workforce/performance-review.manifest",
      "src/workforce/one-on-one.manifest",
      "src/workforce/role-scorecard.manifest",
      "src/workforce/training.manifest",
    ];
    // strip // comments so developer notes are not treated as user copy
    const visible = files
      .map((path) => readFileSync(path, "utf8"))
      .join("\n")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

    for (const old of [
      "through commands",
      "use commands",
      "execute time record commands",
      "execute qualification commands",
      "execute schedule notice commands",
      "execute candidate commands",
      "execute interview commands",
      "execute availability commands",
      "execute recurring availability commands",
      "execute staff message commands",
      "execute performance review commands",
      "execute one-on-one commands",
      "execute one-on-one action commands",
      "execute role scorecard commands",
      "execute training module commands",
      "execute training completion commands",
      "execute shift type commands",
      "write time records",
      "chat read cursors through commands",
    ]) {
      expect(visible).not.toContain(old);
    }

    for (const fresh of [
      "Workforce staff or the linked person may update time entries",
      "Workforce staff or the linked person may change time entries",
      "Workforce staff may update qualifications",
      "Workforce staff may change qualifications",
      "Crew may update their own shifts and the shared event schedule",
      "Crew may change their own shifts and the shared event schedule",
      "Workforce staff or the linked person may update schedule notices",
      "Workforce staff or the linked person may change schedule notices",
      "Workforce managers may update candidates",
      "Workforce managers may change candidates",
      "Workforce managers may update interviews",
      "Workforce managers may change interviews",
      "Workforce staff or the linked person may update availability",
      "Workforce staff or the linked person may change availability",
      "Workforce staff or the linked person may update recurring availability",
      "Workforce staff or the linked person may change recurring availability",
      "Crew may update shared event staffing",
      "Crew may change shared event staffing",
      "Staff may update staff messages",
      "Staff may change staff messages",
      "Staff may mark which chats they have read",
      "Workforce managers may update performance reviews",
      "Workforce managers may change performance reviews",
      "Workforce managers may update one-on-ones",
      "Workforce managers may change one-on-ones",
      "Workforce managers may update one-on-one actions",
      "Workforce managers may change one-on-one actions",
      "Workforce managers may update role scorecards",
      "Workforce managers may change role scorecards",
      "Workforce staff may update training modules",
      "Workforce staff may change training modules",
      "Workforce staff may update training completions",
      "Workforce staff may change training completions",
      "Workforce staff may update shift types",
      "Workforce staff may change shift types",
    ]) {
      expect(visible).toContain(fresh);
      expectPlain(fresh);
    }
  });

  it("keeps leftover workforce READ copy free of read jargon", () => {
    const files = [
      "src/workforce/time.manifest",
      "src/workforce/shift.manifest",
      "src/workforce/hiring.manifest",
      "src/workforce/availability.manifest",
      "src/workforce/assignment.manifest",
      "src/workforce/staff-message.manifest",
      "src/workforce/performance-review.manifest",
      "src/workforce/one-on-one.manifest",
      "src/workforce/role-scorecard.manifest",
      "src/workforce/training.manifest",
      "src/workforce/shift-swap.manifest",
      "src/workforce/push-subscription.manifest",
      "src/workforce/chat-notify-preference.manifest",
    ];
    // strip // comments so developer notes are not treated as user copy
    const visible = files
      .map((path) => readFileSync(path, "utf8"))
      .join("\n")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

    for (const old of [
      "Workforce staff may read training modules",
      "Workforce staff may read training completions",
      "Workforce staff may read shift types",
      "Staff may read their own push devices",
      "Managers may read performance reviews",
      "Workforce managers may read one-on-ones",
      "Workforce managers may read one-on-one actions",
      "Crew may read shared event staffing",
      "Staff may read their own time-off requests",
      "Workforce staff or the linked person may read availability windows",
      "Workforce staff or the linked person may read recurring availability",
      "Staff may read channel messages and their own direct messages",
      "Staff may read their own chat read cursors",
      "Workforce managers may read role scorecards",
      "Users may read their own chat notification preference",
      "Workforce managers may read candidates",
      "Workforce managers may read interviews",
      "Crew may read their own shift swaps",
      "Workforce staff or the linked person may read time records",
      "Workforce staff may read qualifications",
      "Workforce staff may read shifts",
      "crew may read their own shifts",
      "Workforce staff or the linked person may read schedule notices",
    ]) {
      expect(visible).not.toContain(old);
    }

    for (const fresh of [
      "Workforce staff may see training modules",
      "Workforce staff may see training completions",
      "Workforce staff may see shift types",
      "Staff may see their own push devices",
      "Managers may see performance reviews",
      "Workforce managers may see one-on-ones",
      "Workforce managers may see one-on-one actions",
      "Crew may see shared event staffing",
      "Staff may see their own time-off requests",
      "Workforce staff or the linked person may see availability windows",
      "Workforce staff or the linked person may see recurring availability",
      "Staff may see channel messages and their own direct messages",
      "Staff may see how far they have gotten in a chat",
      "Workforce managers may see role scorecards",
      "Users may see their own chat notification preference",
      "Workforce managers may see candidates",
      "Workforce managers may see interviews",
      "Crew may see their own shift swaps",
      "Workforce staff or the linked person may see time entries",
      "Workforce staff may see qualifications",
      "Workforce staff may see shifts",
      "crew may see their own shifts",
      "Workforce staff or the linked person may see schedule notices",
    ]) {
      expect(visible).toContain(fresh);
      expectPlain(fresh);
    }

    // already-landed write leftovers must stay put
    expect(visible).toContain(
      "Workforce staff or the linked person may update time entries",
    );
    expect(visible).toContain("Crew may update shared event staffing");
    expect(visible).toContain("Staff may mark which chats they have read");
    expect(visible).toContain("Workforce staff may update training modules");
  });

  it("keeps leftover workforce clock-out constraint copy free of record jargon", () => {
    // strip // comments so developer notes are not treated as user copy
    const visible = readFileSync("src/workforce/time.manifest", "utf8").replace(
      /(^|[^:])\/\/[^\n]*/g,
      "$1 ",
    );

    expect(visible).not.toContain(
      "Closed or corrected time records require clock-out at or after clock-in",
    );
    expect(visible).toContain(
      "Closed or corrected time entries require clock-out at or after clock-in",
    );
    expectPlain(
      "Closed or corrected time entries require clock-out at or after clock-in",
    );

    // already-landed write/read leftovers must stay put
    expect(visible).toContain(
      "Workforce staff or the linked person may see time entries",
    );
    expect(visible).toContain(
      "Workforce staff or the linked person may update time entries",
    );
    expect(visible).toContain(
      "Workforce staff or the linked person may change time entries",
    );

    // later leftover, unchanged
    expect(visible).toContain("Break minutes must be non-negative");
  });

  it("keeps leftover workforce clock-in match copy free of personId jargon", () => {
    // strip // comments so developer notes are not treated as user copy
    const visible = readFileSync("src/workforce/time.manifest", "utf8").replace(
      /(^|[^:])\/\/[^\n]*/g,
      "$1 ",
    );

    for (const old of [
      "Clock-in personId must match the seeded person reference",
      "Clock-in shiftId must match the seeded shift reference when provided",
      "Clock-in eventId must match the seeded event reference when provided",
    ]) {
      expect(visible).not.toContain(old);
    }

    for (const fresh of [
      "This clock-in is for a different person. Pick the person already on this time entry.",
      "This clock-in is for a different shift. Leave the shift blank or pick the one already on this time entry.",
      "This clock-in is for a different event. Leave the event blank or pick the one already on this time entry.",
    ]) {
      expect(visible).toContain(fresh);
      expectPlain(fresh);
    }

    // already-landed leftovers must stay put
    expect(visible).toContain(
      "Workforce staff or the linked person may see time entries",
    );
    expect(visible).toContain(
      "Workforce staff or the linked person may update time entries",
    );
    expect(visible).toContain(
      "Workforce staff or the linked person may change time entries",
    );
    expect(visible).toContain(
      "Closed or corrected time entries require clock-out at or after clock-in",
    );

    // later leftovers, unchanged
    expect(visible).toContain("Break minutes must be non-negative");
    expect(visible).toContain(
      "Corrected clock-out must be at or after clock-in",
    );
  });

  it("keeps leftover workforce grant person match copy free of personId jargon", () => {
    // strip // comments so developer notes are not treated as user copy
    const visible = readFileSync("src/workforce/time.manifest", "utf8").replace(
      /(^|[^:])\/\/[^\n]*/g,
      "$1 ",
    );

    expect(visible).not.toContain(
      "Grant personId must match the seeded person reference",
    );

    expect(visible).toContain(
      "This qualification is for a different person. Pick the person already on this qualification.",
    );
    expectPlain(
      "This qualification is for a different person. Pick the person already on this qualification.",
    );

    // already-landed leftovers must stay put
    expect(visible).toContain(
      "This clock-in is for a different person. Pick the person already on this time entry.",
    );
    expect(visible).toContain(
      "This clock-in is for a different shift. Leave the shift blank or pick the one already on this time entry.",
    );
    expect(visible).toContain(
      "This clock-in is for a different event. Leave the event blank or pick the one already on this time entry.",
    );
    expect(visible).toContain(
      "Closed or corrected time entries require clock-out at or after clock-in",
    );
    expect(visible).toContain(
      "Workforce staff or the linked person may see time entries",
    );
    expect(visible).toContain(
      "Workforce staff or the linked person may update time entries",
    );
    expect(visible).toContain(
      "Workforce staff or the linked person may change time entries",
    );

    // later leftovers, unchanged
    expect(visible).toContain("Break minutes must be non-negative");
    expect(visible).toContain(
      "Corrected clock-out must be at or after clock-in",
    );
  });

  it("keeps leftover workforce declare assign schedule prepare person match copy free of personId jargon", () => {
    const files = [
      "src/workforce/availability.manifest",
      "src/workforce/assignment.manifest",
      "src/workforce/shift.manifest",
      "src/finance/payroll-input.manifest",
    ];
    // strip // comments so developer notes are not treated as user copy
    const visible = files
      .map((path) => readFileSync(path, "utf8"))
      .join("\n")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

    for (const old of [
      "Declare personId must match the seeded person reference",
      "Assign personId must match the seeded person reference",
      "Schedule personId must match the seeded person reference",
      "Prepare personId must match the seeded person reference",
    ]) {
      expect(visible).not.toContain(old);
    }

    for (const fresh of [
      "This availability is for a different person. Pick the person already on this availability.",
      "This assignment is for a different person. Pick the person already on this assignment.",
      "This shift is for a different person. Pick the person already on this shift.",
      "This payroll input is for a different person. Pick the person already on this payroll input.",
    ]) {
      expect(visible).toContain(fresh);
      expectPlain(fresh);
    }

    // later leftovers, unchanged
    expect(visible).toContain(
      "This schedule notice is for a different person. Pick the person already on this schedule notice.",
    );
    expect(visible).toContain(
      "This assignment is for a different event. Pick the event already on this assignment.",
    );
    expect(visible).toContain(
      "This shift is for a different event. Pick the event already on this shift.",
    );
    expect(visible).toContain(
      "This payroll input is for a different event. Pick the event already on this payroll input.",
    );
    expect(visible).toContain(
      "This payroll input is for a different shift. Pick the shift already on this payroll input.",
    );
  });
});
