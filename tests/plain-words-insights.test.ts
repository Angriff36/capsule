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

  it("keeps leftover insights READ copy free of draft-and-access jargon", () => {
    const source = readFileSync("src/insights/report.manifest", "utf8");
    // strip // comments so developer notes are not treated as user copy
    const visible = source.replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

    expect(visible).not.toContain(
      "Undefined drafts are readable by staff; defined owner_only reports require ownership or manageAccess",
    );
    expect(visible).toContain(
      "Staff may see unfinished reports; a just-for-you report can only be seen by its owner or a manager",
    );
    expectPlain(
      "Staff may see unfinished reports; a just-for-you report can only be seen by its owner or a manager",
    );

    // write/execute leftovers stay for a later slice
    expect(visible).toContain("Staff may update saved reports");
    expect(visible).toContain("Staff may change saved reports");
  });

  it("keeps leftover tpp-report-favorite READ copy free of read jargon", () => {
    const source = readFileSync(
      "src/insights/tpp-report-favorite.manifest",
      "utf8",
    );
    // strip // comments so developer notes are not treated as user copy
    const visible = source.replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

    expect(visible).not.toContain("Staff may read their own report favorites");
    expect(visible).toContain("Staff may see their own report favorites");
    expectPlain("Staff may see their own report favorites");

    // write/execute leftovers stay for a later slice
    expect(visible).toContain(
      "Report favorites are managed only through the app",
    );
  });
});
