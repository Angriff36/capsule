import {
  fontReferences,
  readIndirectObjects,
  referenceIn,
  type PdfIndirectObject,
} from "./pdfObjects";

/**
 * Extracts positioned text from a TPP PDF export.
 *
 * The exports embed subset fonts with single-byte codes plus a ToUnicode CMap,
 * so text recovery needs each font's own CMap but not a font engine. Standard
 * library only; a PDF dependency is not worth carrying for one report.
 */

/** One table cell: text that sits together, separated from its neighbours by a column gap. */
export interface PdfTextCell {
  /** PDF user-space X of the cell's first glyph. */
  x: number;
  text: string;
}

export interface PdfTextLine {
  /** Text of one visual line, left to right. */
  text: string;
  /** Page index, zero based. */
  page: number;
  /** PDF user-space Y of the line. Higher is nearer the page top. */
  y: number;
  /** The line split at column gaps, left to right. */
  cells: PdfTextCell[];
}

type UnicodeMap = Map<number, string>;

function hexToChars(hex: string): string {
  let out = "";
  for (let index = 0; index + 4 <= hex.length; index += 4) {
    const code = parseInt(hex.slice(index, index + 4), 16);
    if (!Number.isNaN(code)) out += String.fromCharCode(code);
  }
  return out;
}

function parseCMap(source: string): UnicodeMap {
  const map: UnicodeMap = new Map();
  const pairPattern = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g;

  for (const block of source.match(/beginbfchar([\s\S]*?)endbfchar/g) ?? []) {
    for (const [, code, value] of block.matchAll(pairPattern)) {
      map.set(parseInt(code, 16), hexToChars(value));
    }
  }
  const triplePattern =
    /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g;
  for (const block of source.match(/beginbfrange([\s\S]*?)endbfrange/g) ?? []) {
    for (const [, low, high, start] of block.matchAll(triplePattern)) {
      const first = parseInt(low, 16);
      const last = parseInt(high, 16);
      const base = parseInt(start, 16);
      for (let code = first; code <= last && code - first < 1024; code += 1) {
        map.set(code, String.fromCharCode(base + (code - first)));
      }
    }
  }
  return map;
}

/** Resolve one font object to its ToUnicode map, following descendant fonts. */
function unicodeMapForFont(
  fontNumber: number,
  objects: Map<number, PdfIndirectObject>,
  cache: Map<number, UnicodeMap>,
): UnicodeMap {
  const cached = cache.get(fontNumber);
  if (cached) return cached;

  const font = objects.get(fontNumber);
  const empty: UnicodeMap = new Map();
  if (!font) return empty;

  let toUnicode = referenceIn(font.header, "ToUnicode");
  if (toUnicode === undefined) {
    const descendant = font.header.match(
      /\/DescendantFonts\s*\[\s*(\d+)\s+\d+\s+R/,
    )?.[1];
    if (descendant !== undefined) {
      toUnicode = referenceIn(
        objects.get(Number(descendant))?.header ?? "",
        "ToUnicode",
      );
    }
  }
  const stream = toUnicode === undefined ? undefined : objects.get(toUnicode);
  const map =
    stream?.stream === undefined
      ? empty
      : parseCMap(stream.stream.toString("latin1"));
  cache.set(fontNumber, map);
  return map;
}

function decodeHexString(hex: string, unicode: UnicodeMap): string {
  let out = "";
  for (let index = 0; index + 2 <= hex.length; index += 2) {
    const code = parseInt(hex.slice(index, index + 2), 16);
    if (!Number.isNaN(code)) out += unicode.get(code) ?? "";
  }
  return out;
}

function decodeLiteralString(literal: string, unicode: UnicodeMap): string {
  const unescaped = literal.replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, (_, esc) => {
    if (/^[0-7]+$/.test(esc)) return String.fromCharCode(parseInt(esc, 8));
    const table: Record<string, string> = {
      n: "\n",
      r: "\r",
      t: "\t",
      b: "\b",
      f: "\f",
    };
    return table[esc] ?? esc;
  });
  let out = "";
  for (const char of unescaped) {
    out += unicode.get(char.charCodeAt(0)) ?? char;
  }
  return out;
}

