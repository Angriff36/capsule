/**
 * A guest list pasted from a spreadsheet or typed one per line. Columns, in
 * order: name, email, phone, dietary needs, allergies. Spreadsheet rows are
 * split on tabs; typed rows on commas. A header row and blank lines are
 * skipped, and so is a name already on the list.
 */
export type PastedGuest = {
  name: string;
  email?: string;
  phone?: string;
  dietaryRestrictions?: string[];
  allergenRestrictions?: string[];
};

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
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cells = (
      line.includes("\t") ? line.split("\t") : line.split(",")
    ).map((cell) => cell.trim());
    const name = cells[0] ?? "";
    const key = name.toLowerCase();
    if (!name || key === "name" || key === "guest" || seen.has(key)) continue;
    seen.add(key);
    out.push({
      name,
      email: cells[1] || undefined,
      phone: cells[2] || undefined,
      dietaryRestrictions: items(cells[3]),
      allergenRestrictions: items(cells[4]),
    });
  }
  return out;
}
