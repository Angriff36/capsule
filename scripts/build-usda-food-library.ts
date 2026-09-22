/**
 * Build Capsule's shared ingredient library from the USDA FoodData Central
 * downloads (public domain): SR Legacy (≈7,800 generic foods) plus Foundation
 * Foods (newer measurements for a few hundred of them).
 *
 *   bun scripts/build-usda-food-library.ts [--src .artifacts/usda] [--out .artifacts/usda/library.json]
 *
 * One record per food: id, name, USDA food group, nutrition per 100 g (the
 * nine nutrients Capsule stores), and the household portions USDA measured
 * ("1 cup = 125 g", "1 medium = 110 g"), which is what turns a recipe line
 * written by volume or count into grams. Nothing is invented: a food with no
 * measured portion carries none.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

const argv = process.argv.slice(2);
const opt = (name: string, fallback: string) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1]! : fallback;
};
const SRC = resolve(process.cwd(), opt("--src", ".artifacts/usda"));
const OUT = resolve(
  process.cwd(),
  opt("--out", ".artifacts/usda/library.json"),
);

/** USDA nutrient ids → Capsule fields (same map as convex/lib/fdcNutrientMapper.ts). */
const NUTRIENT_IDS: Record<string, keyof LibraryNutrition> = {
  "1008": "calories",
  "1003": "protein",
  "1004": "fat",
  "1005": "carbs",
  "1079": "fiber",
  "2000": "sugar",
  "1093": "sodium",
  "1087": "calcium",
  "1089": "iron",
};
const ENERGY_FALLBACKS = ["2047", "2048"];

export interface LibraryNutrition {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  fiber: number;
  sugar: number;
  sodium: number;
  calcium: number;
  iron: number;
}
export interface LibraryPortion {
  amount: number;
  unit: string;
  modifier: string;
  grams: number;
}
export interface LibraryFood {
  id: string;
  source: "sr_legacy" | "foundation";
  name: string;
  group: string;
  per100g: LibraryNutrition;
  portions: LibraryPortion[];
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") cell += ch;
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function table(dir: string, name: string): Record<string, string>[] {
  const path = join(dir, `${name}.csv`);
  if (!existsSync(path)) return [];
  const rows = parseCsv(readFileSync(path, "utf8"));
  const header = rows[0]!;
  return rows
    .slice(1)
    .filter((r) => r.length >= header.length)
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

function findDataDir(root: string, marker: string): string | null {
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    if (existsSync(join(dir, "food.csv")) && basename(dir).includes(marker))
      return dir;
    for (const entry of readdirSafe(dir)) {
      const full = join(dir, entry);
      if (isDir(full)) stack.push(full);
    }
  }
  return null;
}
import { readdirSync, statSync } from "node:fs";
const readdirSafe = (d: string) => {
  try {
    return readdirSync(d);
  } catch {
    return [];
  }
};
const isDir = (p: string) => {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
};

function loadSet(dir: string, source: LibraryFood["source"]): LibraryFood[] {
  const foods = table(dir, "food").filter((f) =>
    source === "sr_legacy"
      ? f.data_type === "sr_legacy_food"
      : f.data_type === "foundation_food",
  );
  const groups = new Map(
    table(dir, "food_category").map((c) => [c.id, c.description]),
  );
  const units = new Map(table(dir, "measure_unit").map((u) => [u.id, u.name]));
  const nutrition = new Map<
    string,
    LibraryNutrition & { energyFallback?: number }
  >();
  for (const n of table(dir, "food_nutrient")) {
    const field = NUTRIENT_IDS[n.nutrient_id];
    const amount = Number(n.amount);
    if (!Number.isFinite(amount)) continue;
    const rec = nutrition.get(n.fdc_id) ?? {
      calories: 0,
      protein: 0,
      fat: 0,
      carbs: 0,
      fiber: 0,
      sugar: 0,
      sodium: 0,
      calcium: 0,
      iron: 0,
    };
    if (field) rec[field] = amount;
    else if (
      ENERGY_FALLBACKS.includes(n.nutrient_id) &&
      rec.energyFallback === undefined
    )
      rec.energyFallback = amount;
    nutrition.set(n.fdc_id, rec);
  }
  const portions = new Map<string, LibraryPortion[]>();
  for (const p of table(dir, "food_portion")) {
    const grams = Number(p.gram_weight);
    const amount = Number(p.amount);
    if (!Number.isFinite(grams) || grams <= 0) continue;
    // SR Legacy files most household measures under the "undetermined" unit
    // with the measure in the modifier ("cup", "tbsp", "medium (2-1/2\" dia)").
    const rawUnit = (units.get(p.measure_unit_id) ?? "").trim();
    const modifier = (p.modifier || p.portion_description || "").trim();
    const unit =
      rawUnit && rawUnit !== "undetermined"
        ? rawUnit
        : modifier.split(/[,(]/)[0]!.trim();
    if (!unit) continue;
    const list = portions.get(p.fdc_id) ?? [];
    list.push({
      amount: Number.isFinite(amount) && amount > 0 ? amount : 1,
      unit,
      modifier,
      grams,
    });
    portions.set(p.fdc_id, list);
  }
  return foods.map((f) => {
    const rec = nutrition.get(f.fdc_id);
    const per100g: LibraryNutrition = rec
      ? {
          calories: rec.calories || rec.energyFallback || 0,
          protein: rec.protein,
          fat: rec.fat,
          carbs: rec.carbs,
          fiber: rec.fiber,
          sugar: rec.sugar,
          sodium: rec.sodium,
          calcium: rec.calcium,
          iron: rec.iron,
        }
      : {
          calories: 0,
          protein: 0,
          fat: 0,
          carbs: 0,
          fiber: 0,
          sugar: 0,
          sodium: 0,
          calcium: 0,
          iron: 0,
        };
    return {
      id: f.fdc_id,
      source,
      name: f.description.trim(),
      group: groups.get(f.food_category_id) ?? "",
      per100g,
      portions: portions.get(f.fdc_id) ?? [],
    };
  });
}

const srDir = findDataDir(SRC, "sr_legacy");
const fdDir = findDataDir(SRC, "foundation");
if (!srDir) {
  console.error(`SR Legacy CSVs not found under ${SRC}`);
  process.exit(2);
}
const sr = loadSet(srDir, "sr_legacy");
const fd = fdDir ? loadSet(fdDir, "foundation") : [];
// A Foundation food with the same name replaces the older SR Legacy record.
const byName = new Map<string, LibraryFood>();
for (const food of sr) byName.set(food.name.toLowerCase(), food);
let replaced = 0;
for (const food of fd) {
  const older = byName.get(food.name.toLowerCase());
  if (older) replaced += 1;
  // Foundation measured fewer household portions; keep SR Legacy's when
  // the newer record has none.
  byName.set(food.name.toLowerCase(), {
    ...food,
    portions: food.portions.length ? food.portions : (older?.portions ?? []),
  });
}
const library = [...byName.values()].sort((a, b) =>
  a.name.localeCompare(b.name),
);
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(library));
const withPortions = library.filter((f) => f.portions.length > 0).length;
console.log(
  JSON.stringify(
    {
      srLegacy: sr.length,
      foundation: fd.length,
      replacedByFoundation: replaced,
      foods: library.length,
      withPortions,
      withCalories: library.filter((f) => f.per100g.calories > 0).length,
      bytes: statSync(OUT).size,
      out: OUT,
    },
    null,
    2,
  ),
);
