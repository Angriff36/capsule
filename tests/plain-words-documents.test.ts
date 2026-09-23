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

describe("plain words on leftover documents manifests", () => {
  it("keeps leftover documents-manifest policy copy free of command jargon", () => {
    const files = ["src/documents/attachment.manifest"];
    // strip // comments so developer notes are not treated as user copy
    const visible = files
      .map((path) => readFileSync(path, "utf8"))
      .join("\n")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

    for (const old of [
      "through commands",
      "execute attachment commands",
      "write attachments",
    ]) {
      expect(visible).not.toContain(old);
    }

    for (const fresh of [
      "Staff may update attachments",
      "Staff may change attachments",
    ]) {
      expect(visible).toContain(fresh);
      expectPlain(fresh);
    }
  });

  it("keeps leftover documents parent-constraint copy free of record jargon", () => {
    // strip // comments so developer notes are not treated as user copy
    const visible = readFileSync(
      "src/documents/attachment.manifest",
      "utf8",
    ).replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

    expect(visible).not.toContain("Parent record is required");
    expect(visible).toContain("This file needs something to attach to");
    expectPlain("This file needs something to attach to");

    // later leftovers, unchanged
    expect(visible).toContain(
      "Staff may read attachments; chat files are read through their message",
    );
    expect(visible).toContain("Chat files are attached through their message");

    // already-done write/execute copy stays
    expect(visible).toContain("Staff may update attachments");
    expect(visible).toContain("Staff may change attachments");
  });
});
