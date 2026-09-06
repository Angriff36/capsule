import { readZipEntries } from "./zipReader";
import {
  BUILTIN_NUM_FORMATS,
  XLSX_PARSER_VERSION,
  XLSX_TIMEZONE_ASSUMPTION,
  classifyNumFmtCode,
  formatSerialClock,
  interpretSerial,
  parseAccountingParenthesesText,
  parseFractionText,
  parseLooseNumberText,
  type NumFmtClass,
  type XlsxDateSystem,
} from "./xlsxValues";

/**
 * Reads a TPP .xlsx export into plain string grids.
 *
 * Only what a report parser needs: sheet order, sheet names, and cell text in
 * row/column position. Formatting, formulas and styles are ignored.
 */

export interface XlsxSheet {
  name: string;
  /** Rows of cell text. Sparse cells are filled with "". */
  rows: string[][];
}

/** Named outcome for every interpreted cell — never a silent coercion. */
export type XlsxCellOutcome =
  | "text"
  | "number"
  | "boolean"
  | "error_value"
  | "date_1900"
  | "date_1904"
  | "fractional_day_time"
  | "time"
  | "phantom_leap_day_1900"
  | "serial_before_epoch"
  | "accounting_negative"
  | "fraction_value"
  | "formula_cached_value"
  | "formula_without_cached_value"
  | "merged_non_anchor";

export interface XlsxTypedCell {
  /** Cell coordinate, e.g. "B7". Synthesized for writers that omit r. */
  ref: string;
  /** Stored value exactly as the file holds it (shared strings resolved). */
  raw: string;
  outcome: XlsxCellOutcome;
  /** Naive-local ISO for dates/times, number, boolean, or text. */
  value?: string | number | boolean;
  /** Only from this cell's own format literal; never inferred (issue #274). */
  unit: string | null;
  /** Formula text as stored — recorded, never executed. */
  formula?: string;
  sharedFormulaSi?: number;
  dateSystem?: XlsxDateSystem;
  /** Merge range this cell anchors, e.g. "A1:C1". */
  mergedRange?: string;
}

export interface XlsxTypedSheet {
  name: string;
  mergedRanges: string[];
  cells: XlsxTypedCell[];
}

export interface XlsxTypedWorkbook {
  dateSystem: XlsxDateSystem;
  timezone: "naive-local";
  timezoneAssumption: string;
  macros: "absent" | "present-not-executed";
  parserVersion: string;
  sheets: XlsxTypedSheet[];
}

/** Merged ranges larger than this keep the range recorded but skip member lookup. */
const MERGE_MEMBER_CELL_CAP = 10_000;

/**
 * Drop XML namespace prefixes from tags and attributes.
 *
 * TPP writes `<x:row>` / `r:id`, other writers use bare names. Normalizing once
 * keeps every pattern below simple.
 */
function stripNamespacePrefixes(xml: string): string {
  return xml
    .replace(/<(\/?)[A-Za-z_][\w.-]*:/g, "<$1")
    .replace(/(\s)[A-Za-z_][\w.-]*:([A-Za-z_][\w.-]*=)/g, "$1$2");
}

function decodeXmlText(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCharCode(Number(code)),
    )
    .replace(/&#x([0-9A-Fa-f]+);/g, (_, code: string) =>
      String.fromCharCode(parseInt(code, 16)),
    )
    .replace(/&amp;/g, "&");
}

/** Collect the text of every <t> descendant, which is how rich text splits. */
function readSharedStrings(xml: string | undefined): string[] {
  if (xml === undefined) return [];
  const items = xml.match(/<si\b[\s\S]*?<\/si>|<si\b[^>]*\/>/g) ?? [];
  return items.map((item) => {
    const parts = item.match(/<t\b[^>]*>([\s\S]*?)<\/t>/g) ?? [];
    return decodeXmlText(
      parts
        .map((part) => part.replace(/<t\b[^>]*>([\s\S]*?)<\/t>/, "$1"))
        .join(""),
    );
  });
}

/** "BD12" → 55 (zero-based column index). */
function columnIndexFromReference(reference: string): number {
  const letters = reference.replace(/[^A-Za-z]/g, "").toUpperCase();
  let index = 0;
  for (const letter of letters) {
    index = index * 26 + (letter.charCodeAt(0) - 64);
  }
  return index - 1;
}

function cellText(cell: string, sharedStrings: string[]): string {
  const type = cell.match(/\st="([^"]+)"/)?.[1];
  if (type === "inlineStr") {
    const parts = cell.match(/<t\b[^>]*>([\s\S]*?)<\/t>/g) ?? [];
    return decodeXmlText(
      parts
        .map((part) => part.replace(/<t\b[^>]*>([\s\S]*?)<\/t>/, "$1"))
        .join(""),
    );
  }
  const value = cell.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1];
  if (value === undefined) return "";
  if (type === "s") return sharedStrings[Number(value)] ?? "";
  return decodeXmlText(value);
}

