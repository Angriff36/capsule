// Component version history — pure snapshot serialization + diff/restore-plan.
// The Manifest ComponentSnapshot entity stores `snapshot` as a JSON string; these
// helpers build, parse, diff, and compute the restore plan for that blob.

export type ComponentSnapshotLine = {
  ingredientId: string;
  ingredientName: string;
  quantity: number;
  unit: string;
  prepNotes: string;
  sortOrder?: number;
  wasteFactor?: number;
};

export type ComponentSnapshotData = {
  name: string;
  category: string;
  cuisine: string;
  description: string;
  instructions: string;
  yieldQuantity: number;
  yieldUnit: string;
  batchMultiplier: number;
  servesPerYield: number;
  lines: ComponentSnapshotLine[];
};

type ComponentLike = {
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
  sortOrder?: number;
  wasteFactor?: number | null;
};

export function buildComponentSnapshotData(
  component: ComponentLike,
  lines: readonly LineLike[],
  ingredientName: (id: string) => string,
): ComponentSnapshotData {
  return {
    name: component.name ?? "",
    category: component.category ?? "",
    cuisine: component.cuisine ?? "",
    description: component.description ?? "",
    instructions: component.instructions ?? "",
    yieldQuantity: Number(component.yieldQuantity ?? 0),
    yieldUnit: String(component.yieldUnit ?? ""),
    batchMultiplier: Number(component.batchMultiplier ?? 1),
    servesPerYield: Number(component.servesPerYield ?? 1),
    lines: lines.map((line) => ({
      ingredientId: line.ingredientId,
      ingredientName: ingredientName(line.ingredientId),
      quantity: Number(line.quantity),
      unit: String(line.unit),
      prepNotes: line.prepNotes ?? "",
      sortOrder: line.sortOrder,
      wasteFactor: line.wasteFactor ?? undefined,
    })),
  };
}

export function parseComponentSnapshot(
  json: string,
): ComponentSnapshotData | null {
  try {
    const data = JSON.parse(json) as ComponentSnapshotData;
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

const FIELDS: { key: keyof ComponentSnapshotData; label: string }[] = [
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

export function diffComponentScalars(
  before: ComponentSnapshotData,
  after: ComponentSnapshotData,
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

const lineText = (line: ComponentSnapshotLine) =>
  `${line.quantity} ${line.unit}${line.prepNotes ? ` — ${line.prepNotes}` : ""}`;

export function diffComponentLines(
  before: ComponentSnapshotData,
  after: ComponentSnapshotData,
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

// Restore plan: how to turn the CURRENT component lines into the TARGET snapshot's
// lines using existing add / adjust / remove commands.
export type LineRestorePlan = {
  add: ComponentSnapshotLine[];
  adjust: { ingredientId: string; quantity: number; unit: string }[];
  remove: string[]; // ingredientIds no longer present in the target
};

export function planLineRestore(
  current: ComponentSnapshotData,
  target: ComponentSnapshotData,
): LineRestorePlan {
  const add: ComponentSnapshotLine[] = [];
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

// ponytail: self-check runs only under `node componentSnapshot.ts`-style import.main
declare const require: unknown;
if (typeof require !== "undefined" && (require as { main?: unknown }).main) {
  const base: ComponentSnapshotData = {
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
  const target: ComponentSnapshotData = {
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
    diffComponentScalars(base, target)[0].changed === true,
    "name changed",
  );
  console.log("componentSnapshot self-check OK");
}
