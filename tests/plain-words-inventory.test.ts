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

describe("plain words on inventory manifests", () => {
  it("keeps leftover inventory-manifest policy copy free of command jargon", () => {
    const files = [
      "src/inventory/stock.manifest",
      "src/inventory/demand.manifest",
      "src/inventory/transfer.manifest",
      "src/inventory/stock-count.manifest",
      "src/inventory/location.manifest",
    ];
    // strip // comments so developer notes are not treated as user copy
    const visible = files
      .map((path) => readFileSync(path, "utf8"))
      .join("\n")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

    for (const old of [
      "through commands",
      "execute stock item commands",
      "execute reservation commands",
      "execute ingredient demand commands",
      "execute waste record commands",
      "execute stock transfer commands",
      "execute stock count session commands",
      "execute stock count line commands",
      "execute storage location commands",
      "write waste records",
    ]) {
      expect(visible).not.toContain(old);
    }

    for (const fresh of [
      "Inventory staff and managers may update stock items",
      "Inventory staff and managers may change stock items",
      "Inventory staff or event managers may update inventory reservations",
      "Inventory staff or event managers may change inventory reservations",
      "Inventory staff and event managers may update ingredient demand",
      "Inventory staff and event managers may change ingredient demand",
      "Inventory staff may update waste entries",
      "Inventory staff may change waste entries",
      "Inventory staff may update stock transfers",
      "Inventory staff may change stock transfers",
      "Inventory staff may update stock count sessions",
      "Inventory staff may change stock count sessions",
      "Inventory staff may update stock count lines",
      "Inventory staff may change stock count lines",
      "Inventory staff may update storage locations",
      "Inventory staff may change storage locations",
    ]) {
      expect(visible).toContain(fresh);
      expectPlain(fresh);
    }
  });

  it("keeps leftover inventory READ copy free of read jargon", () => {
    const files = [
      "src/inventory/stock.manifest",
      "src/inventory/demand.manifest",
      "src/inventory/transfer.manifest",
      "src/inventory/stock-count.manifest",
      "src/inventory/location.manifest",
    ];
    // strip // comments so developer notes are not treated as user copy
    const visible = files
      .map((path) => readFileSync(path, "utf8"))
      .join("\n")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

    for (const old of [
      "Inventory staff and managers may read stock items",
      "Inventory staff or event managers may read inventory reservations",
      "Inventory staff and event managers may read ingredient demand",
      "Inventory staff may read waste records",
      "Inventory staff may read stock transfers",
      "Inventory staff may read stock count sessions",
      "Inventory staff may read stock count lines",
      "Inventory staff may read storage locations",
    ]) {
      expect(visible).not.toContain(old);
    }

    for (const fresh of [
      "Inventory staff and managers may see stock items",
      "Inventory staff or event managers may see inventory reservations",
      "Inventory staff and event managers may see ingredient demand",
      "Inventory staff may see waste entries",
      "Inventory staff may see stock transfers",
      "Inventory staff may see stock count sessions",
      "Inventory staff may see stock count lines",
      "Inventory staff may see storage locations",
    ]) {
      expect(visible).toContain(fresh);
      expectPlain(fresh);
    }

    // already-landed write leftovers must stay put
    expect(visible).toContain(
      "Inventory staff and managers may update stock items",
    );
    expect(visible).toContain(
      "Inventory staff or event managers may update inventory reservations",
    );
    expect(visible).toContain(
      "Inventory staff and event managers may update ingredient demand",
    );
    expect(visible).toContain("Inventory staff may update waste entries");
    expect(visible).toContain("Inventory staff may update stock transfers");
    expect(visible).toContain(
      "Inventory staff may update stock count sessions",
    );
    expect(visible).toContain("Inventory staff may update stock count lines");
    expect(visible).toContain("Inventory staff may update storage locations");
  });
});
