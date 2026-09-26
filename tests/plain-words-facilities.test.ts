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

describe("plain words on leftover facilities equipment manifests", () => {
  it("keeps leftover facilities equipment READ copy free of read jargon", () => {
    // strip // comments so developer notes are not treated as user copy
    const visible = readFileSync(
      "src/facilities/equipment.manifest",
      "utf8",
    ).replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

    for (const old of [
      "Inventory or logistics staff may read equipment",
      "Inventory or logistics staff may read equipment reservations, or event managers stand down a cancelled event",
      "Inventory or logistics staff may read equipment maintenance",
      "Inventory or logistics staff may read equipment service history",
    ]) {
      expect(visible).not.toContain(old);
    }

    for (const fresh of [
      "Inventory or logistics staff may see equipment",
      "Inventory or logistics staff may see equipment handoffs, or event managers stand down a cancelled event",
      "Inventory or logistics staff may see equipment maintenance",
      "Inventory or logistics staff may see equipment service history",
    ]) {
      expect(visible).toContain(fresh);
      expectPlain(fresh);
    }

    for (const landed of [
      "Inventory or logistics staff may update equipment",
      "Inventory or logistics staff may change equipment",
      "Inventory or logistics staff may update equipment handoffs, or event managers stand down a cancelled event",
      "Inventory or logistics staff may change equipment handoffs, or event managers stand down a cancelled event",
      "Inventory or logistics staff may update equipment maintenance",
      "Inventory or logistics staff may change equipment maintenance",
      "Inventory or logistics staff may add equipment service",
      "Inventory or logistics staff may change equipment service",
    ]) {
      expect(visible).toContain(landed);
    }
  });

  it("keeps leftover facilities equipment-reservation constraint copy free of reservation jargon", () => {
    // strip // comments so developer notes are not treated as user copy
    const visible = readFileSync(
      "src/facilities/equipment.manifest",
      "utf8",
    ).replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

    expect(visible).not.toContain(
      "Equipment reservations require a valid date range and positive quantity",
    );
    expect(visible).toContain(
      "Equipment handoffs require a valid date range and positive quantity",
    );
    expectPlain(
      "Equipment handoffs require a valid date range and positive quantity",
    );

    // already-landed write/read leftovers must stay put
    expect(visible).toContain(
      "Inventory or logistics staff may see equipment handoffs, or event managers stand down a cancelled event",
    );
    expect(visible).toContain(
      "Inventory or logistics staff may update equipment handoffs, or event managers stand down a cancelled event",
    );
    expect(visible).toContain(
      "Inventory or logistics staff may change equipment handoffs, or event managers stand down a cancelled event",
    );

    // negative amount on hand now reads in plain words
    expect(visible).not.toContain("Equipment quantity cannot be negative");
    expect(visible).toContain(
      "This equipment's amount on hand can't be negative. Use zero or more.",
    );

    // negative purchase value now reads in plain words
    expect(visible).not.toContain("Purchase value cannot be negative");
    expect(visible).toContain(
      "This equipment's purchase value can't be negative. Use zero or more.",
    );

    // zero or negative amount at register now reads in plain words
    expect(visible).not.toContain("Quantity must be positive");
    expect(visible).toContain(
      "This equipment's amount has to be more than zero. Enter how many you have.",
    );

    // blank equipment name at register/reviseDetails now reads in plain words
    expect(visible).not.toContain("Equipment name is required");
    expect(visible).toContain("Give this equipment a name.");

    // blank asset tag / category at register/reviseDetails now read in plain words
    expect(visible).not.toContain("Asset tag is required");
    expect(visible).not.toContain("Category is required");
    expect(visible).toContain("Give this equipment its tag number.");
    expect(visible).toContain("Pick what kind of equipment this is.");

    // blank retire reason now reads in plain words
    expect(visible).not.toContain("Retirement reason is required");
    expect(visible).toContain("Say why you're retiring this equipment.");
  });
});
