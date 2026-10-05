// Saved letter texts (the old TPP letter writer's "Body Message" list) reuse
// SavedReportDefinition like saved list views do (src/features/views/
// useSavedViews.ts): chartType marks the row, definition.text holds the words,
// and "team" sharing lets every staff member pick the company's texts.
export const LETTER_TEXT_MARKER = "letter-message";

export interface SavedLetterText {
  id: string;
  version: number;
  name: string;
  text: string;
}

interface SavedReportRowLike {
  _id: unknown;
  version?: unknown;
  name?: unknown;
  chartType?: unknown;
  status?: unknown;
  deletedAt?: unknown;
  definition?: unknown;
}

export function savedLetterTexts(
  rows: readonly SavedReportRowLike[] | undefined,
): SavedLetterText[] {
  return (rows ?? [])
    .filter(
      (row) =>
        String(row.chartType) === LETTER_TEXT_MARKER &&
        String(row.status) !== "archived" &&
        row.deletedAt == null,
    )
    .map((row) => {
      const definition = (row.definition ?? {}) as { text?: unknown };
      return {
        id: String(row._id),
        version: Number(row.version ?? 0),
        name: String(row.name ?? ""),
        text: typeof definition.text === "string" ? definition.text : "",
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