function parseSheet(xml: string, sharedStrings: string[]): string[][] {
  const rowChunks = xml.match(/<row\b[\s\S]*?<\/row>|<row\b[^>]*\/>/g) ?? [];
  return rowChunks.map((rowChunk) => {
    const cells = rowChunk.match(/<c\b[\s\S]*?<\/c>|<c\b[^>]*\/>/g) ?? [];
    const row: string[] = [];
    for (const cell of cells) {
      const reference = cell.match(/\sr="([A-Z]+\d+)"/)?.[1];
      const index = reference
        ? columnIndexFromReference(reference)
        : row.length;
      while (row.length < index) row.push("");
      row[index] = cellText(cell, sharedStrings).replace(/\s+/g, " ").trim();
    }
    return row;
  });
}

/** Sheet name → relationship target, in workbook order. */
function readSheetTargets(
  workbookXml: string,
  relsXml: string,
): Array<{ name: string; target: string }> {
  const relationships = new Map<string, string>();
  for (const rel of relsXml.match(/<Relationship\b[^>]*\/>/g) ?? []) {
    const id = rel.match(/Id="([^"]+)"/)?.[1];
    const target = rel.match(/Target="([^"]+)"/)?.[1];
    if (id && target) relationships.set(id, target.replace(/^\/?xl\//, ""));
  }
  const sheets: Array<{ name: string; target: string }> = [];
  for (const sheet of workbookXml.match(/<sheet\b[^>]*\/>/g) ?? []) {
    const name = sheet.match(/name="([^"]+)"/)?.[1];
    const id = sheet.match(/\sid="([^"]+)"/)?.[1];
    const target = id ? relationships.get(id) : undefined;
    if (name && target) sheets.push({ name: decodeXmlText(name), target });
  }
  return sheets;
}

/** Read every worksheet of an .xlsx file as a string grid. */
export function readXlsxSheets(buffer: Buffer): XlsxSheet[] {
  const text = entryText(readZipEntries(buffer));
  const workbookXml = text("xl/workbook.xml");
  if (workbookXml === undefined) throw new Error("Not an xlsx workbook");
  const sharedStrings = readSharedStrings(text("xl/sharedStrings.xml"));
  const targets = readSheetTargets(
    workbookXml,
    text("xl/_rels/workbook.xml.rels") ?? "",
  );

  return targets.flatMap(({ name, target }) => {
    const sheetXml = text(`xl/${target}`);
    if (sheetXml === undefined) return [];
    return [{ name, rows: parseSheet(sheetXml, sharedStrings) }];
  });
}

function entryText(
  entries: ReturnType<typeof readZipEntries>,
): (name: string) => string | undefined {
  return (name) => {
    const entry = entries.get(name);
    return entry === undefined
      ? undefined
      : stripNamespacePrefixes(entry.toString("utf8"));
  };
}

/** 0 → "A", 25 → "Z", 26 → "AA". */
function columnName(index: number): string {
  let name = "";
  let remaining = index + 1;
  while (remaining > 0) {
    const remainder = (remaining - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    remaining = Math.floor((remaining - 1) / 26);
  }
  return name;
}

/** Resolve each cellXfs entry to its format code (builtin table or custom). */
function readCellFormats(stylesXml: string | undefined): string[] {
  if (stylesXml === undefined) return [];
  const custom = new Map<number, string>();
  for (const fmt of stylesXml.match(/<numFmt\b[^>]*>/g) ?? []) {
    const id = Number(fmt.match(/\bnumFmtId="(\d+)"/)?.[1]);
    const code = fmt.match(/\bformatCode="([^"]*)"/)?.[1];
    if (Number.isInteger(id) && code !== undefined) {
      custom.set(id, decodeXmlText(code));
    }
  }
  const xfsBlock = stylesXml.match(/<cellXfs\b[^>]*>[\s\S]*?<\/cellXfs>/)?.[0];
  const formats: string[] = [];
  for (const xf of xfsBlock?.match(/<xf\b[^>]*>/g) ?? []) {
    const id = Number(xf.match(/\bnumFmtId="(\d+)"/)?.[1]);
    formats.push(
      Number.isInteger(id)
        ? (custom.get(id) ?? BUILTIN_NUM_FORMATS[id] ?? "General")
        : "General",
    );
  }
  return formats;
}

interface FormulaRead {
  text?: string;
  sharedSi?: number;
}

