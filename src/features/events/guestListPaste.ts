/**
 * A guest list pasted from a spreadsheet or typed one per line. With a header
 * row, columns are read by their headings (name, email, phone, dietary,
 * allergies, in any order); without one, in that order. Spreadsheet rows are
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
    if (headings[0] === "name" && headings.some((col, i) => i > 0 && col)) {
      columns = headings;
      continue;
    }
    const cell = (column: Column) => {
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
