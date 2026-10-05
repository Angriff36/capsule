import { describe, expect, it } from "vitest";
import {
  binColorSummary,
  binRows,
  linesWithoutBin,
  parseBinSheet,
  serializeBinSheet,
  updateBinMark,
} from "../../../src/features/logistics/packBins";

describe("pack bin sheet", () => {
  it("reads a stored sheet and drops what it cannot read", () => {
    expect(parseBinSheet(null)).toEqual([]);
    expect(parseBinSheet("not json")).toEqual([]);
    expect(
      parseBinSheet(
        JSON.stringify([
          { bin: 5, color: "red", dirty: true },
          { bin: 2, color: "purple" },
          { bin: 0, color: "green" },
          "junk",
        ]),
      ),
    ).toEqual([
      { bin: 2, color: null, dirty: false },
      { bin: 5, color: "red", dirty: true },
    ]);
  });

  it("changes one bin and stores only bins that say something", () => {
    const marks = updateBinMark(updateBinMark([], 12, { color: "green" }), 3, {
      dirty: true,
    });
    expect(serializeBinSheet(marks)).toBe(
      JSON.stringify([
        { bin: 3, color: null, dirty: true },
        { bin: 12, color: "green", dirty: false },
      ]),
    );
    const plain = updateBinMark(updateBinMark(marks, 3, { dirty: false }), 12, {
      color: null,
    });
    expect(serializeBinSheet(plain)).toBe("");
  });

  it("lists every bin with what is in it and counts bins by lid colour", () => {
    const lines = [
      { description: "Cheese knife", binNumber: 12 },
      { description: "Tongs", binNumber: 12 },
      { description: "Lanterns", binNumber: 4 },
      { description: "Chafer", binNumber: null },
      { description: "Tent", binNumber: null, excludedAt: 1 },
    ];
    const rows = binRows(lines, [
      { bin: 12, color: "green", dirty: false },
      { bin: 7, color: "green", dirty: false },
      { bin: 9, color: "red", dirty: true },
    ]);
    // Bin 7 has a colour but no line any more: not counted. Bin 9 came back
    // dirty after its lines moved: still listed.
    expect(rows.map((row) => [row.bin, row.lines.length])).toEqual([
      [4, 1],
      [9, 0],
      [12, 2],
    ]);
    expect(binColorSummary(rows)).toEqual([
      "Green (Buffet area): 1 bin - 12",
      "Red (Kitchen): 1 bin - 9",
      "No colour yet: 1 bin - 4",
    ]);
    expect(linesWithoutBin(lines).map((line) => line.description)).toEqual([
      "Chafer",
    ]);
  });
});
