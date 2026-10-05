import {
  formatMinutes,
  serviceStyleForSheetKey,
  type ServiceStyleOption,
} from "../stylePackaging";
import { ComponentCsvParser } from "./ComponentCsvParser";
import { ComponentTextParser } from "./ComponentTextParser";
import type {
  ParsedComponentDraft,
  ParsedIngredientLine,
} from "./ComponentImportTypes";

/**
 * The owner's one-file recipe sheet (recipe_sheet.csv, Ryan 2026-10-04):
 * three columns "section,key,value" with recipe_info, allergen, equipment,
 * ingredient, instruction and packaging rows.
 */
export interface RecipeSheetExtras {
  activePrepMinutes: number | null;
  passiveCookMinutes: number | null;
  /** Allergen codes Capsule uses (milk, wheat, …). */
  allergens: string[];
  equipment: string[];
  steps: string[];
  /** Sheet packaging key (drop_off, bring_hot, cook_on_site) and its words. */
  packaging: { key: string; instructions: string }[];
}

const ALLERGEN_CODES: Record<string, string> = {
  dairy: "milk",
  milk: "milk",
  egg: "eggs",
  eggs: "eggs",
  wheat: "wheat",
  wheat_gluten: "wheat",
  gluten: "wheat",
  soy: "soybeans",
  soybeans: "soybeans",
  peanut: "peanuts",
  peanuts: "peanuts",
  tree_nut: "tree_nuts",
  tree_nuts: "tree_nuts",
  fish: "fish",
  shellfish: "crustacean_shellfish",
  crustacean_shellfish: "crustacean_shellfish",
  sesame: "sesame",
};

const csv = new ComponentCsvParser();
const text = new ComponentTextParser();

const clean = (value: string | undefined) =>
  (value ?? "").replace(/^﻿/, "").trim();

