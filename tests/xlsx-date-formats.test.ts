import { describe, expect, it } from "vitest";
import { bytesOf, buildStoredZip } from "./proofs/zipFixture";
import {
  readXlsxSheets,
  readXlsxWorkbook,
  type XlsxTypedCell,
  type XlsxTypedWorkbook,
} from "../src/lib/tppReports/xlsxReader";

/**
 * AC-025 (specs/ralph/production-01-import-archive.md PR01-06, issue #274):
 * every Excel value condition gets a NAMED outcome — 1900/1904 systems, the
 * phantom 1900 leap day, fractional-day times, naive-local timezone,
 * sparse/merged cells, accounting parentheses, fractions, cached formula
 * values — and units are never inferred from unrelated cells. Fixtures are
 * synthetic workbooks shaped like TPP exports; formulas/macros are never
 * executed (the reader only reads cached <v> values).
 */

interface FixtureCell {
  ref: string;
  /** Index into cellXfs. */
  s?: number;
  /** Cell t attribute; omit for numeric cells. */
  t?: string;
  /** <v> body. */
  v?: string;
  /** Inline string body (implies t="inlineStr"). */
  is?: string;
  /** Formula body; with si set, emits a shared-formula reference instead. */
  f?: string;
  si?: number;
}

function cellXml(cell: FixtureCell): string {
  const attrs = [`r="${cell.ref}"`];
  if (cell.s !== undefined) attrs.push(`s="${cell.s}"`);
  if (cell.is !== undefined) attrs.push(`t="inlineStr"`);
  else if (cell.t !== undefined) attrs.push(`t="${cell.t}"`);
  const inner: string[] = [];
  if (cell.f !== undefined || cell.si !== undefined) {
    inner.push(
      cell.si !== undefined
        ? `<f t="shared" si="${cell.si}"/>`
        : `<f>${cell.f}</f>`,
    );
  }
  if (cell.is !== undefined) inner.push(`<is><t>${cell.is}</t></is>`);
  if (cell.v !== undefined) inner.push(`<v>${cell.v}</v>`);
  return `<c ${attrs.join(" ")}>${inner.join("")}</c>`;
}

