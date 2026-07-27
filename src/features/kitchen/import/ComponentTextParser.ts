import { UnitOfMeasureMapper, type UnitOfMeasure } from "./UnitOfMeasureMapper";
import type {
  ParsedIngredientLine,
  ParsedComponentDraft,
} from "./ComponentImportTypes";

const FRACTIONS: Record<string, number> = {
  "½": 0.5,
  "¼": 0.25,
  "¾": 0.75,
  "⅓": 1 / 3,
  "⅔": 2 / 3,
  "⅛": 0.125,
  "⅜": 0.375,
  "⅝": 0.625,
  "⅞": 0.875,
};

const QUANTITY_TOKEN =
  "(?:(?:\\d+\\s+)?\\d+\\/\\d+|\\d+(?:\\.\\d+)?|[½¼¾⅓⅔⅛⅜⅝⅞])";

/**
 * Deterministic plain-text component parser for the culinary import workbench.
 * Does not invent Manifest entities — only structures text for createVia review.
 */
export class ComponentTextParser {
  private readonly units = new UnitOfMeasureMapper();

  mapUnitAlias(raw: string | undefined | null): UnitOfMeasure {
    if (String(raw ?? "").trim() === "#") return "pound";
    return this.units.map(raw);
  }

  parse(source: string): ParsedComponentDraft {
    const text = source.replace(/\r\n/g, "\n").trim();
    const warnings: string[] = [];
    if (!text) {
      return {
        name: "Untitled component",
        yieldQuantity: 1,
        yieldUnit: "portion",
        lines: [],
        warnings: ["Paste a component to begin."],
      };
    }

    const lines = text.split("\n").map((line) => line.trim());
    const name = this.extractName(lines);
    const description = this.extractDescription(lines, name);
    const { yieldQuantity, yieldUnit } = this.extractYield(text, warnings);
    const ingredientLines = this.extractIngredientBlock(lines);
    const instructions = this.extractInstructions(lines);
    const parsedLines = ingredientLines
      .map((raw) => this.parseIngredientLine(raw))
      .filter((line): line is ParsedIngredientLine => line != null);

    if (parsedLines.length === 0) {
      warnings.push(
        "No ingredient lines detected. Add an Ingredients section.",
      );
    }

    return {
      name,
      description,
      yieldQuantity,
      yieldUnit,
      instructions,
      lines: parsedLines,
      warnings,
    };
  }

