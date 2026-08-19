import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PAGE_GUIDES } from "../src/app/guide/pageGuides";

const LEFTOVER = "Watch the Below PAR list — that's what to reorder.";
const GUIDED = "Watch the Below reorder alerts — that's what to reorder.";

describe("inventory intro does not tell you to reorder the PAR list", () => {
  it("fails if the production intro/guide still says PAR is what to reorder", () => {
    const inventory = PAGE_GUIDES.find(
      (guide) => guide.prefix === "/inventory",
    );
    const source = [
      readFileSync("src/app/guide/pageGuides.ts", "utf8"),
      readFileSync("src/features/inventory/InventoryOverviewPage.tsx", "utf8"),
    ].join("\n");

    expect(source).not.toContain(LEFTOVER);
    expect(source).not.toMatch(/Below PAR list[^\n]*reorder/i);
    expect(inventory?.steps ?? []).not.toContain(LEFTOVER);
    expect((inventory?.steps ?? []).join("\n")).not.toMatch(
      /PAR list[^\n]*what to reorder/i,
    );
    expect(inventory?.steps).toContain(GUIDED);
  });
});
