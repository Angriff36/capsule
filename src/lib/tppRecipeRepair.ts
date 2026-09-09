/** Source-only projection: whole TPP recipes become dishes; nested make formulas
 * remain components. Quantities on a dish are per serving, never per batch. */
export type TppSourceRecipe = {
  name: string;
  yieldText: string;
  raw: string;
  main: string;
  fingerprint: string;
  files: string[];
  lines: { name: string; quantity: string; unit: string }[];
};
export type RecipeAmount = {
  name: string;
  quantity: number;
  unit: string;
  source: string;
};
export type RecipeRepairProjection = {
  name: string;
  fingerprint: string;
  source: string;
  description: string;
  raw: string;
  instructions: string;
  yieldText: string;
  portionSize: number;
  portionUnit: string;
  tasks: {
    name: string;
    quantity?: number;
    unit?: string;
    instructions: string;
  }[];
  ingredients: RecipeAmount[];
  components: {
    name: string;
    key: string;
    instructions: string;
    /** When present, ingredients describe this actual kitchen batch. */
    yieldQuantity?: number;
    yieldUnit?: string;
    /** Measured amount for one dish serving, in yieldUnit. */
    quantityPerServing?: number;
    ingredients: RecipeAmount[];
  }[];
  notes: string[];
};
export const recipeNameKey = (s: string) =>
  s
    .replace(/&amp;/gi, "&")
    .replace(/&#(?:0?39|x27);|&apos;/gi, "'")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");

export function fraction(value: string): number | undefined {
  const text = value.trim();
  if (!/^\d+(?:\.\d+)?(?:\s+\d+\/\d+|\/\d+)?$/.test(text)) return undefined;
  const parts = text.split(/\s+/);
  let n = 0;
  for (const part of parts) {
    const [a, b] = part.split("/").map(Number);
    if (b === 0) return undefined;
    n += b === undefined ? a : a / b;
  }
  return Number.isFinite(n) && n > 0 ? n : undefined;
}
/** Fluid ounces are volume (1/32 quart), never mass ounces. Count nouns retain
 * their original noun in the task/source text while the enum stores each. */
export function recipeMeasure(
  text: string,
): { unit: string; factor: number; family: string } | undefined {
  const s = text.trim().toLowerCase();
  const map: Record<string, [string, number, string]> = {
    "oz - fld": ["quart", 1 / 32, "volume"],
    "oz - dry": ["ounce", 1, "mass"],
    "tblsp - fld": ["tablespoon", 1, "volume"],
    "tblsp - dry": ["tablespoon", 1, "volume"],
    "tsp - fld": ["teaspoon", 1, "volume"],
    "tsp - dry": ["teaspoon", 1, "volume"],
    "cup - fld": ["cup", 1, "volume"],
    cup: ["cup", 1, "volume"],
    quart: ["quart", 1, "volume"],
    gallon: ["gallon", 1, "volume"],
    pint: ["pint", 1, "volume"],
    pound: ["pound", 1, "mass"],
    gram: ["gram", 1, "mass"],
    ounce: ["ounce", 1, "mass"],
    each: ["each", 1, "count"],
    piece: ["each", 1, "count"],
    slice: ["each", 1, "count"],
    bag: ["each", 1, "count"],
    ball: ["each", 1, "count"],
    halves: ["each", 1, "count"],
    can: ["each", 1, "count"],
    box: ["each", 1, "count"],
    pizza: ["each", 1, "count"],
    melon: ["melon", 1, "melon"],
    serving: ["serving", 1, "serving"],
    recipe: ["batch", 1, "batch"],
    batch: ["batch", 1, "batch"],
  };
  const row = map[s];
  return row ? { unit: row[0], factor: row[1], family: row[2] } : undefined;
}
const base: Record<string, number> = {
  ounce: 1,
  pound: 16,
  gram: 1 / 28.349523125,
  quart: 1,
  cup: 1 / 4,
  pint: 1 / 2,
  gallon: 4,
  tablespoon: 1 / 64,
  teaspoon: 1 / 192,
  each: 1,
  melon: 1,
  serving: 1,
  batch: 1,
};
function amount(quantity: string, unit: string) {
  const n = fraction(quantity),
    m = recipeMeasure(unit);
  return n && m
    ? { quantity: n * m.factor, unit: m.unit, family: m.family }
    : undefined;
}
function yieldAmount(text: string) {
  const m = text.trim().match(/^(\d+(?:\.\d+)?(?:\s+\d+\/\d+|\/\d+)?)\s+(.+)$/);
  return m ? amount(m[1], m[2]) : undefined;
}
function parseLine(line: string) {
  const parts = line.split("|").map((s) => s.trim());
  if (parts.length < 3 || !fraction(parts[0])) return undefined;
  return {
    quantity: parts[0],
    unit: parts[1],
    name: parts.slice(2).filter(Boolean).join(" | "),
  };
}

export function projectTppRecipe(
  recipe: TppSourceRecipe,
): RecipeRepairProjection {
  const source = `TPP: ${recipe.files.join(", ")}; original yield: ${recipe.yieldText}`;
  const yieldValue = yieldAmount(recipe.yieldText);
  // "2 Each" is the served portion (two bites), not two guests. Only an
  // explicitly stated Serving yield divides the per-serving quantities.
  const servings = yieldValue?.family === "serving" ? yieldValue.quantity : 1;
  const output: RecipeRepairProjection = {
    name: recipe.name,
    fingerprint: recipe.fingerprint,
    source,
    description: recipe.main.match(/Description:\s*\|\s*([^\n]*)/)?.[1] ?? "",
    raw: recipe.raw,
    instructions: recipe.main.includes("Method:")
      ? recipe.main.slice(recipe.main.indexOf("Method:"))
      : recipe.main.includes("Heating & Serving:")
        ? recipe.main.slice(recipe.main.indexOf("Heating & Serving:"))
        : "",
    yieldText: recipe.yieldText,
    portionSize:
      yieldValue?.family === "serving" ? 1 : (yieldValue?.quantity ?? 1),
    portionUnit:
      yieldValue?.family === "serving"
        ? "serving"
        : (yieldValue?.unit ?? "batch"),
    tasks: [],
    ingredients: [],
    components: [],
    notes: [],
  };
  const raw = recipe.raw.split("\n");
  const subStart = raw.indexOf("Sub Recipes(s)");
  const names = new Set(recipe.lines.map((l) => l.name));
  for (const line of raw) {
    const l = parseLine(line);
    if (l) names.add(l.name);
  }
  const starts = raw.flatMap((line, i) =>
    i > subStart &&
    subStart >= 0 &&
    names.has(line) &&
    raw.slice(i + 1, i + 4).some((l) => l.startsWith("Yields:"))
      ? [i]
      : [],
  );
  const subs = new Map<
    string,
    {
      name: string;
      yield: string;
      lines: NonNullable<ReturnType<typeof parseLine>>[];
      raw: string;
    }
  >();
  starts.forEach((start, i) => {
    const block = raw.slice(start, starts[i + 1] ?? raw.length);
    const name = block[0];
    if (!subs.has(recipeNameKey(name)))
      subs.set(recipeNameKey(name), {
        name,
        yield: block
          .find((l) => l.startsWith("Yields:"))!
          .replace(/^Yields:\s*/, ""),
        lines: block
          .map(parseLine)
          .filter((l): l is NonNullable<typeof l> => Boolean(l)),
        raw: block.join("\n"),
      });
  });
  const add = (target: RecipeAmount[], line: RecipeAmount) => {
    const prior = target.find(
      (p) =>
        recipeNameKey(p.name) === recipeNameKey(line.name) &&
        p.unit === line.unit,
    );
    if (prior) prior.quantity += line.quantity;
    else target.push({ ...line });
  };
  const expand = (
    name: string,
    qty: number,
    unit: string,
    family: string,
    target: RecipeAmount[],
    seen: Set<string>,
  ) => {
    const k = recipeNameKey(name);
    const sub = subs.get(k);
    if (!sub) {
      if (
        !/^(make|portion|prepare|cook|pack|check|cut|slice|dice|peel|rinse|assemble|ball|clean|chiffonade|heat|bake|grill|place|pull|proof|whip|mix|shred|chop|scoop|wash|par\s)\b/i.test(
          name,
        )
      )
        add(target, {
          name,
          quantity: qty,
          unit,
          source: "Direct ingredient in original recipe",
        });
      else output.notes.push(`No ingredient breakdown in source: ${name}`);
      return;
    }
    if (seen.has(k)) {
      output.notes.push(`Recursive source reference: ${name}`);
      return;
    }
    const y = yieldAmount(sub.yield);
    if (!y || family !== y.family) {
      output.notes.push(
        `Source units require review: ${name}: ${qty} ${unit} versus yield ${sub.yield}`,
      );
      return;
    }
    const ratio = (qty * base[unit]) / (y.quantity * base[y.unit]);
    for (const line of sub.lines) {
      const a = amount(line.quantity, line.unit);
      if (!a) {
        output.notes.push(
          `Unmapped amount: ${line.quantity} ${line.unit} ${line.name}`,
        );
        continue;
      }
      if (subs.has(recipeNameKey(line.name)))
        expand(
          line.name,
          a.quantity * ratio,
          a.unit,
          a.family,
          target,
          new Set([...seen, k]),
        );
      else
        add(target, {
          name: line.name,
          quantity: a.quantity * ratio,
          unit: a.unit,
          source: `${sub.name}: ${line.quantity} ${line.unit} per ${sub.yield}`,
        });
    }
    if (!sub.lines.length)
      output.notes.push(`No ingredient breakdown in source: ${name}`);
  };
  for (const line of recipe.lines) {
    const a = amount(line.quantity, line.unit);
    const sub = subs.get(recipeNameKey(line.name));
    const perServing = /\b(Serving|Each|Pizza)$/.test(recipe.yieldText);
    // A named TPP subrecipe is a prep item even when its label is a noun.
    // Additional action verbs cover source steps such as tempering and soaking.
    const actionable =
      Boolean(sub) ||
      /^(steam|mandolin|temper|panko bread|crust|sear|punch|rub|soak|flat bottom|prep|pound|bread|immersion blend|marinade|run|blanch|shave|citrus zest|poach|julienne|hydrate|layer|pipe|filet|seasoned flour|butter|thick slice|take|cube|egg wash|sous vide|day of event|trim|channel knife|melon ball|pickle|thinly slice|zest|season|bowl|bag|meat and cheese|veggies|assembly line|build|smoke|pan|package|mince|box|count|custom prep list|make|portion|prepare|cook|pack|check|cut|slice|dice|peel|rinse|assemble|ball|clean|chiffonade|heat|bake|grill|place|pull|proof|whip|mix|shred|chop|scoop|wash|par|order|pickup|pick up|receive|pour|crumble|roast|marinate|skewer|roll|fry|thaw|fill|drain|toast|remove|bring|serve|finish|lay|put|load|add)\b/i.test(
        line.name,
      );
    if (actionable)
      output.tasks.push({
        name: line.name,
        ...(a && perServing
          ? { quantity: a.quantity / servings, unit: a.unit }
          : {}),
        instructions: `${line.quantity} ${line.unit} per ${recipe.yieldText}\n${source}\n${sub?.raw ?? recipe.main}`,
      });
    if (!perServing) {
      output.notes.push(
        `Batch quantities preserved in original recipe; guest yield not stated (${recipe.yieldText}).`,
      );
      continue;
    }
    if (!a) {
      output.notes.push(
        `Source task amount retained as text: ${line.quantity} ${line.unit} ${line.name}`,
      );
      continue;
    }
    const leaves: RecipeAmount[] = [];
    expand(
      line.name,
      a.quantity / servings,
      a.unit,
      a.family,
      leaves,
      new Set(),
    );
    // A make-formula with multiple inputs is a real subrecipe. Portioning,
    // peeling and packing remain prep steps with direct dish ingredients.
    if (
      sub &&
      /^(make|mix|prepare|cook|bake|whip|marinate|roast|saute|sauté)\b/i.test(
        sub.name,
      ) &&
      sub.lines.length > 1 &&
      leaves.length
    ) {
      output.components.push({
        name: sub.name,
        key: JSON.stringify([
          recipeNameKey(sub.name),
          sub.raw,
          leaves.map((l) => [recipeNameKey(l.name), l.quantity, l.unit]).sort(),
        ]),
        instructions: sub.raw,
        ingredients: leaves,
      });
    } else for (const leaf of leaves) add(output.ingredients, leaf);
  }
  output.notes = [...new Set(output.notes)];
  return output;
}
