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

describe("plain words on leftover insights manifests", () => {
  it("keeps leftover insights-manifest policy copy free of command jargon", () => {
    const files = ["src/insights/report.manifest"];
    // strip // comments so developer notes are not treated as user copy
    const visible = files
      .map((path) => readFileSync(path, "utf8"))
      .join("\n")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

    for (const old of [
      "through commands",
      "execute saved report commands",
      "write saved reports",
    ]) {
      expect(visible).not.toContain(old);
    }

    for (const fresh of [
      "Staff may update saved reports",
      "Staff may change saved reports",
    ]) {
      expect(visible).toContain(fresh);
      expectPlain(fresh);
    }
  });
});
