/**
 * A guest list pasted from a spreadsheet or typed one per line. With a header
 * row, columns are read by their headings (name, email, phone, dietary,
 * allergies, in any order); without one, each cell by what it looks like (an
 * @ is the email, seven digits a phone, a cell saying "allergy" an allergy;
 * the rest dietary needs, then allergies, in their order), so "Laura Chen, laura@x.test, vegetarian" keeps its
 * vegetarian even with no phone typed. Spreadsheet rows are
 * split on tabs; typed rows on commas. Blank lines are skipped, and so is a
 * name already on the list.
 */
export type PastedGuest = {
  name: string;
  email?: string;
  phone?: string;
  dietaryRestrictions?: string[];
  allergenRestrictions?: string[];
};

type Column = "name" | "email" | "phone" | "dietary" | "allergies";

const DEFAULT_COLUMNS: Column[] = [
  "name",
  "email",
  "phone",
  "dietary",
  "allergies",
];

/** What a heading cell names, or null for a cell that is not a heading. */
function headingColumn(cell: string): Column | null {
  const word = cell.trim().toLowerCase();
  if (/^(guest|guest name|name|full name)$/.test(word)) return "name";
  if (/e-?mail/.test(word)) return "email";
  if (/phone|mobile|cell/.test(word)) return "phone";
  if (/diet/.test(word)) return "dietary";
  if (/allerg/.test(word)) return "allergies";
  return null;
}

// Only a cell that says "allergy" is moved to allergies; other words keep
// their place (dietary needs, then allergies), so "no dairy" stays a need.
const ALLERGY = /allerg/i;

/** A row with no heading: each cell placed by its shape, not its position. */
function byShape(cells: string[]): Record<Column, string | undefined> {
  const [name, ...rest] = cells;
  const out: Record<Column, string | undefined> = {
    name,
    email: undefined,
    phone: undefined,
    dietary: undefined,
    allergies: undefined,
  };
  const leftover: string[] = [];
  for (const cell of rest) {
    if (!cell) continue;
    if (!out.email && cell.includes("@")) out.email = cell;
    else if (!out.phone && (cell.match(/\d/g) ?? []).length >= 7)
      out.phone = cell;
    else if (!out.allergies && ALLERGY.test(cell)) out.allergies = cell;
    else leftover.push(cell);
  }
  out.dietary = leftover.shift();
  out.allergies ??= leftover.shift();
  return out;
}

const items = (value: string | undefined) => {
  const list = (value ?? "")
    .split(/[;/]/)
    .map((item) => item.trim())
    .filter(Boolean);
  return list.length ? list : undefined;
};

export function readGuestPaste(
  text: string,
  existingNames: readonly string[],
): PastedGuest[] {
  const seen = new Set(existingNames.map((name) => name.trim().toLowerCase()));
  const out: PastedGuest[] = [];
  let columns: Array<Column | null> = DEFAULT_COLUMNS;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cells = (
      line.includes("\t") ? line.split("\t") : line.split(",")
    ).map((cell) => cell.trim());
    // A heading row says which column is which.
    const headings = cells.map(headingColumn);
    // A heading row names the guest column and one more, in any order.
    if (
      headings.includes("name") &&
      headings.some((col) => col != null && col !== "name")
    ) {
      columns = headings;
      continue;
    }
    // A row with every column filled in is read by position, so an allergy
    // never moves to dietary needs; a shorter row is read by shape.
    const shaped =
      columns === DEFAULT_COLUMNS && cells.length < DEFAULT_COLUMNS.length
        ? byShape(cells)
        : null;
    const cell = (column: Column) => {
      if (shaped) return shaped[column] || undefined;
      const at = columns.indexOf(column);
      return at >= 0 ? cells[at] || undefined : undefined;
    };
    const name = cell("name") ?? "";
    const key = name.toLowerCase();
    if (!name || key === "name" || key === "guest" || seen.has(key)) continue;
    seen.add(key);
    out.push({
      name,
      email: cell("email"),
      phone: cell("phone"),
      dietaryRestrictions: items(cell("dietary")),
      allergenRestrictions: items(cell("allergies")),
    });
  }
  return out;
}
