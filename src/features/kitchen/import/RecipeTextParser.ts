import { UnitOfMeasureMapper, type UnitOfMeasure } from "./UnitOfMeasureMapper";
import type {
  ParsedIngredientLine,
  ParsedRecipeDraft,
} from "./RecipeImportTypes";

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

/**
 * Deterministic plain-text recipe parser for the culinary import workbench.
 * Does not invent Manifest entities — only structures text for createVia review.
 */
export class RecipeTextParser {
  private readonly units = new UnitOfMeasureMapper();

  parse(source: string): ParsedRecipeDraft {
    const text = source.replace(/\r\n/g, "\n").trim();
    const warnings: string[] = [];
    if (!text) {
      return {
        name: "Untitled recipe",
        yieldQuantity: 1,
        yieldUnit: "portion",
        lines: [],
        warnings: ["Paste a recipe to begin."],
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
    return first?.replace(/^#+\s*/, "").trim() || "Untitled recipe";
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
      if (/^(yield|serves|servings|prep|preparation|cook)\b/i.test(line)) break;
      body.push(line);
    }
    const description = body.join(" ").trim();
    return description || undefined;
  }

  private extractYield(
    text: string,
    warnings: string[],
  ): { yieldQuantity: number; yieldUnit: UnitOfMeasure } {
    const match =
      text.match(
        /\b(?:yield|serves|servings)\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*([a-zA-Z]+)?/i,
      ) ?? text.match(/\b(\d+(?:\.\d+)?)\s*(servings?|portions?)\b/i);
    if (!match) {
      warnings.push("Yield not found; defaulting to 1 portion.");
      return { yieldQuantity: 1, yieldUnit: "portion" };
    }
    const quantity = Number(match[1]);
    const unit = this.units.map(match[2] ?? "portion");
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
      if (this.isSectionHeader(line) && !this.looksLikeIngredient(line)) break;
      if (/^(instructions?|method|directions?|steps?)\s*:?\s*$/i.test(line)) {
        break;
      }
      block.push(line.replace(/^[-*•]\s*/, "").trim());
    }
    return block.filter(Boolean);
  }

  private extractInstructions(lines: string[]): string | undefined {
    const start = lines.findIndex((line) =>
      /^(instructions?|method|directions?|steps?)\s*:?\s*$/i.test(line),
    );
    if (start < 0) return undefined;
    const body = lines
      .slice(start + 1)
      .filter((line) => line.length > 0)
      .join("\n")
      .trim();
    return body || undefined;
  }

  parseIngredientLine(raw: string): ParsedIngredientLine | null {
    const cleaned = raw.replace(/^[-*•]\s*/, "").trim();
    if (!cleaned || this.isSectionHeader(cleaned)) return null;

    const quantityMatch = cleaned.match(
      /^((?:\d+\s+)?\d+\/\d+|\d+(?:\.\d+)?|[½¼¾⅓⅔⅛⅜⅝⅞])\s+(.+)$/u,
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
      /^([A-Za-z½¼¾]+)\b(?:\s*\(([^)]+)\))?\s+(.*)$/u,
    );
    if (unitMatch && this.units.isKnownAlias(unitMatch[1])) {
      unitRaw = unitMatch[1];
      unit = this.units.map(unitMatch[1]);
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
    return /^(?:\d+|½|¼|¾|⅓|⅔)/u.test(line.replace(/^[-*•]\s*/, ""));
  }

  private isSectionHeader(line: string): boolean {
    return /^(ingredients?|components?|instructions?|method|directions?|steps?|yield|serves|servings|preparation|prep(?:\s*time)?|cook(?:\s*time)?)\b/i.test(
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