interface TextRun {
  text: string;
  x: number;
  y: number;
  /** Font size in effect, used to calibrate glyph advances. */
  size: number;
}

const TOKEN_PATTERN =
  /<[0-9A-Fa-f\s]*>|\((?:\\.|[^()\\])*\)|\[[\s\S]*?\]|\/[^\s/<>[\]()]+|[-+\d.]+|[A-Za-z'"*]+/g;

/** Walk the text operators of one content stream, tracking the text matrix. */
function readRuns(
  content: string,
  fontMaps: Map<string, UnicodeMap>,
): TextRun[] {
  const runs: TextRun[] = [];
  const stack: string[] = [];
  const empty: UnicodeMap = new Map();
  let unicode = empty;
  let verticalSign = 1;
  let size = 0;
  let x = 0;
  let y = 0;
  let lineX = 0;
  let lineY = 0;

  const decodeToken = (token: string): string => {
    if (token.startsWith("<")) {
      return decodeHexString(token.replace(/[^0-9A-Fa-f]/g, ""), unicode);
    }
    if (token.startsWith("(")) {
      return decodeLiteralString(token.slice(1, -1), unicode);
    }
    return "";
  };
  const emit = (text: string) => {
    if (text.length > 0) runs.push({ text, x, y: y * verticalSign, size });
  };

  for (const [token] of content.matchAll(TOKEN_PATTERN)) {
    switch (token) {
      case "BT":
        x = 0;
        y = 0;
        lineX = 0;
        lineY = 0;
        break;
      case "Tf": {
        const name = stack.at(-2);
        if (name?.startsWith("/")) {
          unicode = fontMaps.get(name.slice(1)) ?? empty;
        }
        const points = Number(stack.at(-1));
        if (Number.isFinite(points)) size = points;
        break;
      }
      case "Td":
      case "TD": {
        const dy = Number(stack.at(-1));
        const dx = Number(stack.at(-2));
        if (Number.isFinite(dx) && Number.isFinite(dy)) {
          lineX += dx;
          lineY += dy;
          x = lineX;
          y = lineY;
        }
        break;
      }
      case "Tm": {
        const ty = Number(stack.at(-1));
        const tx = Number(stack.at(-2));
        const vertical = Number(stack.at(-3));
        if (Number.isFinite(vertical) && vertical !== 0) {
          verticalSign = vertical < 0 ? -1 : 1;
        }
        if (Number.isFinite(tx) && Number.isFinite(ty)) {
          lineX = tx;
          lineY = ty;
          x = tx;
          y = ty;
        }
        break;
      }
      case "T*":
        x = lineX;
        y = lineY;
        break;
      case "Tj":
      case "'":
      case '"':
        emit(decodeToken(stack.at(-1) ?? ""));
        break;
      case "TJ": {
        const parts =
          (stack.at(-1) ?? "").match(
            /<[0-9A-Fa-f\s]*>|\((?:\\.|[^()\\])*\)/g,
          ) ?? [];
        emit(parts.map(decodeToken).join(""));
        break;
      }
      default:
        stack.push(token);
        if (stack.length > 16) stack.shift();
        continue;
    }
    stack.length = 0;
  }
  return runs;
}

/**
 * Glyphs are placed one at a time, so a word break is a gap wider than the
 * previous glyph itself. Glyph widths differ per character, so calibrate each
 * character at each font size against the narrowest advance seen for it.
 */
type AdvanceTable = Map<string, number>;

function advanceKey(run: TextRun): string {
  return `${run.text}@${Math.round(run.size * 4)}`;
}

/** Narrowest observed advance per character, which is its width with no space. */
function measureAdvances(runs: readonly TextRun[]): AdvanceTable {
  const table: AdvanceTable = new Map();
  const byLine = new Map<string, TextRun[]>();
  for (const run of runs) {
    const key = `${run.y}`;
    const bucket = byLine.get(key);
    if (bucket) bucket.push(run);
    else byLine.set(key, [run]);
  }
  for (const bucket of byLine.values()) {
    const ordered = [...bucket].sort((a, b) => a.x - b.x);
    for (let index = 1; index < ordered.length; index += 1) {
      const previous = ordered[index - 1]!;
      const gap = ordered[index]!.x - previous.x;
      if (gap <= 0) continue;
      const key = advanceKey(previous);
      const known = table.get(key);
      if (known === undefined || gap < known) table.set(key, gap);
    }
  }
  return table;
}

/**
 * A word break is a gap a little wider than a glyph; a column break is a gap
 * several glyphs wide. Cells keep the table shape that the flat text loses.
 */
function joinRun(
  runs: TextRun[],
  advances: AdvanceTable,
): { text: string; cells: PdfTextCell[] } {
  const ordered = [...runs].sort((a, b) => a.x - b.x);
  const cells: PdfTextCell[] = [];
  let cell: PdfTextCell | undefined =
    ordered[0] === undefined
      ? undefined
      : { x: ordered[0].x, text: ordered[0].text };

  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1]!;
    const current = ordered[index]!;
    const gap = current.x - previous.x;
    const width = advances.get(advanceKey(previous)) ?? gap;
    if (cell && gap > Math.max(width * 4, 9)) {
      cells.push(cell);
      cell = { x: current.x, text: current.text };
      continue;
    }
    const needsSpace =
      gap > width * 1.35 + 0.4 && !/\s$/.test(cell?.text ?? "");
    if (cell) cell.text += needsSpace ? ` ${current.text}` : current.text;
  }
  if (cell) cells.push(cell);

  const tidy = cells
    .map((entry) => ({
      x: entry.x,
      text: entry.text.replace(/\s+/g, " ").trim(),
    }))
    .filter((entry) => entry.text.length > 0);
  return { text: tidy.map((entry) => entry.text).join(" "), cells: tidy };
}