/** `<f>SUM(A1:A2)</f>` or a shared-formula reference; body never executed. */
function readFormula(cell: string): FormulaRead | undefined {
  const match = cell.match(/<f\b([^>]*?)(?:\/>|>([\s\S]*?)<\/f>)/);
  if (match === null) return undefined;
  const attrs = match[1] ?? "";
  const shared = /\bt="shared"/.test(attrs);
  const si = Number(attrs.match(/\bsi="(\d+)"/)?.[1]);
  return {
    text: shared ? undefined : decodeXmlText(match[2] ?? ""),
    sharedSi: shared && Number.isInteger(si) ? si : undefined,
  };
}

interface MergeRead {
  ranges: string[];
  anchorOf: Map<string, string>;
  memberOf: Map<string, string>;
}

function readMerges(sheetXml: string): MergeRead {
  const ranges = [
    ...sheetXml.matchAll(/<mergeCell\b[^>]*\bref="([^"]+)"/g),
  ].map((match) => match[1]!);
  const anchorOf = new Map<string, string>();
  const memberOf = new Map<string, string>();
  for (const range of ranges) {
    const [start, end] = range.split(":");
    const startRef = start?.match(/^([A-Z]+)(\d+)$/);
    const endRef = end?.match(/^([A-Z]+)(\d+)$/);
    if (startRef === null || endRef === null) continue;
    anchorOf.set(startRef[0], range);
    const startCol = columnIndexFromReference(startRef[1]!);
    const endCol = columnIndexFromReference(endRef[1]!);
    const startRow = Number(startRef[2]);
    const endRow = Number(endRef[2]);
    const width = Math.abs(endCol - startCol) + 1;
    const height = Math.abs(endRow - startRow) + 1;
    if (width * height > MERGE_MEMBER_CELL_CAP) continue;
    for (let row = startRow; row <= endRow; row += 1) {
      for (
        let col = Math.min(startCol, endCol);
        col <= Math.max(startCol, endCol);
        col += 1
      ) {
        const ref = `${columnName(col)}${row}`;
        if (ref !== startRef[0]) memberOf.set(ref, range);
      }
    }
  }
  return { ranges, anchorOf, memberOf };
}

function interpretTypedCell(
  cell: string,
  ref: string,
  sharedStrings: string[],
  cellFormats: string[],
  system: XlsxDateSystem,
  classify: (code: string) => NumFmtClass,
  merges: MergeRead,
): XlsxTypedCell | undefined {
  const type = cell.match(/\st="([^"]+)"/)?.[1];
  const raw = cellText(cell, sharedStrings);
  const formula = readFormula(cell);

  if (type === "e") {
    return { ref, raw, outcome: "error_value", unit: null };
  }
  if (type === "b") {
    return { ref, raw, outcome: "boolean", value: raw === "1", unit: null };
  }
  if (raw === "") {
    if (formula !== undefined) {
      return {
        ref,
        raw,
        outcome: "formula_without_cached_value",
        unit: null,
        formula: formula.text,
        sharedFormulaSi: formula.sharedSi,
      };
    }
    if (merges.memberOf.has(ref)) {
      return { ref, raw, outcome: "merged_non_anchor", unit: null };
    }
    // Structurally absent; the string grid already shows "" there.
    return undefined;
  }

  const styleIndex = Number(cell.match(/\ss="(\d+)"/)?.[1]);
  const formatCode = Number.isInteger(styleIndex)
    ? (cellFormats[styleIndex] ?? "General")
    : "General";
  const fmt = classify(formatCode);
  const isStoredNumber = type === undefined || type === "n";
  const storedNumber = isStoredNumber ? Number(raw) : NaN;

  let outcome: XlsxCellOutcome;
  let value: string | number | boolean | undefined;
  let dateSystem: XlsxDateSystem | undefined;

  if (isStoredNumber && Number.isFinite(storedNumber)) {
    if (fmt.kind === "time") {
      // Time-only formats never take a date part; elapsed [h] runs past 24h.
      outcome = "time";
      value = formatSerialClock(storedNumber);
    } else if (fmt.kind === "date") {
      const serial = interpretSerial(storedNumber, system);
      dateSystem = system;
      if (serial.outcome !== undefined) {
        outcome = serial.outcome;
      } else if (serial.date === undefined) {
        outcome = "time";
        value = serial.time;
      } else if (serial.time !== undefined) {
        outcome = "fractional_day_time";
        value = `${serial.date}T${serial.time}`;
      } else {
        outcome = system === "1900" ? "date_1900" : "date_1904";
        value = serial.date;
      }
    } else if (fmt.kind === "fraction") {
      outcome = "fraction_value";
      value = storedNumber;
    } else if (fmt.kind === "accounting") {
      outcome = "accounting_negative";
      value = storedNumber;
    } else {
      outcome = "number";
      value = storedNumber;
    }
  } else {
    const accounting = parseAccountingParenthesesText(raw);
    const fraction = accounting === null ? parseFractionText(raw) : null;
    const loose =
      accounting === null && fraction === null
        ? parseLooseNumberText(raw)
        : null;
    if (accounting !== null) {
      outcome = "accounting_negative";
      value = accounting;
    } else if (fraction !== null) {
      outcome = "fraction_value";
      value = fraction;
    } else if (loose !== null && fmt.kind !== "text") {
      outcome = "number";
      value = loose;
    } else {
      outcome = "text";
      value = raw;
    }
  }

  const record: XlsxTypedCell = {
    ref,
    raw,
    outcome,
    value,
    unit: typeof value === "number" ? fmt.unit : null,
  };
  if (dateSystem !== undefined) record.dateSystem = dateSystem;
  const mergedRange = merges.anchorOf.get(ref);
  if (mergedRange !== undefined) record.mergedRange = mergedRange;
  if (formula !== undefined) {
    // Formulas are recorded and their CACHED value read — never executed.
    // A more specific data outcome (a date, the phantom leap day) wins over
    // the generic formula marker, which the formula fields still carry.
    if (outcome === "number" || outcome === "text") {
      record.outcome = "formula_cached_value";
    }
    record.formula = formula.text;
    record.sharedFormulaSi = formula.sharedSi;
  }
  return record;
}

