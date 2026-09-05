/// <reference types="vite/client" />
/**
 * Shared synthetic-zip fixtures for the import-archive proofs.
 *
 * Stored-only (no compression, zero timestamps) — the fixtures only need
 * structural validity. `buildWorkbook` produces a MINIMAL but REAL .xlsx:
 * workbook.xml + rels + one inlineStr worksheet, so the disposition
 * classifier's readXlsxSheets pass parses actual sheets and rows from it.
 * Everything here is synthetic; never ship private TPP exports.
 */

export const u16 = (v: number) => [v & 0xff, (v >>> 8) & 0xff];
export const u32 = (v: number) => [
  v & 0xff,
  (v >>> 8) & 0xff,
  (v >>> 16) & 0xff,
  (v >>> 24) & 0xff,
];
export const bytesOf = (text: string) =>
  Array.from(new TextEncoder().encode(text));

export function buildStoredZip(
  entries: Array<{ name: string; data: number[] }>,
) {
  const local: number[] = [];
  const central: number[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = bytesOf(entry.name);
    local.push(
      ...u32(0x04034b50),
      ...u16(20),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(0),
      ...u32(entry.data.length),
      ...u32(entry.data.length),
      ...u16(name.length),
      ...u16(0),
      ...name,
      ...entry.data,
    );
    central.push(
      ...u32(0x02014b50),
      ...u16(20),
      ...u16(20),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(0),
      ...u32(entry.data.length),
      ...u32(entry.data.length),
      ...u16(name.length),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(0),
      ...u32(offset),
      ...name,
    );
    offset += 30 + name.length + entry.data.length;
  }
  return new Uint8Array([
    ...local,
    ...central,
    ...u32(0x06054b50),
    ...u16(0),
    ...u16(0),
    ...u16(entries.length),
    ...u16(entries.length),
    ...u32(central.length),
    ...u32(local.length),
    ...u16(0),
  ]);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function sheetXml(rows: string[][]): string {
  const rowXml = rows
    .map((cells, rowIndex) => {
      const cellXml = cells
        .map((value, colIndex) => {
          if (value === "") return "";
          const ref = `${String.fromCharCode(65 + colIndex)}${rowIndex + 1}`;
          return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
        })
        .join("");
      return `<row r="${rowIndex + 1}">${cellXml}</row>`;
    })
    .join("");
  return `<?xml version="1.0"?><worksheet><sheetData>${rowXml}</sheetData></worksheet>`;
}

/** One real minimal .xlsx with a single worksheet holding the given rows. */
export function buildWorkbook(rows: string[][]): Uint8Array {
  return buildStoredZip([
    {
      name: "[Content_Types].xml",
      data: bytesOf(
        '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
      ),
    },
    {
      name: "xl/workbook.xml",
      data: bytesOf(
        '<?xml version="1.0"?><workbook><sheets><sheet name="Report" sheetId="1" r:id="rId1"/></sheets></workbook>',
      ),
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: bytesOf(
        '<?xml version="1.0"?><Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
      ),
    },
    {
      name: "xl/worksheets/sheet1.xml",
      data: bytesOf(sheetXml(rows)),
    },
  ]);
}

// --- Typed-workbook fixtures (styled cells, numFmts, merges, formulas) ---
// Same cell model as tests/xlsx-date-formats.test.ts, shared here so the
// archive proofs can persist real interpreted provenance (R2-8).

export interface FixtureCell {
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

function fixtureCellXml(cell: FixtureCell): string {
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

function styledSheetXml(cells: FixtureCell[], merges?: string[]): string {
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
        `<row r="${rowNumber}">${rowCells.map(fixtureCellXml).join("")}</row>`,
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

/** One real minimal .xlsx with styles, custom numFmts, merges and formulas. */
export function buildStyledWorkbook(options: {
  sheetName?: string;
  numFmts?: Array<{ id: number; code: string }>;
  xfNumFmtIds?: number[];
  cells?: FixtureCell[];
  merges?: string[];
}): Uint8Array {
  const numFmts = options.numFmts ?? [];
  const xfIds = options.xfNumFmtIds ?? [];
  // formatCode is an XML attribute — escape its quotes (a unit literal like
  // 0" hrs" would otherwise terminate the attribute early).
  const attrCode = (code: string) => escapeXml(code).replace(/"/g, "&quot;");
  const styles = `<styleSheet>${
    numFmts.length > 0
      ? `<numFmts count="${numFmts.length}">${numFmts
          .map(
            (fmt) =>
              `<numFmt numFmtId="${fmt.id}" formatCode="${attrCode(fmt.code)}"/>`,
          )
          .join("")}</numFmts>`
      : ""
  }<fonts count="1"><font/></fonts><fills count="1"><fill/></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="${xfIds.length}">${xfIds
    .map((id) => `<xf numFmtId="${id}" applyNumberFormat="1"/>`)
    .join("")}</cellXfs></styleSheet>`;
  return buildStoredZip([
    {
      name: "[Content_Types].xml",
      data: bytesOf(
        '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
      ),
    },
    {
      name: "xl/workbook.xml",
      data: bytesOf(
        `<?xml version="1.0"?><workbook><sheets><sheet name="${
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
      data: bytesOf(styledSheetXml(options.cells ?? [], options.merges ?? [])),
    },
  ]);
}

export async function sha256Hex(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data as BufferSource);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
