import { describe, expect, it } from "vitest";
import {
  LETTER_TEXT_MARKER,
  savedLetterTexts,
} from "../../src/features/reports/tpp/savedLetterTexts";

describe("saved letter texts (TPP Body Message list)", () => {
  it("lists only live letter texts, by name, with their words", () => {
    const texts = savedLetterTexts([
      {
        _id: "b",
        version: 2,
        name: "Thank you",
        chartType: LETTER_TEXT_MARKER,
        status: "active",
        definition: { text: "Thank you for choosing us." },
      },
      {
        _id: "a",
        version: 1,
        name: "Deposit reminder",
        chartType: LETTER_TEXT_MARKER,
        status: "active",
        definition: { text: "Your deposit is due." },
      },
      {
        _id: "gone",
        name: "Removed",
        chartType: LETTER_TEXT_MARKER,
        status: "archived",
        definition: { text: "x" },
      },
      {
        _id: "deleted",
        name: "Deleted",
        chartType: LETTER_TEXT_MARKER,
        status: "active",
        deletedAt: 1,
        definition: { text: "x" },
      },
      {
        _id: "view",
        name: "My list view",
        chartType: "list-view",
        status: "active",
        definition: { pageKey: "events" },
      },
      {
        _id: "chart",
        name: "Sales chart",
        chartType: "bar",
        status: "active",
        definition: {},
      },
    ]);
    expect(texts).toEqual([
      {
        id: "a",
        version: 1,
        name: "Deposit reminder",
        text: "Your deposit is due.",
      },
      {
        id: "b",
        version: 2,
        name: "Thank you",
        text: "Thank you for choosing us.",
      },
    ]);
  });

  it("is empty before the list loads", () => {
    expect(savedLetterTexts(undefined)).toEqual([]);
  });
});
