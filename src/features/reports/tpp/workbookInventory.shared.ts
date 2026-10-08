export type TppArchiveUse =
  | { kind: "report"; reportId: string; note?: string }
  | { kind: "screen"; route: string; what: string };

export interface TppArchiveWorkbook {
  /** Path inside the archive's reports/ folder. */
  file: string;
  /** The TPP report this workbook was exported from (index name). */
  tppReport: string;
  sourceHeading: string | null;
  use: TppArchiveUse;
}

export const report = (
  file: string,
  tppReport: string,
  reportId: string,
  sourceHeading: string | null,
  note?: string,
): TppArchiveWorkbook => ({
  file,
  tppReport,
  sourceHeading,
  use: note ? { kind: "report", reportId, note } : { kind: "report", reportId },
});

/** TPP could not export the whole cookbook at once, so it came by category. */
export const recipeSlice = (category: string): TppArchiveWorkbook => ({
  file: `company_wide/recipes_by_category/${category}.xlsx`,
  tppReport: "Menu Item Recipes",
  sourceHeading: "Recipe Yields:",
  use: {
    kind: "screen",
    route: "/kitchen/dishes",
    what: "Kitchen > Dishes, filtered to the category; each dish opens its recipe. One event's recipes print as the Menu Item Recipes report.",
  },
});
