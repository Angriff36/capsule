import { readZipEntries } from "./zipReader";

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
  const entries = readZipEntries(buffer);
  const text = (name: string) => {
    const entry = entries.get(name);
    return entry === undefined
      ? undefined
      : stripNamespacePrefixes(entry.toString("utf8"));
  };
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
