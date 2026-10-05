import { describe, expect, it } from "vitest";
import { parseMoneyCents } from "../src/lib/tppReports/reportValues";

// PR05-02 / AC-085: report money keeps its sign and its zero.
describe("report money reader", () => {
  it("keeps positive, zero and negative amounts", () => {
    expect(parseMoneyCents("$1,250.50")).toBe(125050);
    expect(parseMoneyCents("$0.00")).toBe(0);
    expect(parseMoneyCents("(50.00)")).toBe(-5000);
    expect(parseMoneyCents("-50.00")).toBe(-5000);
    expect(parseMoneyCents("-$50.00")).toBe(-5000);
    expect(parseMoneyCents("$-50.00")).toBe(-5000);
    expect(parseMoneyCents("")).toBeUndefined();
  });
});
