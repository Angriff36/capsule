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

export async function sha256Hex(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data as BufferSource);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
