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

describe("plain words on leftover event-packet manifests", () => {
  it("keeps leftover event-packet policy copy free of command jargon", () => {
    const files = [
      "src/operations/event-packet.manifest",
      "src/operations/event-number-sequence.manifest",
    ];
    // strip // comments so developer notes are not treated as user copy
    const visible = files
      .map((path) => readFileSync(path, "utf8"))
      .join("\n")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

    for (const old of [
      "Only the scoped packet transaction writes source records",
      "Packet records have no direct generated commands",
      "Packet issues have no direct generated commands",
      "Decisions have no direct generated commands",
      "Print revisions have no direct generated commands",
      "Event number sequences are managed only by the numbering seam",
      "Event number sequences expose no generated commands",
      "Event numbers are given only by the numbering seam",
      "Event number assignments expose no generated commands",
    ]) {
      expect(visible).not.toContain(old);
    }

    for (const fresh of [
      "The event packet keeps the source files",
      "Staff cannot change packet files",
      "Staff cannot change packet issues",
      "Staff cannot change packet decisions",
      "Staff cannot change packet prints",
      "Only Capsule can update event number counters",
      "Event number counters stay behind the scenes",
      "Only Capsule can assign event numbers",
      "Assigned event numbers stay behind the scenes",
    ]) {
      expect(visible).toContain(fresh);
      expectPlain(fresh);
    }
  });

  it("keeps leftover event-number READ copy free of read jargon", () => {
    // strip // comments so developer notes are not treated as user copy
    const visible = readFileSync(
      "src/operations/event-number-sequence.manifest",
      "utf8",
    ).replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

    expect(visible).not.toContain("Staff may read event numbers");

    expect(visible).toContain("Staff may see event numbers");
    expectPlain("Staff may see event numbers");

    for (const landed of [
      "Only Capsule can assign event numbers",
      "Assigned event numbers stay behind the scenes",
    ]) {
      expect(visible).toContain(landed);
    }
  });

  it("keeps leftover event-number-sequence READ copy free of record jargon", () => {
    // strip // comments so developer notes are not treated as user copy
    const visible = readFileSync(
      "src/operations/event-number-sequence.manifest",
      "utf8",
    ).replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

    expect(visible).not.toContain(
      "Event number sequences are private implementation records",
    );
    expect(visible).toContain("These counters stay behind the scenes");
    expectPlain("These counters stay behind the scenes");

    for (const landed of [
      "Only Capsule can update event number counters",
      "Event number counters stay behind the scenes",
      "Staff may see event numbers",
      "Only Capsule can assign event numbers",
      "Assigned event numbers stay behind the scenes",
    ]) {
      expect(visible).toContain(landed);
    }

    // lock the later event-packet leftovers; this test does not change them
    const packet = readFileSync(
      "src/operations/event-packet.manifest",
      "utf8",
    ).replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
    for (const later of [
      "Source bytes and private evidence require the scoped packet seam",
      "Private issue evidence is projected through the packet seam",
    ]) {
      expect(packet).toContain(later);
    }
  });
});
