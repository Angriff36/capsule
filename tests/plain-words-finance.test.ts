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

describe("plain words on leftover finance manifests", () => {
  it("keeps leftover finance-manifest policy copy free of command jargon", () => {
    const files = [
      "src/finance/payroll-input.manifest",
      "src/finance/event-closeout.manifest",
      "src/finance/revenue-attribution.manifest",
    ];
    // strip // comments so developer notes are not treated as user copy
    const visible = files
      .map((path) => readFileSync(path, "utf8"))
      .join("\n")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

    for (const old of [
      "through commands",
      "execute payroll input commands",
      "execute event closeout commands",
      "execute venue term commands",
      "execute attribution commands",
      "write payroll inputs",
      "write event closeouts",
      "write venue commission terms",
      "write attributions",
    ]) {
      expect(visible).not.toContain(old);
    }

    for (const fresh of [
      "Finance managers may update payroll inputs",
      "Finance managers may change payroll inputs",
      "Finance staff and event coordinators may update event closeouts",
      "Finance staff and event coordinators may change event closeouts",
      "Finance staff may update venue commission terms",
      "Finance staff may change venue commission terms",
      "Finance staff may update attributions",
      "Finance staff may change attributions",
    ]) {
      expect(visible).toContain(fresh);
      expectPlain(fresh);
    }
  });
});
