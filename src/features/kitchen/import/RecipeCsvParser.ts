import { RecipeTextParser } from "./RecipeTextParser";
import type { ParsedRecipeDraft } from "./RecipeImportTypes";

export interface CsvParseError {
  file: string;
  row: number;
  message: string;
}

export interface CsvBundleParseResult {
  draft: ParsedRecipeDraft;
  errors: CsvParseError[];
  sourceKind: "csv_bundle";
}

const RECIPE_SHEET_HEADERS = [
  "recipe_name",
  "description",
  "category",
  "cuisine",
  "yield_quantity",
  "yield_unit",
  "batch_multiplier",
  "instructions",
];

const RECIPE_LINE_HEADERS = [
  "recipe_name",
  "source_order",
  "source_line",
  "quantity",
  "unit",
  "ingredient_name",
  "preparation_note",
];

/**
 * Deterministic CSV parser for paired recipe sheet and recipe line exports.
 */
export class RecipeCsvParser {
  private readonly textParser = new RecipeTextParser();

  parseBundle(
    sheetCsv: string,
    linesCsv: string,
    sheetFilename = "recipe_sheet.csv",
    linesFilename = "recipe_lines.csv",
  ): CsvBundleParseResult {
    const errors: CsvParseError[] = [];
    const sheetRows = this.parseRows(sheetCsv);
    const lineRows = this.parseRows(linesCsv);

    if (!this.headersMatch(sheetRows[0], RECIPE_SHEET_HEADERS)) {
      errors.push({
        file: sheetFilename,
        row: 1,
        message: "Unrecognized recipe sheet headers.",
      });
    }
    if (!this.headersMatch(lineRows[0], RECIPE_LINE_HEADERS)) {
      errors.push({
        file: linesFilename,
        row: 1,
        message: "Unrecognized recipe line headers.",
      });
    }
    if (errors.length) {
      return {
        draft: this.emptyDraft("Untitled import"),
        errors,
        sourceKind: "csv_bundle",
      };
    }

    const sheet = sheetRows[1];
    if (!sheet) {
      errors.push({
        file: sheetFilename,
        row: 2,
        message: "Recipe sheet is missing a data row.",
      });
      return {
        draft: this.emptyDraft("Untitled import"),
        errors,
        sourceKind: "csv_bundle",
      };
    }

    const recipeName = sheet[0]?.trim() || "Untitled recipe";
    const parsedLines = lineRows
      .slice(1)
      .map((row, index) => {
        const rowRecipe = row[0]?.trim();
        if (rowRecipe && rowRecipe !== recipeName) {
          errors.push({
            file: linesFilename,
            row: index + 2,
            message: `Line belongs to "${rowRecipe}" instead of "${recipeName}".`,
          });
          return null;
        }
        const raw =
          row[2]?.trim() ||
          [row[3], row[4], row[5]].filter(Boolean).join(" ").trim();
        if (!raw) return null;
        return this.textParser.parseIngredientLine(raw);
      })
      .filter((line): line is NonNullable<typeof line> => line != null);

    const yieldQuantity = Number(sheet[4]);
    const yieldUnit = this.textParser.mapUnitAlias(sheet[5] ?? "portion");
    const batchMultiplier = Number(sheet[6]);

    return {
      draft: {
        name: recipeName,
        description: sheet[1]?.trim() || undefined,
        category: sheet[2]?.trim() || undefined,
        cuisine: sheet[3]?.trim() || undefined,
        yieldQuantity:
          Number.isFinite(yieldQuantity) && yieldQuantity > 0
            ? yieldQuantity
            : 1,
        yieldUnit,
        batchMultiplier:
          Number.isFinite(batchMultiplier) && batchMultiplier > 0
            ? batchMultiplier
            : 1,
        instructions: sheet[7]?.trim() || undefined,
        lines: parsedLines,
        warnings: errors.map(
          (error) => `${error.file} row ${error.row}: ${error.message}`,
        ),
      },
      errors,
      sourceKind: "csv_bundle",
    };
  }

  parseTextFile(text: string, filename: string): ParsedRecipeDraft {
    const parsed = this.textParser.parse(text);
    if (filename) parsed.warnings.unshift(`Imported from ${filename}`);
    return parsed;
  }

  private emptyDraft(name: string): ParsedRecipeDraft {
    return {
      name,
      yieldQuantity: 1,
      yieldUnit: "portion",
      lines: [],
      warnings: [],
    };
  }

  private headersMatch(row: string[] | undefined, expected: string[]): boolean {
    if (!row) return false;
    return expected.every(
      (header, index) => row[index]?.trim().toLowerCase() === header,
    );
  }

  private parseRows(csv: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let cell = "";
    let inQuotes = false;

    const pushCell = () => {
      row.push(cell);
      cell = "";
    };
    const pushRow = () => {
      if (row.length || cell.length) {
        pushCell();
        rows.push(row);
      }
      row = [];
    };

    const normalized = csv.replace(/\r\n/g, "\n");
    for (let index = 0; index < normalized.length; index += 1) {
      const char = normalized[index];
      if (char === '"') {
        if (inQuotes && normalized[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }
      if (!inQuotes && char === ",") {
        pushCell();
        continue;
      }
      if (!inQuotes && char === "\n") {
        pushRow();
        continue;
      }
      cell += char;
    }
    pushRow();
    return rows;
  }
}
