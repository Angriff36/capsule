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

describe("plain words on leftover integrations manifests", () => {
  it("keeps leftover integrations-manifest policy copy free of command jargon", () => {
    const files = ["src/integrations/integration-connection.manifest"];
    // strip // comments so developer notes are not treated as user copy
    const visible = files
      .map((path) => readFileSync(path, "utf8"))
      .join("\n")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

    for (const old of [
      "through commands",
      "execute integration connection commands",
      "write integration connections",
    ]) {
      expect(visible).not.toContain(old);
    }

    for (const fresh of [
      "Admins may update outside-service connections",
      "Admins may change outside-service connections",
    ]) {
      expect(visible).toContain(fresh);
      expectPlain(fresh);
    }
  });

  it("keeps leftover integrations READ copy free of read-integration jargon", () => {
    const source = readFileSync(
      "src/integrations/integration-connection.manifest",
      "utf8",
    );
    // strip // comments so developer notes are not treated as user copy
    const visible = source.replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

    expect(visible).not.toContain("Managers may read integration connections");
    expect(visible).toContain("Managers may see outside-service connections");
    expectPlain("Managers may see outside-service connections");

    // write/execute leftovers now read in plain words too
    expect(visible).toContain("Admins may update outside-service connections");
    expect(visible).toContain("Admins may change outside-service connections");
  });
});
