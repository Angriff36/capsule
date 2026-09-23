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

describe("plain words on leftover quality manifests", () => {
  it("keeps leftover quality-manifest policy copy free of command jargon", () => {
    const files = [
      "src/quality/review-flag.manifest",
      "src/quality/allergen-check.manifest",
      "src/quality/incident.manifest",
    ];
    // strip // comments so developer notes are not treated as user copy
    const visible = files
      .map((path) => readFileSync(path, "utf8"))
      .join("\n")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

    for (const old of [
      "through commands",
      "execute event allergen check commands",
      "execute incident commands",
      "execute corrective action commands",
      "write event allergen checks",
      "write incidents",
      "write corrective actions",
    ]) {
      expect(visible).not.toContain(old);
    }

    for (const fresh of [
      "Any staff member may raise or settle a review flag",
      "Event and kitchen staff may update event allergen checks",
      "Event and kitchen staff may change event allergen checks",
      "Event and kitchen staff may update incidents",
      "Event and kitchen staff may change incidents",
      "Event and kitchen staff may update corrective actions",
      "Event and kitchen staff may change corrective actions",
    ]) {
      expect(visible).toContain(fresh);
      expectPlain(fresh);
    }
  });
});
