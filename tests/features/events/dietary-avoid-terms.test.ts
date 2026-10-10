import { describe, expect, it } from "vitest";
import { extractAvoidTermsFromText } from "../../../src/features/events/eventDietaryCrossCheck";

const families = (text: string) =>
  extractAvoidTermsFromText(text, "serviceRequirements" as never).map(
    (term) => term.family,
  );

describe("allergy words in an event's notes", () => {
  it("reads a hyphenated food as the same food", () => {
    expect(
      families(
        "Family style, two long tables. 2 guests tree-nut allergy, 1 gluten-free.",
      ).sort(),
    ).toEqual(["gluten", "nut"]);
  });

  it("still reads the spaced form", () => {
    expect(families("One guest has a tree nut allergy.")).toEqual(["nut"]);
  });
});
