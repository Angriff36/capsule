import { describe, expect, it } from "vitest";
import { ImportSourceReadinessChecker } from "../src/features/kitchen/import/ImportSourceReadiness";

describe("ImportSourceReadinessChecker", () => {
  const checker = new ImportSourceReadinessChecker();

  it("requires pasted text in paste mode", () => {
    expect(
      checker.evaluate({
        mode: "paste",
        source: "",
        sheetCsv: "",
        linesCsv: "",
      }),
    ).toEqual({
      ready: false,
      kind: "none",
      message: "Paste recipe text before parsing.",
    });
  });

  it("accepts pasted text in paste mode", () => {
    expect(
      checker.evaluate({
        mode: "paste",
        source: "One-Pot Chili",
        sheetCsv: "",
        linesCsv: "",
      }),
    ).toEqual({ ready: true, kind: "paste_text" });
  });

  it("accepts paired CSV files in files mode", () => {
    expect(
      checker.evaluate({
        mode: "files",
        source: "",
        sheetCsv: "recipe_name\nBasil",
        linesCsv: "recipe_name\nBasil",
      }),
    ).toEqual({ ready: true, kind: "csv_bundle" });
  });

  it("accepts a loaded txt file in files mode", () => {
    expect(
      checker.evaluate({
        mode: "files",
        source: "Basil Pesto\n\nIngredients:\n2 cups basil",
        sheetCsv: "",
        linesCsv: "",
      }),
    ).toEqual({ ready: true, kind: "text_file" });
  });

  it("blocks parse while a file is still loading", () => {
    expect(
      checker.evaluate({
        mode: "files",
        source: "",
        sheetCsv: "",
        linesCsv: "",
        fileLoading: true,
      }),
    ).toEqual({
      ready: false,
      kind: "none",
      message: "Reading the selected file…",
    });
  });

  it("labels partial CSV uploads accurately", () => {
    expect(
      checker.fileStatusLabel({
        mode: "files",
        source: "",
        sheetCsv: "recipe_name\nBasil\nMacaroni",
        linesCsv: "",
      }),
    ).toContain("add recipe_lines.csv");
  });
});
