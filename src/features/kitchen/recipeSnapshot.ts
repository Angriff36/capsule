// Recipe version history — pure snapshot serialization + diff/restore-plan.
// The Manifest RecipeSnapshot entity stores `snapshot` as a JSON string; these
// helpers build, parse, diff, and compute the restore plan for that blob.

export type RecipeSnapshotLine = {
  ingredientId: string;
  ingredientName: string;
  quantity: number;
  unit: string;
  prepNotes: string;
};

export type RecipeSnapshotData = {
  name: string;
  category: string;
  cuisine: string;
  description: string;
  instructions: string;
  yieldQuantity: number;
  yieldUnit: string;
  batchMultiplier: number;
  servesPerYield: number;
  lines: RecipeSnapshotLine[];
};

type RecipeLike = {
  name?: string;
  category?: string | null;
  cuisine?: string | null;
  description?: string | null;
  instructions?: string | null;
  yieldQuantity?: number | string;
  yieldUnit?: string;
  batchMultiplier?: number | string;
  servesPerYield?: number;
};

type LineLike = {
  ingredientId: string;
  quantity: number | string;
  unit: string;
  prepNotes?: string | null;
};

export function buildRecipeSnapshotData(
  recipe: RecipeLike,
  lines: readonly LineLike[],
  ingredientName: (id: string) => string,
): RecipeSnapshotData {
  return {
    name: recipe.name ?? "",
    category: recipe.category ?? "",
    cuisine: recipe.cuisine ?? "",
    description: recipe.description ?? "",
    instructions: recipe.instructions ?? "",
    yieldQuantity: Number(recipe.yieldQuantity ?? 0),
    yieldUnit: String(recipe.yieldUnit ?? ""),
    batchMultiplier: Number(recipe.batchMultiplier ?? 1),
    servesPerYield: Number(recipe.servesPerYield ?? 1),
    lines: lines.map((line) => ({
      ingredientId: line.ingredientId,
      ingredientName: ingredientName(line.ingredientId),
      quantity: Number(line.quantity),
      unit: String(line.unit),
      prepNotes: line.prepNotes ?? "",
    })),
  };
}

export function parseRecipeSnapshot(json: string): RecipeSnapshotData | null {
  try {
    const data = JSON.parse(json) as RecipeSnapshotData;
    if (!data || !Array.isArray(data.lines)) return null;
    return data;
  } catch {
    return null;
  }
}

export type FieldDiff = {
  label: string;
  before: string;
  after: string;
  changed: boolean;
};

const FIELDS: { key: keyof RecipeSnapshotData; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "category", label: "Category" },
  { key: "cuisine", label: "Cuisine" },
  { key: "yieldQuantity", label: "Yield" },
  { key: "yieldUnit", label: "Yield unit" },
  { key: "batchMultiplier", label: "Batch multiplier" },
  { key: "servesPerYield", label: "Serves per yield" },
  { key: "description", label: "Description" },
  { key: "instructions", label: "Method" },
];

export function diffRecipeScalars(
  before: RecipeSnapshotData,
  after: RecipeSnapshotData,
): FieldDiff[] {
  return FIELDS.map(({ key, label }) => {
    const b = String(before[key] ?? "");
    const a = String(after[key] ?? "");
    return { label, before: b, after: a, changed: b !== a };
  });
}

export type LineDiff = {
  ingredientId: string;
  ingredientName: string;
  before: string | null;
  after: string | null;
  status: "added" | "removed" | "changed" | "same";
};

const lineText = (line: RecipeSnapshotLine) =>
  `${line.quantity} ${line.unit}${line.prepNotes ? ` — ${line.prepNotes}` : ""}`;

export function diffRecipeLines(
  before: RecipeSnapshotData,
  after: RecipeSnapshotData,
): LineDiff[] {
  const ids = new Set<string>();
  before.lines.forEach((l) => ids.add(l.ingredientId));
  after.lines.forEach((l) => ids.add(l.ingredientId));
  return [...ids].map((id) => {
    const b = before.lines.find((l) => l.ingredientId === id) ?? null;
    const a = after.lines.find((l) => l.ingredientId === id) ?? null;
    const name = a?.ingredientName ?? b?.ingredientName ?? "Unknown ingredient";
    const before_ = b ? lineText(b) : null;
    const after_ = a ? lineText(a) : null;
    let status: LineDiff["status"] = "same";
    if (b && !a) status = "removed";
    else if (!b && a) status = "added";
    else if (before_ !== after_) status = "changed";
    return {
      ingredientId: id,
      ingredientName: name,
      before: before_,
      after: after_,
      status,
    };
  });
}

// Restore plan: how to turn the CURRENT recipe lines into the TARGET snapshot's
// lines using existing add / adjust / remove commands.
export type LineRestorePlan = {
  add: RecipeSnapshotLine[];
  adjust: { ingredientId: string; quantity: number; unit: string }[];
  remove: string[]; // ingredientIds no longer present in the target
};

export function planLineRestore(
  current: RecipeSnapshotData,
  target: RecipeSnapshotData,
): LineRestorePlan {
  const add: RecipeSnapshotLine[] = [];
  const adjust: LineRestorePlan["adjust"] = [];
  const remove: string[] = [];
  for (const t of target.lines) {
    const c = current.lines.find((l) => l.ingredientId === t.ingredientId);
    if (!c) add.push(t);
    else if (c.quantity !== t.quantity || c.unit !== t.unit)
      adjust.push({
        ingredientId: t.ingredientId,
        quantity: t.quantity,
        unit: t.unit,
      });
  }
  for (const c of current.lines) {
    if (!target.lines.find((l) => l.ingredientId === c.ingredientId))
      remove.push(c.ingredientId);
  }
  return { add, adjust, remove };
}

// ponytail: self-check runs only under `node recipeSnapshot.ts`-style import.main
declare const require: unknown;
if (typeof require !== "undefined" && (require as { main?: unknown }).main) {
  const base: RecipeSnapshotData = {
    name: "Aioli",
    category: "",
    cuisine: "",
    description: "",
    instructions: "mix",
    yieldQuantity: 1,
    yieldUnit: "portion",
    batchMultiplier: 1,
    servesPerYield: 4,
    lines: [
      {
        ingredientId: "egg",
        ingredientName: "Egg",
        quantity: 2,
        unit: "each",
        prepNotes: "",
      },
      {
        ingredientId: "oil",
        ingredientName: "Oil",
        quantity: 1,
        unit: "cup",
        prepNotes: "",
      },
    ],
  };
  const target: RecipeSnapshotData = {
    ...base,
    name: "Garlic Aioli",
    lines: [
      {
        ingredientId: "egg",
        ingredientName: "Egg",
        quantity: 3,
        unit: "each",
        prepNotes: "",
      },
      {
        ingredientId: "garlic",
        ingredientName: "Garlic",
        quantity: 4,
        unit: "clove",
        prepNotes: "",
      },
    ],
  };
  const plan = planLineRestore(base, target);
  console.assert(
    plan.add.length === 1 && plan.add[0].ingredientId === "garlic",
    "add garlic",
  );
  console.assert(
    plan.adjust.length === 1 && plan.adjust[0].ingredientId === "egg",
    "adjust egg",
  );
  console.assert(
    plan.remove.length === 1 && plan.remove[0] === "oil",
    "remove oil",
  );
  console.assert(
    diffRecipeScalars(base, target)[0].changed === true,
    "name changed",
  );
  console.log("recipeSnapshot self-check OK");
}