function sheetXml(cells: FixtureCell[], merges?: string[]): string {
  const byRow = new Map<number, FixtureCell[]>();
  for (const cell of cells) {
    const rowNumber = Number(cell.ref.match(/^\D+(\d+)$/)?.[1]);
    const list = byRow.get(rowNumber) ?? [];
    list.push(cell);
    byRow.set(rowNumber, list);
  }
  const rows = [...byRow.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(
      ([rowNumber, rowCells]) =>
        `<row r="${rowNumber}">${rowCells.map(cellXml).join("")}</row>`,
    )
    .join("");
  const mergeXml =
    merges && merges.length > 0
      ? `<mergeCells count="${merges.length}">${merges
          .map((ref) => `<mergeCell ref="${ref}"/>`)
          .join("")}</mergeCells>`
      : "";
  return `<?xml version="1.0"?><worksheet><sheetData>${rows}</sheetData>${mergeXml}</worksheet>`;
}

function buildTestWorkbook(options: {
  date1904?: boolean;
  numFmts?: Array<{ id: number; code: string }>;
  xfNumFmtIds?: number[];
  cells?: FixtureCell[];
  merges?: string[];
  sharedStrings?: string[];
  vba?: boolean;
  sheetName?: string;
}): Buffer {
  const numFmts = options.numFmts ?? [];
  const xfIds = options.xfNumFmtIds ?? [];
  const styles = `<styleSheet>${
    numFmts.length > 0
      ? `<numFmts count="${numFmts.length}">${numFmts
          .map(
            (fmt) => `<numFmt numFmtId="${fmt.id}" formatCode="${fmt.code}"/>`,
          )
          .join("")}</numFmts>`
      : ""
  }<fonts count="1"><font/></fonts><fills count="1"><fill/></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="${xfIds.length}">${xfIds
    .map((id) => `<xf numFmtId="${id}" applyNumberFormat="1"/>`)
    .join("")}</cellXfs></styleSheet>`;
  const entries: Array<{ name: string; data: number[] }> = [
    {
      name: "[Content_Types].xml",
      data: bytesOf(
        '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
      ),
    },
    {
      name: "xl/workbook.xml",
      data: bytesOf(
        `<?xml version="1.0"?><workbook>${
          options.date1904 === true ? '<workbookPr date1904="1"/>' : ""
        }<sheets><sheet name="${
          options.sheetName ?? "Report"
        }" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      ),
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: bytesOf(
        '<?xml version="1.0"?><Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
      ),
    },
    { name: "xl/styles.xml", data: bytesOf(styles) },
    {
      name: "xl/worksheets/sheet1.xml",
      data: bytesOf(sheetXml(options.cells ?? [], options.merges)),
    },
  ];
  if (options.sharedStrings !== undefined) {
    entries.push({
      name: "xl/sharedStrings.xml",
      data: bytesOf(
        `<sst count="${options.sharedStrings.length}">${options.sharedStrings
          .map((text) => `<si><t>${text}</t></si>`)
          .join("")}</sst>`,
      ),
    });
  }
  if (options.vba === true) {
    entries.push({ name: "xl/vbaProject.bin", data: [1, 2, 3] });
  }
  return Buffer.from(buildStoredZip(entries));
}

function cellAt(workbook: XlsxTypedWorkbook, ref: string): XlsxTypedCell {
  const cell = workbook.sheets[0]!.cells.find((entry) => entry.ref === ref);
  if (cell === undefined) throw new Error(`fixture has no cell ${ref}`);
  return cell;
}

/** Builtin date format (numFmtId 14) on every cell. */
function dateWorkbook(cells: FixtureCell[], date1904 = false): Buffer {
  return buildTestWorkbook({
    date1904,
    xfNumFmtIds: [14],
    cells: cells.map((cell) => ({ s: 0, ...cell })),
  });
}

describe("xlsx date systems", () => {
  it("interprets 1900-epoch serials with the phantom-day correction", () => {
    const workbook = readXlsxWorkbook(
      dateWorkbook([
        { ref: "A1", v: "1" },
        { ref: "B1", v: "59" },
        { ref: "C1", v: "61" },
        { ref: "D1", v: "44927" },
        { ref: "E1", v: "45000" },
        { ref: "F1", v: "45351" },
      ]),
    );
    expect(workbook.dateSystem).toBe("1900");
    expect(cellAt(workbook, "A1")).toMatchObject({
      outcome: "date_1900",
      value: "1900-01-01",
      raw: "1",
      dateSystem: "1900",
    });
    expect(cellAt(workbook, "B1").value).toBe("1900-02-28");
    expect(cellAt(workbook, "C1").value).toBe("1900-03-01");
    expect(cellAt(workbook, "D1").value).toBe("2023-01-01");
    expect(cellAt(workbook, "E1").value).toBe("2023-03-15");
    // Real leap day, not the 1900 phantom.
    expect(cellAt(workbook, "F1").value).toBe("2024-02-29");
  });

  it("names the phantom 1900-02-29 instead of mapping it to a real date", () => {
    const workbook = readXlsxWorkbook(
      dateWorkbook([
        { ref: "A1", v: "60" },
        { ref: "B1", v: "60.5" },
      ]),
    );
    for (const ref of ["A1", "B1"]) {
      expect(cellAt(workbook, ref).outcome).toBe("phantom_leap_day_1900");
      expect(cellAt(workbook, ref).value).toBeUndefined();
    }
  });

  it("names serials before the epoch instead of guessing", () => {
    const workbook = readXlsxWorkbook(dateWorkbook([{ ref: "A1", v: "-5" }]));
    expect(cellAt(workbook, "A1").outcome).toBe("serial_before_epoch");
    expect(cellAt(workbook, "A1").value).toBeUndefined();
  });

  it("interprets 1904-epoch serials from 1904-01-01 with no phantom day", () => {
    const workbook = readXlsxWorkbook(
      dateWorkbook(
        [
          { ref: "A1", v: "0" },
          { ref: "B1", v: "1" },
          { ref: "C1", v: "45000" },
        ],
        true,
      ),
    );
    expect(workbook.dateSystem).toBe("1904");
    expect(cellAt(workbook, "A1")).toMatchObject({
      outcome: "date_1904",
      value: "1904-01-01",
      dateSystem: "1904",
    });
    expect(cellAt(workbook, "B1").value).toBe("1904-01-02");
    // Same serial as the 1900 test's 2023-03-15, plus the 1462-day epoch gap.
    expect(cellAt(workbook, "C1").value).toBe("2027-03-16");
  });
});

describe("xlsx fractional-day times and timezone", () => {
  it("interprets fractional-day serials as date + clock time", () => {
    const workbook = readXlsxWorkbook(
      buildTestWorkbook({
        numFmts: [{ id: 164, code: "m/d/yyyy h:mm" }],
        xfNumFmtIds: [164],
        cells: [
          { ref: "A1", v: "44927.5", s: 0 },
          { ref: "B1", v: "44927.25", s: 0 },
          { ref: "C1", v: "44927.333333333", s: 0 },
        ],
      }),
    );
    expect(cellAt(workbook, "A1")).toMatchObject({
      outcome: "fractional_day_time",
      value: "2023-01-01T12:00:00",
    });
    expect(cellAt(workbook, "B1").value).toBe("2023-01-01T06:00:00");
    // Fraction dust rounds to the nearest second, never drifts.
    expect(cellAt(workbook, "C1").value).toBe("2023-01-01T08:00:00");
  });

  it("reads time-only and elapsed serials without inventing a date", () => {
    const workbook = readXlsxWorkbook(
      buildTestWorkbook({
        xfNumFmtIds: [20, 46],
        cells: [
          { ref: "A1", v: "0.5", s: 0 },
          { ref: "B1", v: "0.75", s: 0 },
          { ref: "C1", v: "1.5", s: 1 },
        ],
      }),
    );
    expect(cellAt(workbook, "A1")).toMatchObject({
      outcome: "time",
      value: "12:00:00",
    });
    expect(cellAt(workbook, "B1").value).toBe("18:00:00");
    // [h]:mm:ss is elapsed time — 36 hours, not a date.
    expect(cellAt(workbook, "C1").value).toBe("36:00:00");
  });

  it("records the naive-local timezone assumption and never emits an offset", () => {
    const workbook = readXlsxWorkbook(
      buildTestWorkbook({
        numFmts: [{ id: 164, code: "m/d/yyyy h:mm" }],
        xfNumFmtIds: [164],
        cells: [{ ref: "A1", v: "44927.5", s: 0 }],
      }),
    );
    expect(workbook.timezone).toBe("naive-local");
    expect(workbook.timezoneAssumption).toContain("never converted");
    expect(cellAt(workbook, "A1").value).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/,
    );
  });
});

describe("xlsx merged and sparse cells", () => {
  it("records merged ranges; the value stays at the anchor only", () => {
    const workbook = readXlsxWorkbook(
      buildTestWorkbook({
        cells: [
          { ref: "A1", is: "Event Menu" },
          { ref: "B1", s: 0 },
        ],
        merges: ["A1:C1"],
      }),
    );
    expect(workbook.sheets[0]!.mergedRanges).toEqual(["A1:C1"]);
    expect(cellAt(workbook, "A1")).toMatchObject({
      outcome: "text",
      value: "Event Menu",
      mergedRange: "A1:C1",
    });
    // B1 exists in the file as a styled member of the merge, not a value.
    expect(cellAt(workbook, "B1").outcome).toBe("merged_non_anchor");
    // C1 is absent from the file entirely — no fabricated record.
    expect(
      workbook.sheets[0]!.cells.find((entry) => entry.ref === "C1"),
    ).toBeUndefined();
  });

  it("keeps sparse rows positionally aligned in the string grid", () => {
    const buffer = buildTestWorkbook({
      cells: [
        { ref: "A1", is: "first" },
        { ref: "E1", is: "last" },
      ],
    });
    expect(readXlsxSheets(buffer)[0]!.rows).toEqual([
      ["first", "", "", "", "last"],
    ]);
    const workbook = readXlsxWorkbook(buffer);
    expect(workbook.sheets[0]!.cells.map((cell) => cell.ref)).toEqual([
      "A1",
      "E1",
    ]);
  });
});

describe("xlsx accounting parentheses and fractions", () => {
  it("interprets parenthesized negatives from both formats and text", () => {
    const workbook = readXlsxWorkbook(
      buildTestWorkbook({
        xfNumFmtIds: [39],
        cells: [
          { ref: "A1", v: "-1234.5", s: 0 },
          { ref: "B1", is: "(1,234.50)" },
          { ref: "C1", is: "($25.00)" },
        ],
      }),
    );
    expect(cellAt(workbook, "A1")).toMatchObject({
      outcome: "accounting_negative",
      value: -1234.5,
      raw: "-1234.5",
    });
    expect(cellAt(workbook, "B1")).toMatchObject({
      outcome: "accounting_negative",
      value: -1234.5,
      raw: "(1,234.50)",
    });
    expect(cellAt(workbook, "C1").value).toBe(-25);
  });

  it("interprets fractions from both formats and text", () => {
    const workbook = readXlsxWorkbook(
      buildTestWorkbook({
        xfNumFmtIds: [12],
        cells: [
          { ref: "A1", v: "1.5", s: 0 },
          { ref: "B1", is: "3 1/2" },
          { ref: "C1", is: "1/2" },
          { ref: "D1", is: "-3 1/2" },
          { ref: "E1", is: "1/2/3" },
        ],
      }),
    );
    expect(cellAt(workbook, "A1")).toMatchObject({
      outcome: "fraction_value",
      value: 1.5,
    });
    expect(cellAt(workbook, "B1")).toMatchObject({
      outcome: "fraction_value",
      value: 3.5,
    });
    expect(cellAt(workbook, "C1").value).toBe(0.5);
    expect(cellAt(workbook, "D1").value).toBe(-3.5);
    expect(cellAt(workbook, "E1").outcome).toBe("text");
  });
});

describe("xlsx formula cells", () => {
  it("reads cached values and records the formula; never executes it", () => {
    const workbook = readXlsxWorkbook(
      buildTestWorkbook({
        cells: [
          { ref: "A1", v: "10" },
          { ref: "A2", v: "20" },
          { ref: "A3", f: "SUM(A1:A2)", v: "30" },
        ],
      }),
    );
    expect(cellAt(workbook, "A3")).toMatchObject({
      outcome: "formula_cached_value",
      value: 30,
      formula: "SUM(A1:A2)",
    });
  });

  it("keeps the date outcome when a cached formula result is a serial", () => {
    const workbook = readXlsxWorkbook(
      buildTestWorkbook({
        xfNumFmtIds: [14],
        cells: [
          { ref: "B1", v: "44927", s: 0 },
          { ref: "B2", f: "B1+1", v: "44928", s: 0 },
        ],
      }),
    );
    expect(cellAt(workbook, "B2")).toMatchObject({
      outcome: "date_1900",
      value: "2023-01-02",
      formula: "B1+1",
    });
  });

  it("names formulas with no cached value instead of coercing to blank", () => {
    const workbook = readXlsxWorkbook(
      buildTestWorkbook({
        cells: [{ ref: "A1", f: "A2*2" }],
      }),
    );
    expect(cellAt(workbook, "A1")).toMatchObject({
      outcome: "formula_without_cached_value",
      formula: "A2*2",
      raw: "",
    });
    expect(cellAt(workbook, "A1").value).toBeUndefined();
  });

  it("records shared-formula references by id without translating them", () => {
    const workbook = readXlsxWorkbook(
      buildTestWorkbook({
        cells: [
          { ref: "C1", f: "C1*2", si: 0, v: "5" },
          { ref: "D1", si: 0, v: "7" },
        ],
      }),
    );
    expect(cellAt(workbook, "D1")).toMatchObject({
      outcome: "formula_cached_value",
      value: 7,
      sharedFormulaSi: 0,
    });
    expect(cellAt(workbook, "D1").formula).toBeUndefined();
  });
});

describe("xlsx units, booleans, errors, shared strings, macros", () => {
  it("never infers a unit from neighboring cells (issue #274)", () => {
    const workbook = readXlsxWorkbook(
      buildTestWorkbook({
        numFmts: [{ id: 165, code: `0&quot; lbs&quot;` }],
        xfNumFmtIds: [2, 165],
        cells: [
          { ref: "A1", is: "Quantity (lbs)" },
          { ref: "B1", v: "12.5", s: 0 },
          { ref: "C1", v: "3", s: 1 },
        ],
      }),
    );
    // The header's unit does not leak into the plain-decimal cell…
    expect(cellAt(workbook, "B1")).toMatchObject({
      outcome: "number",
      value: 12.5,
      unit: null,
    });
    // …only the cell's OWN format literal supplies a unit.
    expect(cellAt(workbook, "C1").unit).toBe("lbs");
  });

  it("names boolean and error cells instead of coercing them", () => {
    const workbook = readXlsxWorkbook(
      buildTestWorkbook({
        cells: [
          { ref: "A1", t: "b", v: "1" },
          { ref: "B1", t: "e", v: "#DIV/0!" },
        ],
      }),
    );
    expect(cellAt(workbook, "A1")).toMatchObject({
      outcome: "boolean",
      value: true,
    });
    expect(cellAt(workbook, "B1")).toMatchObject({
      outcome: "error_value",
      raw: "#DIV/0!",
    });
    expect(cellAt(workbook, "B1").value).toBeUndefined();
  });

  it("resolves shared strings as the raw cell text", () => {
    const workbook = readXlsxWorkbook(
      buildTestWorkbook({
        cells: [{ ref: "A1", t: "s", v: "0" }],
        sharedStrings: ["Hello"],
      }),
    );
    expect(cellAt(workbook, "A1")).toMatchObject({
      outcome: "text",
      raw: "Hello",
      value: "Hello",
    });
  });

  it("detects macro-enabled workbooks and still never executes them", () => {
    expect(
      readXlsxWorkbook(buildTestWorkbook({ cells: [{ ref: "A1", v: "1" }] }))
        .macros,
    ).toBe("absent");
    expect(
      readXlsxWorkbook(
        buildTestWorkbook({ cells: [{ ref: "A1", v: "1" }], vba: true }),
      ).macros,
    ).toBe("present-not-executed");
  });
});

describe("issue #274 regression: TPP-shaped shopping list", () => {
  it("keeps raw serials and text while recording interpreted values", () => {
    // Shaped like the Shopping List workbooks from the migration archive:
    // a title, a printed date stored as a serial, decimal quantities with
    // no units in the source, and hand-typed fractions/parenthesized money.
    const workbook = readXlsxWorkbook(
      buildTestWorkbook({
        sheetName: "Shopping List",
        numFmts: [{ id: 164, code: "m/d/yyyy" }],
        xfNumFmtIds: [164, 2],
        cells: [
          { ref: "A1", is: "Mangia Catering Shopping List" },
          { ref: "A3", is: "Printed:" },
          { ref: "B3", v: "44927", s: 0 },
          { ref: "A4", is: "Item" },
          { ref: "B4", is: "Qty" },
          { ref: "A5", is: "Chicken" },
          { ref: "B5", v: "12.5", s: 1 },
          { ref: "A6", is: "Buns" },
          { ref: "B6", is: "3 1/2" },
          { ref: "A7", is: "Salsa" },
          { ref: "B7", is: "(1,234.50)" },
        ],
      }),
    );
    expect(workbook.sheets[0]!.name).toBe("Shopping List");
    expect(workbook.parserVersion).toBe("xlsx-interpreted-1");
    const printed = cellAt(workbook, "B3");
    // Raw serial preserved for provenance; interpreted value is the date.
    expect(printed).toMatchObject({
      raw: "44927",
      value: "2023-01-01",
      outcome: "date_1900",
    });
    expect(cellAt(workbook, "B5")).toMatchObject({
      raw: "12.5",
      value: 12.5,
      outcome: "number",
      // Source has no unit and none is invented (issue #274).
      unit: null,
    });
    expect(cellAt(workbook, "B6")).toMatchObject({
      outcome: "fraction_value",
      value: 3.5,
      raw: "3 1/2",
    });
    expect(cellAt(workbook, "B7")).toMatchObject({
      outcome: "accounting_negative",
      value: -1234.5,
      raw: "(1,234.50)",
    });
  });
});