/** Words written all in capitals read as Title Case; anything else stays. */
const readable = (value: string) =>
  value && value === value.toUpperCase() && /[A-Z]/.test(value)
    ? value
        .toLowerCase()
        .replace(
          /(^|[\s(/-])([a-z])/g,
          (_, lead, ch) => lead + ch.toUpperCase(),
        )
    : value;

/** True when the text is the one-file recipe sheet (first row section,key,value). */
export function isRecipeSheet(source: string | undefined | null): boolean {
  if (!source) return false;
  const first = csv.parseRows(source.replace(/^﻿/, ""))[0];
  return (
    first != null &&
    first.map((cell) => clean(cell).toLowerCase()).join(",") ===
      "section,key,value"
  );
}

/** "1 HOUR 20 MINUTES", "20 MINUTES", "1.5 hours", "45" → minutes. */
export function sheetMinutes(value: string): number | null {
  const words = value.toLowerCase().trim();
  if (!words) return null;
  if (/^\d+(\.\d+)?$/.test(words)) return Math.round(Number(words));
  let total = 0;
  let found = false;
  for (const match of words.matchAll(
    /(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m)\b/g,
  )) {
    found = true;
    const amount = Number(match[1]);
    total += match[2].startsWith("h") ? amount * 60 : amount;
  }
  return found ? Math.round(total) : null;
}

function ingredientLine(
  name: string,
  amount: string,
): ParsedIngredientLine | null {
  // "6 #10 CANS": six #10 cans, not six pounds (the "#" means can size here).
  const can = amount.match(/^(\S+)\s+#(\d+)\s+cans?$/i);
  const raw = can ? `${can[1]} can ${name}` : `${amount} ${name}`;
  const line = text.parseIngredientLine(raw.trim());
  if (!line) return null;
  const note = can ? `#${can[2]} cans` : undefined;
  return {
    ...line,
    raw: `${amount} ${name}`.trim(),
    prepNotes: [line.prepNotes, note].filter(Boolean).join("; ") || undefined,
  };
}

/** What the import saves with the recipe; packaging keys become service styles. */
export function recipeSheetSave(
  source: string | undefined | null,
  styles: readonly ServiceStyleOption[] | undefined,
) {
  if (!source || !isRecipeSheet(source)) return null;
  const { extras } = parseRecipeSheet(source);
  const packaging: { serviceStyleId: string; instructions: string }[] = [];
  const styleNames: string[] = [];
  const unmatched: string[] = [];
  for (const line of extras.packaging) {
    const style = serviceStyleForSheetKey(line.key, styles);
    if (!style) unmatched.push(line.key);
    else if (!packaging.some((p) => p.serviceStyleId === style._id)) {
      packaging.push({
        serviceStyleId: style._id,
        instructions: line.instructions,
      });
      styleNames.push(style.name);
    }
  }
  const notes: string[] = [];
  const times = [
    extras.activePrepMinutes != null
      ? `hands-on ${formatMinutes(extras.activePrepMinutes)}`
      : null,
    extras.passiveCookMinutes != null
      ? `unattended ${formatMinutes(extras.passiveCookMinutes)}`
      : null,
  ].filter(Boolean);
  if (times.length) notes.push(`Times: ${times.join(", ")}.`);
  if (extras.allergens.length)
    notes.push(`Allergens marked: ${extras.allergens.join(", ")}.`);
  if (extras.equipment.length)
    notes.push(`Equipment: ${extras.equipment.join(", ")}.`);
  if (extras.steps.length) notes.push(`${extras.steps.length} numbered steps.`);
  if (styleNames.length) notes.push(`Packaging for ${styleNames.join(", ")}.`);
  for (const key of unmatched) {
    notes.push(
      `Packaging "${key}" matches no service style here, so it will be left out. Add the service style on the Catalogs page first to keep it.`,
    );
  }
  return {
    sheet: {
      activePrepMinutes: extras.activePrepMinutes ?? undefined,
      passiveCookMinutes: extras.passiveCookMinutes ?? undefined,
      allergens: extras.allergens,
      equipment: extras.equipment,
      steps: extras.steps,
      packaging,
    },
    notes,
  };
}

/** Read the sheet into a review draft plus the facts the review does not hold. */
export function parseRecipeSheet(
  source: string,
  filename?: string,
): { draft: ParsedComponentDraft; extras: RecipeSheetExtras } {
  const rows = csv.parseRows(source.replace(/^﻿/, "")).slice(1);
  const info = new Map<string, string>();
  const extras: RecipeSheetExtras = {
    activePrepMinutes: null,
    passiveCookMinutes: null,
    allergens: [],
    equipment: [],
    steps: [],
    packaging: [],
  };
  const lines: ParsedIngredientLine[] = [];
  const steps: { order: number; at: number; text: string }[] = [];
  const warnings: string[] = filename ? [`Imported from ${filename}`] : [];

  rows.forEach((row, at) => {
    const section = clean(row[0]).toLowerCase();
    const key = clean(row[1]);
    const value = clean(row[2]);
    if (section === "recipe_info") info.set(key.toLowerCase(), value);
    else if (section === "allergen") {
      if (!value || /^(no|n|0|false|-)$/i.test(value)) return;
      const code = ALLERGEN_CODES[key.toLowerCase()];
      if (code) {
        if (!extras.allergens.includes(code)) extras.allergens.push(code);
      } else
        warnings.push(
          `Allergen "${key}" is not one Capsule tracks; it was left out.`,
        );
    } else if (section === "equipment") {
      const name = readable(value || key);
      if (name) extras.equipment.push(name);
    } else if (section === "ingredient") {
      if (!key) return;
      const line = ingredientLine(key, value);
      if (line) lines.push(line);
    } else if (section === "instruction") {
      if (!value) return;
      const order = Number(key);
      steps.push({
        order: Number.isFinite(order) ? order : at,
        at,
        text: value,
      });
    } else if (section === "packaging") {
      if (key && value) extras.packaging.push({ key, instructions: value });
    }
  });
  extras.steps = steps
    .sort((a, b) => a.order - b.order || a.at - b.at)
    .map((step) => step.text);
  extras.activePrepMinutes = sheetMinutes(info.get("active_prep_time") ?? "");
  extras.passiveCookMinutes = sheetMinutes(info.get("passive_cook_time") ?? "");

  const yieldLine = info.get("yield_total")
    ? text.parseIngredientLine(`${info.get("yield_total")} batch`)
    : null;
  const version = info.get("version");
  return {
    draft: {
      name: readable(info.get("recipe_name") ?? "") || "Untitled recipe",
      description: version ? `Recipe sheet version ${version}` : undefined,
      yieldQuantity: yieldLine?.quantity ?? null,
      yieldUnit: yieldLine?.unit ?? null,
      instructions: extras.steps.join("\n") || undefined,
      lines,
      warnings,
    },
    extras,
  };
}
