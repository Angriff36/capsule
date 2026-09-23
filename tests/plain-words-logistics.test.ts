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

describe("plain words on logistics manifests", () => {
  it("keeps leftover logistics-manifest policy copy free of command jargon", () => {
    const files = [
      "src/logistics/pack-list.manifest",
      "src/logistics/vehicle.manifest",
      "src/logistics/event-vehicle.manifest",
      "src/logistics/delivery.manifest",
      "src/logistics/pack-list-template.manifest",
    ];
    // strip // comments so developer notes are not treated as user copy
    const visible = files
      .map((path) => readFileSync(path, "utf8"))
      .join("\n")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

    for (const old of [
      "through commands",
      "execute pack list commands",
      "execute pack list item commands",
      "execute vehicle commands",
      "execute trailer commands",
      "execute fuel log commands",
      "execute vehicle maintenance commands",
      "execute vehicle service commands",
      "execute event vehicle assignment commands",
      "execute delivery commands",
      "execute pack list template commands",
      "may record fuel logs",
      "may record vehicle service",
    ]) {
      expect(visible).not.toContain(old);
    }

    for (const fresh of [
      "Kitchen, logistics, event and sales staff and managers may update pack lists",
      "Kitchen, logistics, event and sales staff and managers may change pack lists",
      "Kitchen, logistics, event and sales staff and managers may update pack list items",
      "Kitchen, logistics, event and sales staff and managers may change pack list items",
      "Logistics staff and managers may update vehicles",
      "Logistics staff and managers may change vehicles",
      "Logistics staff and managers may update trailers",
      "Logistics staff and managers may change trailers",
      "Logistics staff and managers may add fuel logs",
      "Logistics staff and managers may change fuel logs",
      "Logistics staff and managers may change vehicle maintenance",
      "Logistics staff and managers may add vehicle service",
      "Logistics staff and managers may change vehicle service",
      "Event, sales and logistics staff and managers may update event vehicle assignments",
      "Event, sales and logistics staff and managers may change event vehicle assignments",
      "Logistics staff and managers may update deliveries",
      "Logistics staff and managers may change deliveries",
      "Logistics staff and managers may update pack list templates",
      "Logistics staff and managers may change pack list templates",
    ]) {
      expect(visible).toContain(fresh);
      expectPlain(fresh);
    }
  });
});
