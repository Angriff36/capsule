import {
  entryText,
  readSheetTargets,
  type ZipEntryMap,
} from "./xlsxWorkbookParser";

/**
 * How a cell is printed, for reports whose only structure is the font: TPP's
 * Menu Item Packages puts the package name, its choice groups and its dishes
 * all in column A and tells them apart by bold, italic, blue and a rule line.
 */
export interface XlsxCellLook {
  bold: boolean;
  italic: boolean;
  /** Font colour as ARGB ("FF0000FF"), or null when the cell sets none. */
  color: string | null;
  /** A rule line under the cell. */
  bottomBorder: boolean;
}

const FLAG = {
  b: /<b(\s[^>]*)?\/?>/,
  i: /<i(\s[^>]*)?\/?>/,
} as const;

/** `<b/>` and `<b val="1"/>` are on; `<b val="0"/>` is off. */
const flag = (font: string, tag: keyof typeof FLAG) => {
  const match = font.match(FLAG[tag]);
  if (!match) return false;
  const val = match[1]?.match(/val="([^"]*)"/)?.[1];
  return val === undefined || (val !== "0" && val !== "false");
};

const BLOCK = {
  fonts: /<fonts(\s[^>]*)?>[\s\S]*?<\/fonts>/,
  borders: /<borders(\s[^>]*)?>[\s\S]*?<\/borders>/,
  cellXfs: /<cellXfs(\s[^>]*)?>[\s\S]*?<\/cellXfs>/,
} as const;

function readLooks(stylesXml: string | undefined): XlsxCellLook[] {
  if (stylesXml === undefined) return [];
  const block = (name: keyof typeof BLOCK) =>
    stylesXml.match(BLOCK[name])?.[0] ?? "";
  const fonts = (
    block("fonts").match(
      /<font(\s[^>]*)?\/>|<font(\s[^>]*)?>[\s\S]*?<\/font>/g,
    ) ?? []
  ).map((font) => ({
    bold: flag(font, "b"),
    italic: flag(font, "i"),
    color: font.match(/<color\s[^>]*rgb="([^"]+)"/)?.[1] ?? null,
  }));
  const borders = (
    block("borders").match(
      /<border(\s[^>]*)?\/>|<border(\s[^>]*)?>[\s\S]*?<\/border>/g,
    ) ?? []
  ).map((border) => /<bottom\s[^>]*style="[^"]+"/.test(border));
  return (block("cellXfs").match(/<xf\s[^>]*>/g) ?? []).map((xf) => {
    const font = fonts[Number(xf.match(/\sfontId="(\d+)"/)?.[1] ?? 0)];
    return {
      bold: font?.bold ?? false,
      italic: font?.italic ?? false,
      color: font?.color ?? null,
      bottomBorder:
        borders[Number(xf.match(/\sborderId="(\d+)"/)?.[1] ?? 0)] ?? false,
    };
  });
}

/** Each sheet's cell looks by cell reference ("A4"), in workbook order. */
export function readXlsxCellLooksFromEntries(
  entries: ZipEntryMap,
): Array<Map<string, XlsxCellLook>> {
  const text = entryText(entries);
  const workbookXml = text("xl/workbook.xml");
  if (workbookXml === undefined) throw new Error("Not an xlsx workbook");
  const looks = readLooks(text("xl/styles.xml"));
  return readSheetTargets(
    workbookXml,
    text("xl/_rels/workbook.xml.rels") ?? "",
  ).map(({ target }) => {
    const byRef = new Map<string, XlsxCellLook>();
    for (const open of text(`xl/${target}`)?.match(/<c\s[^>]*>/g) ?? []) {
      const ref = open.match(/\sr="([A-Z]+\d+)"/)?.[1];
      const style = open.match(/\ss="(\d+)"/)?.[1];
      const look = style === undefined ? undefined : looks[Number(style)];
      if (ref && look) byRef.set(ref, look);
    }
    return byRef;
  });
}
