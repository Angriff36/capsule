import type { BundleMenuItem, EventBundlePart } from "./eventBundle";
import type { PdfTextLine } from "./pdfTextReader";
import { findLabelledValue } from "./csvRows";
import { parseReportDate } from "./reportValues";

const TITLE = /^event menu$/i;
const PREPARED_FOR = /^prepared for:$/i;
const FOOTER = /^date printed:/i;
const DIETARY = /^dietary restrictions?:\s*/i;
/** A wrapped line sits closer under the line above it than a new paragraph. */
const WRAP_GAP = 12.5;
/** Paragraphs of one dish sit closer together than a course heading does. */
const PARAGRAPH_GAP = 16;

/** True when the PDF is a TPP Event Menu print (the client's menu). */
export function isEventMenuPdf(lines: readonly PdfTextLine[]): boolean {
  return (
    lines.some((line) => TITLE.test(line.text)) &&
    lines.some((line) => PREPARED_FOR.test(line.cells[0]?.text ?? ""))
  );
}

interface Dish {
  name: string;
  course?: string;
  paragraphs: string[];
}

/**
 * The Event Menu PDF as a menu part. TPP prints each dish name one point in
 * from the margin, then the dish's own note and its description as
 * paragraphs at the margin. A margin line set further below the dish than a
 * paragraph is the next course heading ("Reception", "Beverages").
 */
export function parseEventMenuPdf(
  lines: readonly PdfTextLine[],
): EventBundlePart {
  const start = lines.findIndex((line) =>
    PREPARED_FOR.test(line.cells[0]?.text ?? ""),
  );
  const headerRow = lines[start]?.cells.map((cell) => cell.text.trim()) ?? [];
  const body = lines
    .slice(start + 1)
    .filter((line) => line.cells.length > 0 && !FOOTER.test(line.text));
  const margin = Math.min(...body.map((line) => line.cells[0]!.x));
  const isDish = (line: PdfTextLine) => line.cells[0]!.x >= margin + 0.5;

  const dishes: Dish[] = [];
  const intro: string[] = [];
  let course: string | undefined;
  let dish: Dish | undefined;
  let previous: PdfTextLine | undefined;

  for (const [index, line] of body.entries()) {
    const text = line.text.trim();
    const gap =
      previous && previous.page === line.page ? previous.y - line.y : Infinity;
    previous = line;
    if (isDish(line)) {
      dish = { name: text, course, paragraphs: [] };
      dishes.push(dish);
      continue;
    }
    if (!dish) {
      // Before the first dish: the menu name, the dietary line, and the
      // first course heading right above the first dish.
      if (body[index + 1] && isDish(body[index + 1]!)) course = text;
      else intro.push(text);
      continue;
    }
    if (gap >= PARAGRAPH_GAP && gap !== Infinity) {
      course = text;
      dish = undefined;
      continue;
    }
    if (gap <= WRAP_GAP && dish.paragraphs.length > 0) {
      dish.paragraphs[dish.paragraphs.length - 1] += ` ${text}`;
    } else {
      dish.paragraphs.push(text);
    }
  }

  // A dish's own note prints before its description. A dish with one
  // paragraph has only a description, unless the same words are another
  // dish's note ("Set out for pre ceremony hour").
  const notes = new Set(
    dishes.flatMap((entry) =>
      entry.paragraphs.length > 1 ? [entry.paragraphs[0]!] : [],
    ),
  );
  const menu = dishes.map((entry): BundleMenuItem => {
    const item: BundleMenuItem = { name: entry.name };
    if (entry.course) item.course = entry.course;
    const [first, ...rest] = entry.paragraphs;
    if (first === undefined) return item;
    if (rest.length > 0 || notes.has(first)) item.specialInstructions = first;
    else rest.unshift(first);
    if (rest.length > 0) item.description = rest.join(" ");
    return item;
  });

  const dietary = intro.find((text) => DIETARY.test(text));
  return {
    source: "eventMenu",
    header: {
      eventDate: parseReportDate(findLabelledValue([headerRow], "Event Date")),
    },
    client: { name: findLabelledValue([headerRow], "Prepared for") },
    menu,
    notes: dietary ? { dietary: dietary.replace(DIETARY, "") } : {},
  };
}
