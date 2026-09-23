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
});