/** Group runs that share a baseline into single left-to-right lines. */
function groupIntoLines(
  runs: TextRun[],
  page: number,
  advances: AdvanceTable,
): PdfTextLine[] {
  const buckets = new Map<number, TextRun[]>();
  for (const run of runs) {
    const key = Math.round(run.y);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(run);
    else buckets.set(key, [run]);
  }
  return [...buckets.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([y, bucket]) => ({ page, y, ...joinRun(bucket, advances) }))
    .filter((line) => line.text.length > 0);
}

interface PdfPage {
  contents: Buffer[];
  fonts: Map<string, UnicodeMap>;
}

function collectPages(objects: Map<number, PdfIndirectObject>): PdfPage[] {
  const cache = new Map<number, UnicodeMap>();
  const pages: PdfPage[] = [];

  for (const object of objects.values()) {
    if (!/\/Type\s*\/Page\b/.test(object.header)) continue;

    const resourcesNumber = referenceIn(object.header, "Resources");
    const resources =
      resourcesNumber === undefined
        ? object.header
        : (objects.get(resourcesNumber)?.header ?? "");

    const fonts = new Map<string, UnicodeMap>();
    for (const [name, number] of fontReferences(resources)) {
      fonts.set(name, unicodeMapForFont(number, objects, cache));
    }

    const contents: Buffer[] = [];
    const single = referenceIn(object.header, "Contents");
    if (single !== undefined) {
      const stream = objects.get(single)?.stream;
      if (stream) contents.push(stream);
    } else {
      const array = object.header.match(/\/Contents\s*\[([^\]]*)\]/)?.[1] ?? "";
      for (const [, number] of array.matchAll(/(\d+)\s+\d+\s+R/g)) {
        const stream = objects.get(Number(number))?.stream;
        if (stream) contents.push(stream);
      }
    }
    if (contents.length > 0) pages.push({ contents, fonts });
  }
  return pages;
}

/** Extract text lines from a PDF, in page then top-to-bottom order. */
export function readPdfTextLines(buffer: Buffer): PdfTextLine[] {
  const objects = readIndirectObjects(buffer);
  const lines: PdfTextLine[] = [];
  const pages = collectPages(objects).map((page) =>
    page.contents.flatMap((content) =>
      readRuns(content.toString("latin1"), page.fonts),
    ),
  );
  const advances = measureAdvances(pages.flat());
  pages.forEach((runs, index) => {
    lines.push(...groupIntoLines(runs, index, advances));
  });
  return lines;
}
