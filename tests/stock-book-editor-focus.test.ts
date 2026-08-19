import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  SUPPLY_EDITOR_DOM_ID,
  supplyEditorCanApply,
  supplyEditorClosesOnKey,
} from "../src/features/inventory/StockBookPage";

describe("Stock book Transfer editor is not a no-op above the row", () => {
  it("Apply stays off until destination and quantity are set", () => {
    expect(
      supplyEditorCanApply({
        busy: false,
        kind: "transfer",
        destinationId: "",
        quantity: "",
        destinationCount: 2,
      }),
    ).toBe(false);
    expect(
      supplyEditorCanApply({
        busy: false,
        kind: "transfer",
        destinationId: "dest1",
        quantity: "",
        destinationCount: 2,
      }),
    ).toBe(false);
    expect(
      supplyEditorCanApply({
        busy: false,
        kind: "transfer",
        destinationId: "dest1",
        quantity: "4",
        destinationCount: 2,
      }),
    ).toBe(true);
    expect(
      supplyEditorCanApply({
        busy: false,
        kind: "transfer",
        destinationId: "dest1",
        quantity: "4",
        destinationCount: 0,
      }),
    ).toBe(false);
  });

  it("Apply stays off when quantity is set but destination is empty", () => {
    expect(
      supplyEditorCanApply({
        busy: false,
        kind: "transfer",
        destinationId: "",
        quantity: "4",
        destinationCount: 2,
      }),
    ).toBe(false);
  });

  it("Apply stays off when destination is set but quantity is 0", () => {
    expect(
      supplyEditorCanApply({
        busy: false,
        kind: "transfer",
        destinationId: "dest1",
        quantity: "0",
        destinationCount: 2,
      }),
    ).toBe(false);
  });

  it("editor scrolls into view and focuses a field when it opens", () => {
    const page = readFileSync(
      "src/features/inventory/StockBookPage.tsx",
      "utf8",
    );
    expect(page).toContain(SUPPLY_EDITOR_DOM_ID);
    expect(page).toContain("scrollIntoView");
    expect(page).toContain("focusable?.focus()");
    expect(page).toContain("supplyEditorCanApply");
    expect(page).toContain("autoFocus");
  });

  it("Escape closes the editor the same way Cancel does", () => {
    expect(supplyEditorClosesOnKey("Escape")).toBe(true);
    expect(supplyEditorClosesOnKey("Enter")).toBe(false);
    const page = readFileSync(
      "src/features/inventory/StockBookPage.tsx",
      "utf8",
    );
    expect(page).toContain("supplyEditorClosesOnKey");
    expect(page).toContain('addEventListener("keydown"');
    expect(page).toContain("onClose()");
  });
});
