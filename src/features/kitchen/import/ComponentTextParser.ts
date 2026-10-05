import { UnitOfMeasureMapper, type UnitOfMeasure } from "./UnitOfMeasureMapper";
import {
  isMissingQuantity,
  type ParsedIngredientLine,
  type ParsedComponentDraft,
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

// "1½" / "1 ½" (whole number + fraction glyph) comes first so the glyph is
// never read as the start of the unit or the name.
const QUANTITY_TOKEN =
  "(?:\\d+\\s*[½¼¾⅓⅔⅛⅜⅝⅞]|(?:\\d+\\s+)?\\d+\\/\\d+|\\d+(?:\\.\\d+)?|[½¼¾⅓⅔⅛⅜⅝⅞])";

/** "fl oz", "fl. oz.", "floz", "fluid ounce(s)": volume, never the mass ounce. */
const FLUID_OUNCE_UNIT = /^(fl\.?\s*oz|fluid\s+ounces?)\.?\s+(.+)$/iu;

const SUBRECIPE_PREFIX = /^(?:sub[\s-]?recipe|recipe)\s*:\s*/i;
const SUBRECIPE_MARK =
  /\s*(?:\((?:see\s+)?(?:sub[\s-]?)?recipe\)|[-–—]\s*see\s+recipe|\bsee\s+recipe\b)\s*/i;

/**
 * Kitchens mark a line that is another recipe: "Sub-recipe: 2 qt alfredo",
 * "2 qt alfredo (see recipe)", "alfredo - see recipe". Returns the line
 * without the marker and whether one was found.
 */
export function stripSubrecipeMarker(line: string): {
  text: string;
  hint: boolean;
} {
  let text = line.trim();
  let hint = false;
  if (SUBRECIPE_PREFIX.test(text)) {
    text = text.replace(SUBRECIPE_PREFIX, "");
    hint = true;
  }
  if (SUBRECIPE_MARK.test(text)) {
    text = text.replace(SUBRECIPE_MARK, " ").replace(/\s+/g, " ").trim();
    hint = true;
  }
  return { text, hint };
}

/**
 * Deterministic plain-text component parser for the culinary import workbench.
 * Does not invent Manifest entities — only structures text for createVia review.
 */
export class ComponentTextParser {
  private readonly units = new UnitOfMeasureMapper();

  /**
   * Strict unit resolution for import parsing: "#" is catering pound
   * notation; anything unrecognized stays null so review must correct it.
   */
  mapUnitAlias(raw: string | undefined | null): UnitOfMeasure | null {
    const token = String(raw ?? "").trim();
    if (token === "#") return "pound";
    return this.units.resolve(token);
  }

  parse(source: string): ParsedComponentDraft {
    const text = source.replace(/\r\n/g, "\n").trim();
    const warnings: string[] = [];
    if (!text) {
      return {
        name: "Untitled recipe",
        yieldQuantity: null,
        yieldUnit: null,
        lines: [],
        warnings: ["Paste a recipe to begin."],
      };
    }

    const lines = text.split("\n").map((line) => line.trim());
    const name = this.extractName(lines);
    const description = this.extractDescription(lines, name);
    const { yieldQuantity, yieldUnit } = this.extractYield(
      lines.filter((line) => !/^\W*per\b/i.test(line)).join("\n"),
      this.headerText(lines),
      warnings,
    );
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

  /**
   * A bare amount with no "yields"/"makes" word counts as the yield only above
   * the ingredients: "3 POUNDS FRESH BASIL" is an ingredient, never the batch
   * size, and a "*PER 5 POUNDS CHICKEN*" note says what the batch is for, not
   * what it makes.
   */
  private headerText(lines: string[]): string {
    const header: string[] = [];
    for (const line of lines) {
      if (
        /^(ingredients?|components?)\s*:?\s*$/i.test(line) ||
        this.isInstructionSectionHeader(line) ||
        this.looksLikeIngredient(line) ||
        this.isMethodStepLine(line)
      ) {
        break;
      }
      if (/^\W*per\b/i.test(line)) continue;
      header.push(line);
    }
    return header.join("\n");
  }

  private extractYield(
    text: string,
    header: string,
    warnings: string[],
  ): { yieldQuantity: number | null; yieldUnit: UnitOfMeasure | null } {
    const poundYield =
      text.match(
        new RegExp(
          `\\b(?:yields?|makes)\\s*[:\\-]?\\s*(${QUANTITY_TOKEN})\\s*#`,
          "iu",
        ),
      ) ??
      header.match(
        new RegExp(`\\b(${QUANTITY_TOKEN})\\s*#\\s*(?:raw\\s+weight)?`, "iu"),
      );
    if (poundYield) {
      const quantity = this.parseQuantity(poundYield[1]);
      if (isMissingQuantity(quantity)) {
        warnings.push(
          "Yield amount is not a positive number. Correct it before saving.",
        );
      }
      return {
        yieldQuantity: isMissingQuantity(quantity) ? null : quantity,
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
      header.match(
        new RegExp(
          `\\b(${QUANTITY_TOKEN})\\s*(servings?|portions?|quarts?|qts?|gallons?|gals?|cups?|pints?|pts?|pounds?|lbs?)\\b`,
          "iu",
        ),
      );
    if (!match) {
      warnings.push("Yield not found. Enter the yield before saving.");
      return { yieldQuantity: null, yieldUnit: null };
    }
    const quantity = this.parseQuantity(match[1]);
    if (isMissingQuantity(quantity)) {
      warnings.push(
        "Yield amount is not a positive number. Correct it before saving.",
      );
    }
    const rawUnit = match[2]?.trim();
    if (!rawUnit) {
      warnings.push("Yield has no unit. Choose the yield unit.");
      return {
        yieldQuantity: isMissingQuantity(quantity) ? null : quantity,
        yieldUnit: null,
      };
    }
    const unit = this.mapUnitAlias(rawUnit);
    if (!unit) {
      warnings.push(
        `Yield unit “${rawUnit}” is not recognized. Choose the correct yield unit.`,
      );
    }
    return {
      yieldQuantity: isMissingQuantity(quantity) ? null : quantity,
      yieldUnit: unit,
    };
  }

  private extractIngredientBlock(lines: string[]): string[] {
    const start = lines.findIndex((line) =>
      /^(ingredients?|components?)\s*:?\s*$/i.test(line),
    );
    if (start < 0) return this.readUnheadedSheet(lines).ingredients;
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
    if (ingredientStart < 0) {
      const { steps } = this.readUnheadedSheet(lines);
      return steps.length ? steps.join("\n") : undefined;
    }
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

  /**
   * Kitchen recipe sheets often have no headings: name, yield, measured lines,
   * then the steps. Some work in stages (two ingredients, "1. MELT BUTTER",
   * three more, "1. ADD TO ROUX"), so each stage restarts at 1; the steps keep
   * their order and are numbered straight through. "a. / b." sub-steps stay
   * under their step. Step text wrapped onto the next line ("... 1 ½ cup
   * mayonnaise, and" / "2 teaspoons pepper in bowl") stays with its step, never
   * an ingredient. Plain sentences wrapped over several lines become one step
   * per paragraph. An unmeasured line under an ingredient ("Salt and pepper")
   * is an ingredient with no amount; a "(FRESH)" line is that ingredient's note.
   */
  private readUnheadedSheet(lines: string[]): {
    ingredients: string[];
    steps: string[];
  } {
    const ingredients: string[] = [];
    const steps: string[] = [];
    const first = lines.findIndex(
      (line) => this.looksLikeIngredient(line) || this.isMethodStepLine(line),
    );
    if (first < 0) return { ingredients, steps };
    let stepNumber = 0;
    let previous: "blank" | "ingredient" | "step" | "prose" = "blank";
    let paragraph: string[] = [];
    const endParagraph = () => {
      if (paragraph.length) {
        stepNumber += 1;
        steps.push(`${stepNumber}. ${paragraph.join(" ")}`);
      }
      paragraph = [];
    };
    for (const line of lines.slice(first)) {
      if (!line) {
        endParagraph();
        previous = "blank";
      } else if (this.isMethodStepLine(line)) {
        endParagraph();
        const marker = line
          .replace(/^[-*•]\s*/, "")
          .match(/^(\d+|[a-z])[.)]+/i);
        const text = line
          .replace(/^[-*•]\s*/, "")
          .replace(/^(?:\d+|[a-z])[.)]+\s*/i, "");
        if (marker && /^[a-z]$/i.test(marker[1]) && stepNumber > 0) {
          steps.push(`   ${marker[1].toLowerCase()}. ${text}`);
        } else {
          stepNumber += 1;
          steps.push(`${stepNumber}. ${text}`);
        }
        previous = "step";
      } else if (previous === "step") {
        steps[steps.length - 1] += ` ${line}`;
      } else if (previous === "prose") {
        paragraph.push(line);
      } else if (this.looksLikeIngredient(line)) {
        ingredients.push(line);
        previous = "ingredient";
      } else if (previous === "ingredient" && this.isWrappedNote(line)) {
        ingredients[ingredients.length - 1] += `, ${line.slice(1, -1).trim()}`;
      } else if (previous === "ingredient") {
        ingredients.push(line);
      } else {
        paragraph.push(line);
        previous = "prose";
      }
    }
    endParagraph();
    return { ingredients, steps };
  }

  private isTeaspoonShorthand(unitMatch: RegExpMatchArray): boolean {
    return (
      /^tea$/i.test(unitMatch[1]) &&
      !unitMatch[2] &&
      !/^bags?\b/i.test(unitMatch[3].trim())
    );
  }

  private isWrappedNote(line: string): boolean {
    return /^\([^()]+\)$/.test(line.trim());
  }

  parseIngredientLine(raw: string): ParsedIngredientLine | null {
    const line = this.parseMeasuredLine(raw);
    if (!line) return null;
    const marked = stripSubrecipeMarker(line.raw);
    if (!marked.hint) return line;
    // Re-read the line without the marker so the name stays clean; the raw
    // text keeps the marker as the source wrote it.
    const unmarked = this.parseMeasuredLine(marked.text);
    return unmarked
      ? { ...unmarked, raw: line.raw, subrecipeHint: true }
      : { ...line, subrecipeHint: true };
  }

  private parseMeasuredLine(raw: string): ParsedIngredientLine | null {
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
        quantity: isMissingQuantity(quantity) ? null : quantity,
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
        quantity: null,
        unit: null,
        unitRaw: "",
      };
    }

    const quantity = this.parseQuantity(quantityMatch[1]);
    let rest = quantityMatch[2].trim();
    let unitRaw = "";
    let unit: UnitOfMeasure | null = null;

    const fluidOunce = rest.match(FLUID_OUNCE_UNIT);
    const unitMatch = fluidOunce
      ? null
      : rest.match(/^([#A-Za-z½¼¾]+)\b\.?(?:\s*\(([^)]+)\))?\s+(.*)$/u);
    if (fluidOunce) {
      unitRaw = fluidOunce[1];
      unit = "fluid_ounce";
      rest = fluidOunce[2].trim();
    } else if (unitMatch && this.isTeaspoonShorthand(unitMatch)) {
      // Kitchen sheets write "1 TEA SALT" for a teaspoon; "4 tea bags" stays tea.
      unitRaw = unitMatch[1];
      unit = "teaspoon";
      rest = unitMatch[3].trim();
    } else if (
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
    // "1/4 CUP CUPS WATER": the unit typed twice is still one unit.
    if (unit) {
      const repeated = rest.match(/^([A-Za-z]+)\s+(.+)$/);
      if (repeated && this.mapUnitAlias(repeated[1]) === unit) {
        rest = repeated[2].trim();
      }
    }

    const { name, prepNotes } = this.splitNameAndNotes(rest);
    if (!name) return null;

    return {
      raw: cleaned,
      name,
      quantity: isMissingQuantity(quantity) ? null : quantity,
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
    const glyph = token.match(/^(\d+)\s*([½¼¾⅓⅔⅛⅜⅝⅞])$/u);
    if (glyph) return Number(glyph[1]) + FRACTIONS[glyph[2]];
    const mixed = token.match(/^(\d+)\s+(\d+)\/(\d+)$/);
    if (mixed) {
      return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
    }
    const fraction = token.match(/^(\d+)\/(\d+)$/);
    if (fraction) {
      return Number(fraction[1]) / Number(fraction[2]);
    }
    // A token that is not a real amount (for example "1/0") stays missing so
    // review asks for it; it never becomes one.
    return Number(token);
  }

  private looksLikeIngredient(line: string): boolean {
    const cleaned = stripSubrecipeMarker(line.replace(/^[-*•]\s*/, "")).text;
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
