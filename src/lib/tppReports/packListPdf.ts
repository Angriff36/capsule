import type { BundlePackListItem, EventBundlePart } from "./eventBundle";
import type { PdfTextLine } from "./pdfTextReader";
import { packListHeader, packListItem, splitForItems } from "./parsePackList";

const TITLE = /^pack list$/i;
const GROUPED_BY = /^grouped by:/i;
/** The labels repeated at the top of every page, and the page footer. */
const PAGE_LABEL =
  /^(pack list|grouped by:|event date:|contact:|event title:|invoice #:|status:|print(?:ed)? date:)/i;
const ITEM_START = /^\(\d/;
/** Section headings ("Equipment", "Menu Items") sit at the page margin. */
const SECTION_X = 40;
/** A wrapped line sits closer under the line above it than the next item. */
const WRAP_GAP = 12.5;

/** True when the PDF is a TPP Pack List print. */
export function isPackListPdf(lines: readonly PdfTextLine[]): boolean {
  return (
    lines.some((line) => TITLE.test(line.text)) &&
    lines.some((line) => GROUPED_BY.test(line.text))
  );
}

interface Column {
  item?: BundlePackListItem;
  /** Where the last "For:" or note line under the item was printed. */
  detailY?: number;
  detailPage?: number;
  forText?: string;
  inFor: boolean;
}

/**
 * The Pack List PDF as the pack list part. The print sets two items side by
 * side; under each item, indented, come its "For:" line and any notes. Each
 * printed text therefore belongs to the item in its own column, which keeps a
 * note like "ovens" on the propane tank it was written under. Group headings
 * sit just right of the margin and can wrap onto a second line. In a list
 * grouped by menu item, the group heading is also what its items are for.
 */
export function parsePackListPdf(
  lines: readonly PdfTextLine[],
): EventBundlePart {
  const firstPage = lines.filter((line) => line.page === lines[0]?.page);
  const header = packListHeader(
    firstPage.map((line) => line.cells.map((cell) => cell.text.trim())),
  );

  const itemXs = lines.flatMap((line) =>
    line.cells.filter((cell) => ITEM_START.test(cell.text)).map((c) => c.x),
  );
  const left = Math.min(...itemXs);
  const right = Math.max(...itemXs);
  const split = right - left > 100 ? (left + right) / 2 : Infinity;
  const itemX = (column: number) => (column === 0 ? left : right);

  const items: BundlePackListItem[] = [];
  const forTexts = new Map<BundlePackListItem, string>();
  let columns: Column[] = [{ inFor: false }, { inFor: false }];
  let menuGrouped = false;
  let group = "Unclassified";
  let groupLine: PdfTextLine | undefined;

  for (const line of lines) {
    const first = line.cells[0];
    if (!first || PAGE_LABEL.test(first.text.trim())) continue;

    if (line.cells.length === 1 && first.x < left - 10) {
      const text = first.text.trim();
      if (first.x < SECTION_X) {
        menuGrouped ||= /^menu items$/i.test(text);
        groupLine = undefined;
        continue;
      }
      const wrapped =
        groupLine !== undefined &&
        groupLine.page === line.page &&
        groupLine.y - line.y <= WRAP_GAP;
      group = wrapped ? `${group} ${text}` : text;
      groupLine = line;
      columns = [{ inFor: false }, { inFor: false }];
      continue;
    }
    groupLine = undefined;

    for (const cell of line.cells) {
      const index = cell.x < split ? 0 : 1;
      const column = columns[index]!;
      const text = cell.text.trim();
      if (cell.x < itemX(index) + 5) {
        const item = packListItem(text, "", []);
        if (item) {
          item.classification = group;
          if (menuGrouped) item.forItems = [group];
          items.push(item);
          columns[index] = { item, inFor: false };
        } else if (column.item) {
          // The item name wrapped onto the next line.
          column.item.name = `${column.item.name} ${text}`;
        }
        continue;
      }
      if (!column.item) continue;
      const close =
        column.detailPage === line.page &&
        column.detailY !== undefined &&
        column.detailY - line.y <= WRAP_GAP;
      if (/^For:/i.test(text)) {
        forTexts.set(column.item, text);
        column.inFor = true;
      } else if (column.inFor && close) {
        forTexts.set(column.item, `${forTexts.get(column.item)} ${text}`);
      } else {
        column.inFor = false;
        column.item.notes =
          column.item.notes === undefined
            ? text
            : `${column.item.notes} ${text}`;
      }
      column.detailY = line.y;
      column.detailPage = line.page;
    }
  }

  for (const [item, text] of forTexts)
    item.forItems.push(...splitForItems(text));
  return { source: "packList", header, packList: items };
}