function parseTypedSheet(
  name: string,
  sheetXml: string,
  sharedStrings: string[],
  cellFormats: string[],
  system: XlsxDateSystem,
): XlsxTypedSheet {
  const classifyCache = new Map<string, NumFmtClass>();
  const classify = (code: string): NumFmtClass => {
    let klass = classifyCache.get(code);
    if (klass === undefined) {
      klass = classifyNumFmtCode(code);
      classifyCache.set(code, klass);
    }
    return klass;
  };
  const merges = readMerges(sheetXml);
  const cells: XlsxTypedCell[] = [];
  const rowChunks =
    sheetXml.match(/<row\b[\s\S]*?<\/row>|<row\b[^>]*\/>/g) ?? [];
  let fallbackRow = 0;
  for (const rowChunk of rowChunks) {
    fallbackRow += 1;
    const rowAttr = rowChunk.match(/\br="(\d+)"/)?.[1];
    const rowNumber = rowAttr !== undefined ? Number(rowAttr) : fallbackRow;
    if (rowAttr !== undefined) fallbackRow = rowNumber;
    const cellChunks = rowChunk.match(/<c\b[\s\S]*?<\/c>|<c\b[^>]*\/>/g) ?? [];
    let fallbackColumn = 0;
    for (const cell of cellChunks) {
      fallbackColumn += 1;
      const refAttr = cell.match(/\br="([A-Z]+\d+)"/)?.[1];
      const ref = refAttr ?? `${columnName(fallbackColumn - 1)}${rowNumber}`;
      if (refAttr !== undefined) {
        fallbackColumn = columnIndexFromReference(refAttr) + 1;
      }
      const record = interpretTypedCell(
        cell,
        ref,
        sharedStrings,
        cellFormats,
        system,
        classify,
        merges,
      );
      if (record !== undefined) cells.push(record);
    }
  }
  return { name, mergedRanges: merges.ranges, cells };
}

/**
 * Read an .xlsx file with every stored value interpreted and named.
 *
 * Raw values are preserved alongside their interpretation, the date system
 * and timezone assumption are recorded, and formulas/macros are never
 * executed — cached values are read and named as such.
 */
export function readXlsxWorkbook(buffer: Buffer): XlsxTypedWorkbook {
  const entries = readZipEntries(buffer);
  const text = entryText(entries);
  const workbookXml = text("xl/workbook.xml");
  if (workbookXml === undefined) throw new Error("Not an xlsx workbook");
  const sharedStrings = readSharedStrings(text("xl/sharedStrings.xml"));
  const cellFormats = readCellFormats(text("xl/styles.xml"));
  const system: XlsxDateSystem =
    /<workbookPr\b[^>]*\bdate1904="(?:1|true)"/.test(workbookXml)
      ? "1904"
      : "1900";
  const targets = readSheetTargets(
    workbookXml,
    text("xl/_rels/workbook.xml.rels") ?? "",
  );
  const sheets = targets.flatMap(({ name, target }) => {
    const sheetXml = text(`xl/${target}`);
    if (sheetXml === undefined) return [];
    return [
      parseTypedSheet(name, sheetXml, sharedStrings, cellFormats, system),
    ];
  });
  return {
    dateSystem: system,
    timezone: "naive-local",
    timezoneAssumption: XLSX_TIMEZONE_ASSUMPTION,
    macros: entries.has("xl/vbaProject.bin")
      ? "present-not-executed"
      : "absent",
    parserVersion: XLSX_PARSER_VERSION,
    sheets,
  };
}
