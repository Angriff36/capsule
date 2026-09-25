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

describe("plain words on leftover foundation manifests", () => {
  it("keeps leftover foundation-manifest policy copy free of command jargon", () => {
    const files = [
      "src/foundation/base.manifest",
      "src/foundation/materialization-receipt.manifest",
    ];
    // strip // comments so developer notes are not treated as user copy
    const visible = files
      .map((path) => readFileSync(path, "utf8"))
      .join("\n")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

    for (const old of [
      "write organization records",
      "execute organization commands",
      "transaction seam",
      "generated commands",
    ]) {
      expect(visible).not.toContain(old);
    }

    for (const fresh of [
      "Managers may update the company profile",
      "Managers may change the company profile",
      "The system keeps these receipts",
      "Staff cannot change these receipts",
    ]) {
      expect(visible).toContain(fresh);
      expectPlain(fresh);
    }
  });

  it("keeps leftover foundation READ copy free of record jargon", () => {
    const files = [
      "src/foundation/base.manifest",
      "src/foundation/materialization-receipt.manifest",
    ];
    // strip // comments so developer notes are not treated as user copy
    const visible = files
      .map((path) => readFileSync(path, "utf8"))
      .join("\n")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

    expect(visible).not.toContain("Staff may read organization records");
    expect(visible).not.toContain(
      "Materialization receipts are private implementation records",
    );
    expect(visible).toContain("Staff may see the company profile");
    expect(visible).toContain("These receipts stay behind the scenes");
    expectPlain("Staff may see the company profile");
    expectPlain("These receipts stay behind the scenes");

    // write/execute leftovers stay for a later slice
    expect(visible).toContain("Managers may update the company profile");
    expect(visible).toContain("Managers may change the company profile");
    expect(visible).toContain("The system keeps these receipts");
    expect(visible).toContain("Staff cannot change these receipts");
  });
});
