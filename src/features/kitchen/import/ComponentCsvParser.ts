import { ComponentTextParser } from "./ComponentTextParser";
import type { ParsedComponentDraft } from "./ComponentImportTypes";

export interface CsvParseError {
  file: string;
  row: number;
  message: string;
}

export interface CsvBundleParseResult {
  draft: ParsedComponentDraft;
  errors: CsvParseError[];
  sourceKind: "csv_bundle";
}

const COMPONENT_SHEET_HEADERS = [
  "component_name",
  "description",
  "category",
  "cuisine",
  "yield_quantity",
  "yield_unit",
  "batch_multiplier",
  "instructions",
];

const COMPONENT_LINE_HEADERS = [
  "component_name",
  "source_order",
  "source_line",
  "quantity",
  "unit",
  "ingredient_name",
  "preparation_note",
];

/**
 * Deterministic CSV parser for paired component sheet and component line exports.
 */
export class ComponentCsvParser {
  private readonly textParser = new ComponentTextParser();

  parseBundle(
    sheetCsv: string,
    linesCsv: string,
    sheetFilename = "component_sheet.csv",
    linesFilename = "component_lines.csv",
  ): CsvBundleParseResult {
    const errors: CsvParseError[] = [];
    const sheetRows = this.parseRows(sheetCsv);
    const lineRows = this.parseRows(linesCsv);

    if (!this.headersMatch(sheetRows[0], COMPONENT_SHEET_HEADERS)) {
      errors.push({
        file: sheetFilename,
        row: 1,
        message: "Unrecognized component sheet headers.",
      });
    }
    if (!this.headersMatch(lineRows[0], COMPONENT_LINE_HEADERS)) {
      errors.push({
        file: linesFilename,
        row: 1,
        message: "Unrecognized component line headers.",
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
        message: "Component sheet is missing a data row.",
      });
      return {
        draft: this.emptyDraft("Untitled import"),
        errors,
        sourceKind: "csv_bundle",
      };
    }

    const componentName = sheet[0]?.trim() || "Untitled component";
    const parsedLines = lineRows
      .slice(1)
      .map((row, index) => {
        const rowComponent = row[0]?.trim();
        if (rowComponent && rowComponent !== componentName) {
          errors.push({
            file: linesFilename,
            row: index + 2,
            message: `Line belongs to "${rowComponent}" instead of "${componentName}".`,
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
        name: componentName,
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

  parseTextFile(text: string, filename: string): ParsedComponentDraft {
    const parsed = this.textParser.parse(text);
    if (filename) parsed.warnings.unshift(`Imported from ${filename}`);
    return parsed;
  }

  private emptyDraft(name: string): ParsedComponentDraft {
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
