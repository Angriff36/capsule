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

describe("plain words on leftover operations manifests", () => {
  it("keeps leftover operations-manifest policy copy free of command jargon", () => {
    const files = [
      "src/operations/venue-note.manifest",
      "src/operations/service-style-kit.manifest",
      "src/operations/venue-room.manifest",
      "src/operations/venue-layout-template.manifest",
      "src/operations/venue-vendor-relationship.manifest",
      "src/operations/service-style.manifest",
      "src/operations/occasion.manifest",
      "src/operations/event-template.manifest",
    ];
    // strip // comments so developer notes are not treated as user copy
    const visible = files
      .map((path) => readFileSync(path, "utf8"))
      .join("\n")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

    for (const old of [
      "through commands",
      "execute venue note commands",
      "execute service style kit commands",
      "execute venue room commands",
      "execute venue layout template commands",
      "execute relationship commands",
      "execute service style commands",
      "execute occasion commands",
      "execute event template commands",
      "write venue notes",
      "write service style kits",
      "write venue rooms",
      "write venue layout templates",
      "write venue vendor relationships",
      "write service styles",
      "write occasions",
      "write event templates",
    ]) {
      expect(visible).not.toContain(old);
    }

    for (const fresh of [
      "Event staff may update venue notes",
      "Event staff may change venue notes",
      "Event managers, logistics staff and managers may update service style kits",
      "Event managers, logistics staff and managers may change service style kits",
      "Event staff may update venue rooms",
      "Event staff may change venue rooms",
      "Event staff may update venue layout templates",
      "Event staff may change venue layout templates",
      "Facility managers may update venue vendor relationships",
      "Facility managers may change venue vendor relationships",
      "Event managers may update service styles",
      "Event managers may change service styles",
      "Event managers may update occasions",
      "Event managers may change occasions",
      "Event and sales staff may update event templates",
      "Event and sales staff may change event templates",
    ]) {
      expect(visible).toContain(fresh);
      expectPlain(fresh);
    }
  });
});
