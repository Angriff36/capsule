/**
 * Match a tenant's ingredients to the shared USDA library and fill nutrition
 * and allergens from it (2026-09-22).
 *
 *   bun --env-file=.env.local scripts/match-ingredients-to-library.ts --url <convex url> [--dry-run] [--no-jev]
 *
 * Order of authority, per ingredient:
 *   1. a hand-kept synonym table for catering names USDA spells differently
 *      ("scallions" → "Onions, spring or scallions")
 *   2. deterministic name matching: every word of the ingredient name must
 *      appear in the USDA name, and the USDA name's first part must be covered
 *      by the ingredient name ("Onions, raw" for "Onion")
 *   3. Jev picks among the top candidates for what 1 and 2 leave; below 0.8
 *      confidence the ingredient is listed for a person, nothing is written
 *
 * Writes (with --apply, i.e. without --dry-run): Ingredient.setNutrition, scaled
 * from USDA's per-100 g values to the ingredient's own unit through USDA's
 * measured portions (1 cup = N g, 1 medium = N g), and Ingredient.classifyAllergens
 * for allergens that follow plainly from the USDA food group and name (milk from
 * dairy, eggs, fish, shellfish, tree nuts, peanuts, sesame, soy, wheat). Existing
 * values are kept; nothing is cleared.
 * Report: .artifacts/usda/match-report.json
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { CapsuleAgentAuthManager } from "../src/agent/CapsuleAgentAuthManager";
import { CatalogUnitGrams } from "../convex/lib/catalogUnitGrams";
import { scaleNutritionFromGramsToUnit } from "../convex/lib/nutritionUnitScaler";
import type { LibraryFood, LibraryPortion } from "./build-usda-food-library";

const argv = process.argv.slice(2);
const flag = (n: string) => argv.includes(n);
const opt = (n: string, fb = "") => {
  const i = argv.indexOf(n);
  return i >= 0 && argv[i + 1] && !argv[i + 1]!.startsWith("--")
    ? argv[i + 1]!
    : fb;
};
const DRY_RUN = flag("--dry-run");
const NO_JEV = flag("--no-jev");
const URL = opt("--url", process.env.CONVEX_URL ?? "");
const LIBRARY = resolve(
  process.cwd(),
  opt("--library", ".artifacts/usda/library.json"),
);
const REPORT = resolve(process.cwd(), ".artifacts/usda/match-report.json");
const JEV_BAR = 0.8;
const CUP_ML = 236.588;
const TBSP_ML = 14.787;
const TSP_ML = 4.929;
const FLOZ_ML = 29.574;

// ------------------------------------------------------------ names
const STOP = new Set([
  "and",
  "of",
  "the",
  "a",
  "or",
  "fresh",
  "organic",
  "with",
  "in",
  "for",
]);
const stem = (w: string) =>
  w.length > 4 && w.endsWith("ies")
    ? `${w.slice(0, -3)}y`
    : w.length > 3 && w.endsWith("es") && !w.endsWith("ses")
      ? w.slice(0, -2)
      : w.length > 3 && w.endsWith("s")
        ? w.slice(0, -1)
        : w;
const tokens = (s: string): string[] =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9%]+/g, " ")
    .split(" ")
    .filter((w) => w && !STOP.has(w))
    .map(stem);
const key = (s: string) => tokens(s).join(" ");
/** Words on the catering side that say how it is cut or bought, not what it is. */
const CATERING_NOISE = new Set([
  "shredded",
  "sliced",
  "diced",
  "chopped",
  "minced",
  "peeled",
  "julienne",
  "julianne",
  "portion",
  "spice",
  "spices",
  "seasoning",
  "dry",
  "raw",
  "whole",
  "large",
  "small",
  "medium",
  "jumbo",
  "extra",
  "choice",
  "select",
  "case",
  "bag",
  "box",
  "pack",
  "packet",
  "packets",
  "bulk",
  "ct",
  "lb",
  "oz",
  "each",
  "fl",
  "ref",
  "plastic",
]);
const cleanName = (s: string) =>
  s
    .replace(/\*+/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\|[^|]*\|/g, " ")
    .replace(/\d+(\.\d+)?\s*(oz|lb|ct|"|in|inch|g|kg|ml|l)/gi, " ")
    .replace(/spice\s*-\s*/gi, " ")
    .replace(/cheese\s*-\s*/gi, "cheese ")
    .split(/\s+/)
    .filter(
      (w) =>
        w && !CATERING_NOISE.has(stem(w.toLowerCase().replace(/[^a-z]/g, ""))),
    )
    .join(" ");

/** Catering names USDA spells differently. Value = exact USDA name (case-insensitive). */
const SYNONYMS: Record<string, string> = {
  scallion: "Onions, spring or scallions (includes tops and bulb), raw",
  "green onion": "Onions, spring or scallions (includes tops and bulb), raw",
  cilantro: "Coriander (cilantro) leaves, raw",
  "garbanzo bean": "Chickpeas (garbanzo beans, bengal gram), mature seeds, raw",
  chickpea: "Chickpeas (garbanzo beans, bengal gram), mature seeds, raw",
  zucchini: "Squash, summer, zucchini, includes skin, raw",
  "bell pepper": "Peppers, sweet, green, raw",
  "red bell pepper": "Peppers, sweet, red, raw",
  romaine: "Lettuce, cos or romaine, raw",
  "romaine lettuce": "Lettuce, cos or romaine, raw",
  "half half": "Cream, fluid, half and half",
  "heavy cream": "Cream, fluid, heavy whipping",
  "heavy whipping cream": "Cream, fluid, heavy whipping",
  "sour cream": "Cream, sour, cultured",
  "powdered sugar": "Sugars, powdered",
  "confectioner sugar": "Sugars, powdered",
  "brown sugar": "Sugars, brown",
  sugar: "Sugars, granulated",
  "granulated sugar": "Sugars, granulated",
  "ap flour": "Wheat flour, white, all-purpose, enriched, bleached",
  "all purpose flour": "Wheat flour, white, all-purpose, enriched, bleached",
  flour: "Wheat flour, white, all-purpose, enriched, bleached",
  egg: "Egg, whole, raw, fresh",
  "whole egg": "Egg, whole, raw, fresh",
  butter: "Butter, salted",
  "unsalted butter": "Butter, without salt",
  "salted butter": "Butter, salted",
  "chicken breast": "Chicken, broilers or fryers, breast, meat only, raw",
  salmon: "Fish, salmon, Atlantic, farmed, raw",
  shrimp: "Crustaceans, shrimp, raw",
  "olive oil": "Oil, olive, salad or cooking",
  "vegetable oil": "Oil, soybean, salad or cooking",
  "canola oil": "Oil, canola",
  "whole milk": "Milk, whole, 3.25% milkfat, with added vitamin D",
  milk: "Milk, whole, 3.25% milkfat, with added vitamin D",
  buttermilk: "Milk, buttermilk, fluid, cultured, lowfat",
  mayonnaise: "Salad dressing, mayonnaise, regular",
  mayo: "Salad dressing, mayonnaise, regular",
  "kosher salt": "Salt, table",
  salt: "Salt, table",
  "black pepper": "Spices, pepper, black",
  pepper: "Spices, pepper, black",
  garlic: "Garlic, raw",
  lemon: "Lemons, raw, without peel",
  lime: "Limes, raw",
  "lemon juice": "Lemon juice, raw",
  "lime juice": "Lime juice, raw",
  "cider vinegar": "Vinegar, cider",
  "apple cider vinegar": "Vinegar, cider",
  "red wine vinegar": "Vinegar, red wine",
  "balsamic vinegar": "Vinegar, balsamic",
  honey: "Honey",
  "elbow macaroni": "Pasta, dry, enriched",
  pasta: "Pasta, dry, enriched",
  rice: "Rice, white, long-grain, regular, raw, enriched",
  "white rice": "Rice, white, long-grain, regular, raw, enriched",
  carrot: "Carrots, raw",
  celery: "Celery, raw",
  corn: "Corn, sweet, yellow, raw",
  onion: "Onions, raw",
  "red onion": "Onions, raw",
  "yellow onion": "Onions, raw",
  tomato: "Tomatoes, red, ripe, raw, year round average",
  potato: "Potatoes, flesh and skin, raw",
  "russet potato": "Potatoes, russet, flesh and skin, raw",
  spinach: "Spinach, raw",
  kale: "Kale, raw",
  mushroom: "Mushrooms, white, raw",
  parmesan: "Cheese, parmesan, grated",
  "parmesan cheese": "Cheese, parmesan, grated",
  cheddar: "Cheese, cheddar",
  "cheddar cheese": "Cheese, cheddar",
  mozzarella: "Cheese, mozzarella, whole milk",
  "mozzarella cheese": "Cheese, mozzarella, whole milk",
  "cream cheese": "Cheese, cream",
  feta: "Cheese, feta",
  bacon: "Pork, cured, bacon, unprepared",
  "ground beef": "Beef, ground, 80% lean meat / 20% fat, raw",
  "chicken thigh": "Chicken, broilers or fryers, thigh, meat only, raw",
  "dijon mustard": "Mustard, prepared, yellow",
  mustard: "Mustard, prepared, yellow",
  "soy sauce": "Soy sauce made from soy and wheat (shoyu)",
  ketchup: "Catsup",
  "worcestershire sauce": "Sauce, worcestershire",
};
const AVOID = ["baby food", "fast food", "restaurant", "infant", "formula"];
const AVOID_GROUPS = new Set([
  "Baby Foods",
  "Fast Foods",
  "Restaurant Foods",
  "American Indian/Alaska Native Foods",
  "Meals, Entrees, and Side Dishes",
  "Breakfast Cereals",
  "Snacks",
]);
const PREP_WORDS = [
  "cooked",
  "canned",
  "frozen",
  "dried",
  "dehydrated",
  "roasted",
  "boiled",
  "fried",
  "smoked",
  "salted",
  "sweetened",
  "juice",
  "powder",
  "concentrate",
  "imitation",
  "reduced",
  "low",
];

// ------------------------------------------------------------ library
const library = JSON.parse(readFileSync(LIBRARY, "utf8")) as LibraryFood[];
const libraryByName = new Map(library.map((f) => [f.name.toLowerCase(), f]));
const indexed = library
  .filter(
    (f) =>
      f.per100g.calories > 0 || f.per100g.protein > 0 || f.per100g.carbs > 0,
  )
  .map((f) => ({
    food: f,
    toks: new Set(tokens(f.name)),
    first: new Set(tokens(f.name.split(",")[0]!)),
    low: f.name.toLowerCase(),
  }));

type Candidate = {
  food: LibraryFood;
  score: number;
  coverage: number;
  firstCovered: boolean;
};
function candidates(name: string): Candidate[] {
  const want = tokens(name);
  if (want.length === 0) return [];
  const out: Candidate[] = [];
  for (const entry of indexed) {
    if (
      AVOID_GROUPS.has(entry.food.group) ||
      AVOID.some((a) => entry.low.includes(a))
    )
      continue;
    const matched = want.filter((w) => entry.toks.has(w)).length;
    if (matched === 0) continue;
    const coverage = matched / want.length;
    if (coverage < 0.5) continue;
    const firstCovered = [...entry.first].every((w) => want.includes(w));
    const extra = entry.toks.size - matched;
    let score = coverage * 100 - extra * 3 + (firstCovered ? 15 : 0);
    if (entry.toks.has("raw")) score += 4;
    for (const p of PREP_WORDS)
      if (entry.toks.has(stem(p)) && !want.includes(stem(p))) score -= 8;
    out.push({ food: entry.food, score, coverage, firstCovered });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 8);
}

// ------------------------------------------------------------ profile from a library food
const COUNT_WORDS = [
  "each",
  "piece",
  "slice",
  "medium",
  "large",
  "small",
  "whole",
  "clove",
  "stalk",
  "sprig",
  "head",
  "bunch",
  "fillet",
  "egg",
  "leaf",
  "fruit",
  "unit",
  "item",
  "link",
  "patty",
  "breast",
  "thigh",
  "ear",
  "pod",
  "wedge",
  "roll",
  "tortilla",
  "cookie",
  "cracker",
  "apple",
  "shrimp",
  "muffin",
  "biscuit",
  "bagel",
  "pita",
  "bar",
  "melon",
];
const COUNT_UNITS = new Set([
  "each",
  "piece",
  "slice",
  "bottle",
  "can",
  "package",
  "case",
  "tub",
  "melon",
  "pizza",
  "portion",
  "serving",
  "batch",
]);
function gramsPerEach(
  portions: LibraryPortion[],
  catalogUnit?: string,
): number | undefined {
  // A count unit that names a real thing ("melon", "slice", "can") must match a
  // USDA portion that says the same thing; "1 NLEA serving" is never an each.
  if (catalogUnit && catalogUnit !== "each" && COUNT_UNITS.has(catalogUnit)) {
    const word = catalogUnit === "melon" ? "melon" : catalogUnit;
    const hit = portions.find(
      (p) =>
        new RegExp(`\b${word}s?\b`).test(
          `${p.unit} ${p.modifier}`.toLowerCase(),
        ) && !/nlea|serving/.test(`${p.unit} ${p.modifier}`.toLowerCase()),
    );
    return hit ? hit.grams / hit.amount : undefined;
  }
  if (catalogUnit && catalogUnit !== "each") return undefined;
  const isCount = (p: LibraryPortion) => {
    const u = `${p.unit} ${p.modifier}`.toLowerCase();
    return (
      COUNT_WORDS.some((w) => u.split(/[^a-z]+/).includes(w)) &&
      !/cup|tbsp|tsp|tablespoon|teaspoon|fl oz|oz|lb|pint|quart|gallon|ml|liter/.test(
        p.unit.toLowerCase(),
      )
    );
  };
  const medium = portions.find(
    (p) => isCount(p) && /medium/.test(`${p.unit} ${p.modifier}`.toLowerCase()),
  );
  const pick = medium ?? portions.find(isCount);
  return pick ? pick.grams / pick.amount : undefined;
}
function gramsPerMl(portions: LibraryPortion[]): number | undefined {
  const find = (re: RegExp, ml: number) => {
    const p = portions.find(
      (x) =>
        re.test(x.unit.toLowerCase()) &&
        !/chopped|sliced|diced|packed|mashed|pieces|halves|shredded|crumbled|grated|cubes/.test(
          x.modifier.toLowerCase(),
        ),
    );
    const q = p ?? portions.find((x) => re.test(x.unit.toLowerCase()));
    return q ? q.grams / (q.amount * ml) : undefined;
  };
  return (
    find(/^cup/, CUP_ML) ??
    find(/^tbsp|^tablespoon/, TBSP_ML) ??
    find(/^tsp|^teaspoon/, TSP_ML) ??
    find(/^fl oz|fluid ounce/, FLOZ_ML)
  );
}
type AllergenCode =
  | "milk"
  | "eggs"
  | "fish"
  | "crustacean_shellfish"
  | "tree_nuts"
  | "peanuts"
  | "wheat"
  | "soybeans"
  | "sesame";
function allergensFor(food: LibraryFood): AllergenCode[] {
  const n = food.name.toLowerCase();
  const g = food.group;
  const out = new Set<AllergenCode>();
  if (g === "Dairy and Egg Products") {
    if (/\begg/.test(n)) out.add("eggs");
    else out.add("milk");
  }
  if (
    /\b(cheese|milk|cream|butter|yogurt|whey|casein)\b/.test(n) &&
    !/coconut|almond|soy|oat|rice|cocoa butter|peanut butter|nut butter/.test(n)
  )
    out.add("milk");
  if (/\begg\b|\beggs\b/.test(n) && !/eggplant/.test(n)) out.add("eggs");
  if (g === "Finfish and Shellfish Products") {
    if (/shrimp|crab|lobster|crawfish|crayfish|prawn|krill/.test(n))
      out.add("crustacean_shellfish");
    else if (
      /clam|oyster|mussel|scallop|squid|octopus|snail|abalone|cuttlefish/.test(
        n,
      )
    ) {
      /* molluscs are not one of the nine US codes */
    } else out.add("fish");
  }
  if (/\bpeanut/.test(n)) out.add("peanuts");
  else if (
    g === "Nut and Seed Products" ||
    /\b(almond|walnut|pecan|cashew|pistachio|hazelnut|macadamia|pine nut|brazil nut|chestnut)s?\b/.test(
      n,
    )
  ) {
    if (
      /\b(almond|walnut|pecan|cashew|pistachio|hazelnut|macadamia|pine nut|brazil nut|chestnut)s?\b/.test(
        n,
      )
    )
      out.add("tree_nuts");
  }
  if (/sesame|tahini/.test(n)) out.add("sesame");
  if (/\bsoy|tofu|edamame|tempeh|miso\b/.test(n)) out.add("soybeans");
  if (
    /\bwheat\b|\bflour\b|\bbread\b|\bpasta\b|\bmacaroni\b|\bnoodle|\bcouscous\b|\bbulgur\b|\bseitan\b|\bsemolina\b|\bcracker|\bcroissant|\bbagel|\bbun\b|\brolls?\b|\bcake\b|\bcookie|\bpie crust/.test(
      n,
    ) &&
    !/rice flour|corn flour|almond flour|coconut flour|buckwheat|gluten-free/.test(
      n,
    )
  )
    out.add("wheat");
  return [...out];
}

// ------------------------------------------------------------ Jev
const JEV_ENDPOINT = "https://api.typesafe.ai/v1/systemone";
async function askJev(
  ingredient: { name: string; unit: string; category: string | null },
  options: Candidate[],
): Promise<{ choice: string; confidence: number } | null> {
  const apiKey = process.env.TYPESAFE_API_KEY ?? process.env.JEV_API_KEY;
  if (NO_JEV || !apiKey || options.length === 0) return null;
  const criteria: Record<string, string | null> = {
    none: "None of these is the same food as the ingredient.",
  };
  for (const c of options)
    criteria[c.food.id] = `${c.food.name} (${c.food.group})`;
  const res = await fetch(JEV_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      state: {
        ingredient: ingredient.name,
        catalog_unit: ingredient.unit,
        catalog_category: ingredient.category,
      },
      model: "jev-latest",
      questions: {
        food: {
          type: "choice",
          instructions:
            "A catering kitchen buys this ingredient. Which USDA food record is the same food in its usual raw, plain form? Prefer raw and unprepared over cooked, canned, or flavored versions.",
          criteria,
        },
      },
    }),
  });
  if (!res.ok)
    throw new Error(`Jev ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as {
    answers: { food: { choice: string; confidence: number } };
  };
  return json.answers.food;
}

// ------------------------------------------------------------ run
if (!URL) {
  console.error("--url or CONVEX_URL is required");
  process.exit(2);
}
const client = new ConvexHttpClient(URL);
const auth = new CapsuleAgentAuthManager();
client.setAuth(await auth.resolveJwt());
type IngredientRow = {
  _id: string;
  name: string;
  unit: string;
  category?: string | null;
  version: number;
  allergens?: string[];
  caloriesPerUnit?: number | null;
  deletedAt?: number | null;
  status?: string;
};
const ingredients = (
  (await client.query(
    (api.queries as { listIngredient: never }).listIngredient,
    {},
  )) as IngredientRow[]
).filter(
  (i) => i.deletedAt == null && String(i.status ?? "active") === "active",
);
console.log(`${ingredients.length} ingredients (${URL})`);

type Decision = {
  id: string;
  name: string;
  unit: string;
  tier: "synonym" | "exact" | "jev" | "look" | "none";
  food: string | null;
  foodId: string | null;
  confidence: number;
  candidates: string[];
  allergens: AllergenCode[];
  scaled: boolean;
  note: string;
};
const decisions: Decision[] = [];
let jevCalls = 0;
for (const ing of ingredients) {
  const cleaned = cleanName(ing.name) || ing.name;
  const k = key(cleaned);
  let food: LibraryFood | null = null;
  let tier: Decision["tier"] = "none";
  let confidence = 0;
  const syn = SYNONYMS[k];
  const cands = candidates(cleaned);
  if (syn && libraryByName.has(syn.toLowerCase())) {
    food = libraryByName.get(syn.toLowerCase())!;
    tier = "synonym";
    confidence = 1;
  } else if (cands[0] && cands[0].coverage === 1 && cands[0].firstCovered) {
    food = cands[0].food;
    tier = "exact";
    confidence = 1;
  } else if (cands.length) {
    const answer = await askJev(
      { name: ing.name, unit: ing.unit, category: ing.category ?? null },
      cands,
    );
    if (answer) {
      jevCalls += 1;
      confidence = answer.confidence;
      const pick = cands.find((c) => c.food.id === answer.choice);
      if (pick && answer.confidence >= JEV_BAR) {
        food = pick.food;
        tier = "jev";
      } else tier = "look";
    } else tier = "look";
  }
  decisions.push({
    id: ing._id,
    name: ing.name,
    unit: ing.unit,
    tier,
    food: food?.name ?? null,
    foodId: food?.id ?? null,
    confidence,
    candidates: cands.slice(0, 5).map((c) => c.food.name),
    allergens: food ? allergensFor(food) : [],
    scaled: false,
    note: "",
  });
}

// ------------------------------------------------------------ apply
let written = 0;
let allergenWrites = 0;
// The match pass can outlive the session token; start the writes fresh.
client.setAuth(await auth.resolveJwt());
for (const d of decisions) {
  if (!d.foodId) continue;
  const food = library.find((f) => f.id === d.foodId)!;
  const perGram = {
    caloriesPerUnit: food.per100g.calories / 100,
    proteinGramsPerUnit: food.per100g.protein / 100,
    carbsGramsPerUnit: food.per100g.carbs / 100,
    fatGramsPerUnit: food.per100g.fat / 100,
    fiberGramsPerUnit: food.per100g.fiber / 100,
    sugarGramsPerUnit: food.per100g.sugar / 100,
    sodiumMgPerUnit: food.per100g.sodium / 100,
    calciumMgPerUnit: food.per100g.calcium / 100,
    ironMgPerUnit: food.per100g.iron / 100,
  };
  const hints = {
    servingGramsPerEach: gramsPerEach(food.portions, d.unit),
    gramsPerMl: gramsPerMl(food.portions),
    foodName: food.name,
  };
  const grams = CatalogUnitGrams.resolveDetailed(d.unit, hints);
  const scaled = grams
    ? scaleNutritionFromGramsToUnit(perGram, d.unit, grams.grams)
    : null;
  d.note = grams
    ? `per ${d.unit} = ${grams.grams.toFixed(1)} g (${grams.basis})`
    : `unit ${d.unit} could not be turned into grams`;
  const guessed =
    grams &&
    (grams.basis === "household_cup" ||
      grams.basis === "usda_basis" ||
      grams.basis === "bottle_typical");
  if (guessed) d.note += " — GUESS, not written";
  d.scaled = scaled != null && !guessed;
  if (DRY_RUN || !scaled || guessed) continue;
  const fresh = (await client.query(
    (api.queries as { getIngredient: never }).getIngredient,
    { id: d.id },
  )) as IngredientRow | null;
  if (!fresh) continue;
  await client.mutation(
    (api.mutations as { Ingredient_setNutrition: never })
      .Ingredient_setNutrition,
    {
      docId: d.id,
      version: fresh.version,
      ...Object.fromEntries(
        Object.entries(scaled).map(([k, v]) => [
          k,
          Number((v as number).toFixed(2)),
        ]),
      ),
    },
  );
  written += 1;
  if (d.allergens.length) {
    const again = (await client.query(
      (api.queries as { getIngredient: never }).getIngredient,
      { id: d.id },
    )) as IngredientRow | null;
    const merged = [...new Set([...(again?.allergens ?? []), ...d.allergens])];
    if (merged.length !== (again?.allergens ?? []).length) {
      await client.mutation(
        (api.mutations as { Ingredient_classifyAllergens: never })
          .Ingredient_classifyAllergens,
        { docId: d.id, version: again!.version, allergens: merged },
      );
      allergenWrites += 1;
    }
  }
  if (written % 15 === 0) client.setAuth(await auth.resolveJwt());
}

mkdirSync(resolve(process.cwd(), ".artifacts/usda"), { recursive: true });
writeFileSync(REPORT, JSON.stringify(decisions, null, 1));
const tally = (t: Decision["tier"]) =>
  decisions.filter((d) => d.tier === t).length;
console.log(
  JSON.stringify(
    {
      ingredients: decisions.length,
      synonym: tally("synonym"),
      exact: tally("exact"),
      jev: tally("jev"),
      look: tally("look"),
      none: tally("none"),
      scalable: decisions.filter((d) => d.foodId && d.scaled).length,
      jevCalls,
      written: DRY_RUN ? 0 : written,
      allergenWrites: DRY_RUN ? 0 : allergenWrites,
      report: REPORT,
    },
    null,
    2,
  ),
);
