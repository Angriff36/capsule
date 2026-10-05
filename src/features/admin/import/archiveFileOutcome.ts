// Plain words for what happened to each file of an uploaded report archive
// (PL-ARCHIVE). Every file is accounted for; being accounted for does not
// mean its rows became Capsule records.

const FILE_RESULTS: Record<string, string> = {
  pending: "Not sorted yet",
  normalized: "Readable — its rows can come into Capsule",
  linked_reference: "Kept as reference — no new records",
  duplicate_view: "Same data as another file here — no new records",
  needs_mapping: "Some rows need a match before they can come in",
  unsupported: "Capsule can't read this kind of report — kept on file",
  invalid: "File is damaged or not a spreadsheet — kept on file",
};

const ROW_WORDS: Array<[string, string]> = [
  ["normalized", "readable"],
  ["needs_mapping", "need a match"],
  ["unsupported", "not readable"],
  ["header", "headings"],
  ["summary", "footers"],
];

export function archiveFileResult(disposition: string): string {
  return FILE_RESULTS[disposition] ?? disposition;
}

/** "7 rows: readable 3, headings 3, footers 1" — every row is counted. */
export function archiveRowText(
  totalRowCount: number,
  rowOutcomeCounts: string,
): string {
  let counts: Record<string, number> = {};
  try {
    counts = JSON.parse(rowOutcomeCounts || "{}") as Record<string, number>;
  } catch {
    counts = {};
  }
  const parts = ROW_WORDS.filter(([key]) => (counts[key] ?? 0) > 0).map(
    ([key, word]) => `${word} ${counts[key]}`,
  );
  const rows = `${totalRowCount} row${totalRowCount === 1 ? "" : "s"}`;
  return parts.length > 0 ? `${rows}: ${parts.join(", ")}` : rows;
}

/** Report names typed or pasted one per line (blank lines ignored). */
export function parseIndexNames(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0),
    ),
  ];
}