  private extractName(lines: string[]): string {
    const first = lines.find(
      (line) => line.length > 0 && !this.isSectionHeader(line),
    );
    return first?.replace(/^#+\s*/, "").trim() || "Untitled component";
  }

  private extractDescription(
    lines: string[],
    name: string,
  ): string | undefined {
    const body: string[] = [];
    let started = false;
    for (const line of lines) {
      if (!started) {
        if (line === name || line.replace(/^#+\s*/, "") === name) {
          started = true;
        }
        continue;
      }
      if (!line) {
        if (body.length) break;
        continue;
      }
      if (this.isSectionHeader(line) || this.looksLikeIngredient(line)) break;
      if (
        /^(yields?|makes|serves|servings|prep|preparation|cook)\b/i.test(line)
      ) {
        break;
      }
      body.push(line);
    }
    const description = body.join(" ").trim();
    return description || undefined;
  }

  private extractYield(
    text: string,
    warnings: string[],
  ): { yieldQuantity: number; yieldUnit: UnitOfMeasure } {
    const poundYield =
      text.match(
        new RegExp(
          `\\b(?:yields?|makes)\\s*[:\\-]?\\s*(${QUANTITY_TOKEN})\\s*#`,
          "iu",
        ),
      ) ??
      text.match(
        new RegExp(`\\b(${QUANTITY_TOKEN})\\s*#\\s*(?:raw\\s+weight)?`, "iu"),
      );
    if (poundYield) {
      const quantity = this.parseQuantity(poundYield[1]);
      return {
        yieldQuantity: quantity > 0 ? quantity : 1,
        yieldUnit: "pound",
      };
    }

    const match =
      text.match(
        new RegExp(
          `\\b(?:yields?|makes|serves|servings)\\s*[:\\-]?\\s*(${QUANTITY_TOKEN})\\s*([A-Za-z#]+)?`,
          "iu",
        ),
      ) ??
      text.match(
        new RegExp(
          `\\b(${QUANTITY_TOKEN})\\s*(servings?|portions?|quarts?|qts?|gallons?|gals?|cups?|pints?|pts?|pounds?|lbs?)\\b`,
          "iu",
        ),
      );
    if (!match) {
      warnings.push("Yield not found; defaulting to 1 portion.");
      return { yieldQuantity: 1, yieldUnit: "portion" };
    }
    const quantity = this.parseQuantity(match[1]);
    const unit = this.mapUnitAlias(match[2] ?? "portion");
    return {
      yieldQuantity: quantity > 0 ? quantity : 1,
      yieldUnit: unit,
    };
  }

  private extractIngredientBlock(lines: string[]): string[] {
    const start = lines.findIndex((line) =>
      /^(ingredients?|components?)\s*:?\s*$/i.test(line),
    );
    if (start < 0) {
      return lines.filter((line) => this.looksLikeIngredient(line));
    }
    const block: string[] = [];
    for (let i = start + 1; i < lines.length; i += 1) {
      const line = lines[i];
      if (!line) {
        if (block.length) break;
        continue;
      }
      if (this.isInstructionSectionHeader(line)) break;
      if (this.isMethodStepLine(line)) break;
      if (this.isSectionHeader(line) && !this.looksLikeIngredient(line)) break;
      block.push(line.replace(/^[-*•]\s*/, "").trim());
    }
    return block.filter(Boolean);
  }

  private extractInstructions(lines: string[]): string | undefined {
    const start = lines.findIndex((line) =>
      this.isInstructionSectionHeader(line),
    );
    if (start >= 0) {
      const body = lines
        .slice(start + 1)
        .filter((line) => line.length > 0)
        .join("\n")
        .trim();
      return body || undefined;
    }

    // Components that omit METHOD but append numbered steps after ingredients.
    const ingredientStart = lines.findIndex((line) =>
      /^(ingredients?|components?)\s*:?\s*$/i.test(line),
    );
    if (ingredientStart < 0) return undefined;
    let stepStart = -1;
    for (let i = ingredientStart + 1; i < lines.length; i += 1) {
      if (this.isMethodStepLine(lines[i])) {
        stepStart = i;
        break;
      }
    }
    if (stepStart < 0) return undefined;
    return lines
      .slice(stepStart)
      .filter((line) => line.length > 0)
      .join("\n")
      .trim();
  }

  parseIngredientLine(raw: string): ParsedIngredientLine | null {
    const cleaned = raw.replace(/^[-*•]\s*/, "").trim();
    if (!cleaned || this.isSectionHeader(cleaned)) return null;
    if (this.isMethodStepLine(cleaned)) return null;

    const poundMatch = cleaned.match(
      new RegExp(`^(${QUANTITY_TOKEN})\\s*#\\s*(.+)$`, "u"),
    );
    if (poundMatch) {
      const quantity = this.parseQuantity(poundMatch[1]);
      const { name, prepNotes } = this.splitNameAndNotes(poundMatch[2].trim());
      if (!name) return null;
      return {
        raw: cleaned,
        name,
        quantity: quantity > 0 ? quantity : 1,
        unit: "pound",
        unitRaw: "#",
        prepNotes,
      };
    }

    const quantityMatch = cleaned.match(
      new RegExp(`^(${QUANTITY_TOKEN})\\s+(.+)$`, "u"),
    );
    if (!quantityMatch) {
      return {
        raw: cleaned,
        name: this.titleCase(cleaned),
        quantity: 1,
        unit: "each",
        unitRaw: "each",
      };
    }

    const quantity = this.parseQuantity(quantityMatch[1]);
    let rest = quantityMatch[2].trim();
    let unitRaw = "each";
    let unit: UnitOfMeasure = "each";

    const unitMatch = rest.match(
      /^([#A-Za-z½¼¾]+)\b(?:\s*\(([^)]+)\))?\s+(.*)$/u,
    );
    if (
      unitMatch &&
      (unitMatch[1] === "#" || this.units.isKnownAlias(unitMatch[1]))
    ) {
      unitRaw = unitMatch[1];
      unit = this.mapUnitAlias(unitMatch[1]);
      const parenthetical = unitMatch[2]?.trim();
      rest = unitMatch[3].trim();
      if (parenthetical) {
        rest = `${rest}, ${parenthetical}`.replace(/^,\s*/, "");
      }
    }

    const { name, prepNotes } = this.splitNameAndNotes(rest);
    if (!name) return null;

    return {
      raw: cleaned,
      name,
      quantity: quantity > 0 ? quantity : 1,
      unit,
      unitRaw,
      prepNotes,
    };
  }

  /**
   * Numbered/lettered procedure lines ("1. Blend…", "2) Heat…", "a. Pulse…").
   * Culinary ingredient lines use "1 cup …" / "1/4 C …", never "1. …".
   */
  isMethodStepLine(line: string): boolean {
    const cleaned = line.replace(/^[-*•]\s*/, "").trim();
    if (/^\d+[.)]\s+\S/.test(cleaned)) return true;
    if (/^[a-z][.)]\s+\S/i.test(cleaned)) return true;
    return false;
  }

  private splitNameAndNotes(rest: string): {
    name: string;
    prepNotes?: string;
  } {
    const comma = rest.indexOf(",");
    if (comma < 0) {
      return { name: this.titleCase(rest) };
    }
    const name = this.titleCase(rest.slice(0, comma).trim());
    const prepNotes = rest.slice(comma + 1).trim() || undefined;
    return { name, prepNotes };
  }

  private parseQuantity(raw: string): number {
    const token = raw.trim();
    if (FRACTIONS[token] != null) return FRACTIONS[token];
    const mixed = token.match(/^(\d+)\s+(\d+)\/(\d+)$/);
    if (mixed) {
      return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
    }
    const fraction = token.match(/^(\d+)\/(\d+)$/);
    if (fraction) {
      return Number(fraction[1]) / Number(fraction[2]);
    }
    const value = Number(token);
    return Number.isFinite(value) ? value : 1;
  }

  private looksLikeIngredient(line: string): boolean {
    const cleaned = line.replace(/^[-*•]\s*/, "").trim();
    if (this.isMethodStepLine(cleaned)) return false;
    if (this.isInstructionSectionHeader(cleaned)) return false;
    return new RegExp(`^(?:${QUANTITY_TOKEN}|#)`, "u").test(cleaned);
  }

  private isInstructionSectionHeader(line: string): boolean {
    return /^(instructions?|method|directions?|steps?|procedure)\s*:?\s*$/i.test(
      line,
    );
  }

  private isSectionHeader(line: string): boolean {
    return /^(ingredients?|components?|instructions?|method|directions?|steps?|procedure|yields?|makes|serves|servings|preparation|prep(?:\s*time)?|cook(?:\s*time)?)\b/i.test(
      line,
    );
  }

  private titleCase(value: string): string {
    return value
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(" ");
  }
}
