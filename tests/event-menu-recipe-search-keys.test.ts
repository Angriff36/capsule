import { expect, it } from "vitest";
import { shouldFireSingleKeyNav } from "../src/app/shell/singleKeyNav";

it("suppresses global navigation while typing in search or quantity inputs but permits button-context shortcuts", () => {
  for (const type of ["search", "number"]) {
    for (const key of ["i", "k", "0"]) {
      expect(
        shouldFireSingleKeyNav({ key, target: { tagName: "INPUT", type } }),
      ).toBe(false);
    }
  }
  expect(
    shouldFireSingleKeyNav({ key: "i", target: { tagName: "BUTTON" } }),
  ).toBe(true);
});
