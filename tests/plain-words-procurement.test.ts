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

describe("plain words on leftover procurement manifests", () => {
  it("keeps leftover procurement-manifest policy copy free of command jargon", () => {
    const files = [
      "src/procurement/purchase-need.manifest",
      "src/procurement/order.manifest",
      "src/procurement/event-purchasing.manifest",
      "src/procurement/vendor.manifest",
      "src/procurement/vendor-contract.manifest",
    ];
    // strip // comments so developer notes are not treated as user copy
    const visible = files
      .map((path) => readFileSync(path, "utf8"))
      .join("\n")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

    for (const old of [
      "through commands",
      "execute purchase need commands",
      "execute vendor order commands",
      "execute vendor order line commands",
      "execute receipt lot commands",
      "execute confirmed ingredient price commands",
      "execute order demand link commands",
      "execute vendor commands",
      "execute vendor contact commands",
      "execute vendor contract commands",
      "execute contract price tier commands",
      "write purchase needs",
      "write vendor orders",
      "write vendor order lines",
      "write order demand links",
      "write weekly purchasing config",
      "write event ingredient contributions",
      "write vendors",
      "write vendor contacts",
      "write vendor contracts",
      "write contract price tiers",
      "record receipt lots",
      "record confirmed ingredient prices",
      "execute weekly purchasing config",
      "execute event ingredient contributions",
    ]) {
      expect(visible).not.toContain(old);
    }

    for (const fresh of [
      "Inventory staff and managers may update purchase needs",
      "Inventory staff and managers may change purchase needs",
      "Procurement and managers may update vendor orders",
      "Procurement and managers may change vendor orders",
      "Procurement and managers may update vendor order lines",
      "Procurement and managers may change vendor order lines",
      "Procurement and managers may update receipt lots",
      "Procurement and managers may change receipt lots",
      "Procurement and managers may update confirmed ingredient prices",
      "Procurement and managers may change confirmed ingredient prices",
      "Procurement and managers may update order demand links",
      "Procurement and managers may change order demand links",
      "Procurement and managers may update weekly purchasing config",
      "Procurement and managers may change weekly purchasing config",
      "Inventory and managers may update event ingredient contributions",
      "Inventory and managers may change event ingredient contributions",
      "Procurement staff may update vendors",
      "Procurement staff may change vendors",
      "Procurement staff may update vendor contacts",
      "Procurement staff may change vendor contacts",
      "Procurement staff may update vendor contracts",
      "Procurement staff may change vendor contracts",
      "Procurement staff may update contract price tiers",
      "Procurement staff may change contract price tiers",
    ]) {
      expect(visible).toContain(fresh);
      expectPlain(fresh);
    }
  });

  it("keeps leftover procurement READ copy free of read jargon", () => {
    const files = [
      "src/procurement/purchase-need.manifest",
      "src/procurement/order.manifest",
      "src/procurement/event-purchasing.manifest",
      "src/procurement/vendor.manifest",
      "src/procurement/vendor-contract.manifest",
    ];
    // strip // comments so developer notes are not treated as user copy
    const visible = files
      .map((path) => readFileSync(path, "utf8"))
      .join("\n")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

    for (const old of [
      "Inventory staff and managers may read purchase needs",
      "Procurement and managers may read vendor orders",
      "Procurement and managers may read vendor order lines",
      "Inventory, procurement, and managers may read receipt lots",
      "Kitchen, procurement, and managers may read confirmed ingredient prices",
      "Procurement and managers may read order demand links",
      "Procurement and managers may read weekly purchasing config",
      "Inventory and managers may read event ingredient contributions",
      "Procurement staff may read vendors",
      "Procurement staff may read vendor contacts",
      "Procurement staff may read vendor contracts",
      "Procurement staff may read contract price tiers",
    ]) {
      expect(visible).not.toContain(old);
    }

    for (const fresh of [
      "Inventory staff and managers may see purchase needs",
      "Procurement and managers may see vendor orders",
      "Procurement and managers may see vendor order lines",
      "Inventory, procurement, and managers may see receipt lots",
      "Kitchen, procurement, and managers may see confirmed ingredient prices",
      "Procurement and managers may see order demand links",
      "Procurement and managers may see weekly purchasing config",
      "Inventory and managers may see event ingredient contributions",
      "Procurement staff may see vendors",
      "Procurement staff may see vendor contacts",
      "Procurement staff may see vendor contracts",
      "Procurement staff may see contract price tiers",
    ]) {
      expect(visible).toContain(fresh);
      expectPlain(fresh);
    }

    // already-landed write leftovers must stay put
    for (const kept of [
      "Inventory staff and managers may update purchase needs",
      "Procurement and managers may update vendor orders",
      "Procurement and managers may update vendor order lines",
      "Procurement and managers may update receipt lots",
      "Procurement and managers may update confirmed ingredient prices",
      "Procurement and managers may update order demand links",
      "Procurement and managers may update weekly purchasing config",
      "Inventory and managers may update event ingredient contributions",
      "Procurement staff may update vendors",
      "Procurement staff may update vendor contacts",
      "Procurement staff may update vendor contracts",
      "Procurement staff may update contract price tiers",
    ]) {
      expect(visible).toContain(kept);
    }
  });
});
