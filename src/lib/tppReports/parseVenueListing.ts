// AC-057 venues: TPP's "Venue Listing" report -> venue rows (TPP_VENUE_MAPPINGS
// field names) for the venue import. Built against the real report
// (.artifacts/tpp-migration-20260905/tpp_migration/reports/company_wide/
// Venue_Listing.xlsx, about 2,700 venues on 75 pages): a title line, the
// heading row (Location, Address, City, State, Zip Code, Phone Number) again
// on every page, a "Printed Date:" line per page, and an "Area:" line under a
// venue for the part of the site the food goes to ("Pavillon", "Loading zone
// out front of the building.").
//
// The report has no venue id, so the import makes one from name + address.
// When TPP has no street address it prints "*Unassigned*" and the venue's
// name is often the address itself ("10210 E Sprague Ave, Spokane Valley").

/** Where every column of the report goes. */
export const TPP_VENUE_LISTING_COLUMNS: ReadonlyArray<{
  column: string;
  field: string;
  note: string;
}> = [
  { column: "Location", field: "VenueName", note: "venue name" },
  {
    column: "Address",
    field: "Address",
    note: '"*Unassigned*" means none; then a name that starts with a number is the address',
  },
  { column: "City", field: "City", note: "city" },
  { column: "State", field: "State", note: "state" },
  { column: "Zip Code", field: "ZipCode", note: "zip code" },
  { column: "Phone Number", field: "ContactPhone", note: "venue phone" },
  {
    column: "Area:",
    field: "AccessNotes",
    note: 'the part of the site the food goes to, as "Area: <text>" in the access notes',
  },
];

const UNASSIGNED = "*Unassigned*";

/** True when the grid is TPP's Venue Listing report. */
export function isVenueListingReport(
  grid: ReadonlyArray<ReadonlyArray<string>>,
): boolean {
  return grid
    .slice(0, 5)
    .some((cells) => (cells[0] ?? "").trim() === "Venue Listing");
}

export function venueListingRowsFromGrid(
  grid: ReadonlyArray<ReadonlyArray<string>>,
): Record<string, string>[] {
  const heading = grid.find(
    (cells) =>
      (cells[0] ?? "").trim() === "Location" &&
      cells.some((cell) => cell.trim() === "Address"),
  );
  if (!heading) return [];
  const at = (name: string) =>
    heading.findIndex((cell) => cell.trim() === name);
  const columns = TPP_VENUE_LISTING_COLUMNS.flatMap(({ column, field }) => {
    const index = at(column);
    return index >= 0 ? [{ index, field }] : [];
  });

  const rows: Record<string, string>[] = [];
  let last: Record<string, string> | null = null;
  for (const raw of grid) {
    const cells = raw.map((cell) => (cell ?? "").trim());
    const first = cells[0] ?? "";
    if (!first || first === "Venue Listing" || first === "Printed Date:")
      continue;
    // The heading row is printed again on every page.
    if (first === "Location" && cells.includes("Address")) continue;
    if (first === "Area:") {
      const area = cells.slice(1).find((cell) => cell !== "");
      if (last && area)
        last.AccessNotes = last.AccessNotes
          ? `${last.AccessNotes}; ${area}`
          : `Area: ${area}`;
      continue;
    }
    // A phone number alone on the next line belongs to the venue above it
    // ("Madison Farm Weddings" then "(509) 558-7468"); it is not a venue.
    if (
      last &&
      cells.slice(1).every((cell) => cell === "") &&
      !/[a-z]/i.test(first) &&
      first.replace(/\D/g, "").length >= 10
    ) {
      last.ContactPhone ??= first;
      continue;
    }
    const row: Record<string, string> = {};
    for (const { index, field } of columns) {
      const value = cells[index] ?? "";
      if (value && value !== UNASSIGNED) row[field] = value;
    }
    if (!row.Address && /^\d/.test(first)) row.Address = first;
    rows.push(row);
    last = row;
  }
  return rows;
}
