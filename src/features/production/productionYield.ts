export type ProductionYieldWindow = 30 | 90 | 365;

type DateValue = Date | number | string | null | undefined;

export type ProductionYieldBatch = {
  _id?: string;
  recipeId: string;
  status?: string | null;
  plannedYield?: number | null;
  actualYield?: number | null;
  yieldUnit?: string | null;
  completedAt?: DateValue;
  deletedAt?: DateValue;
};

export type ProductionYieldRecipe = {
  _id: string;
  name?: string | null;
};

export type ProductionYieldRow = {
  key: string;
  recipeId: string;
  recipeName: string;
  yieldUnit: string;
  batchCount: number;
  plannedYield: number;
  actualYield: number;
  varianceYield: number;
  variancePercentage: number;
};

export type ProductionYieldReport = {
  rows: ProductionYieldRow[];
  rangeStart: Date;
  rangeEnd: Date;
  recipeCount: number;
  batchCount: number;
  totalPlannedYield: number;
  totalActualYield: number;
  totalVarianceYield: number;
  totalVariancePercentage: number | null;
  summaryUnit: string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function validDate(value: DateValue): Date | null {
  if (value == null) return null;
  const date = value instanceof Date ? new Date(value) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function finiteNumber(value: number | null | undefined): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function buildProductionYieldReport({
  batches,
  recipes,
  windowDays,
  now = new Date(),
}: {
  batches: readonly ProductionYieldBatch[];
  recipes: readonly ProductionYieldRecipe[];
  windowDays: ProductionYieldWindow;
  now?: Date;
}): ProductionYieldReport {
  const rangeEnd = new Date(now);
  const rangeStart = new Date(rangeEnd.getTime() - windowDays * DAY_MS);
  const recipesById = new Map(
    recipes.map((recipe) => [String(recipe._id), recipe]),
  );
  const grouped = new Map<string, ProductionYieldRow>();

  for (const batch of batches) {
    if (batch.deletedAt != null || String(batch.status) !== "completed") {
      continue;
    }
    const completedAt = validDate(batch.completedAt);
    const plannedYield = finiteNumber(batch.plannedYield);
    const actualYield = finiteNumber(batch.actualYield);
    if (
      !completedAt ||
      completedAt < rangeStart ||
      completedAt > rangeEnd ||
      plannedYield == null ||
      plannedYield <= 0 ||
      actualYield == null ||
      actualYield < 0
    ) {
      continue;
    }

    const recipeId = String(batch.recipeId);
    const yieldUnit = batch.yieldUnit?.trim() || "unit";
    const key = `${recipeId}:${yieldUnit}`;
    const recipe = recipesById.get(recipeId);
    const current = grouped.get(key) ?? {
      key,
      recipeId,
      recipeName: recipe?.name?.trim() || "Unknown recipe",
      yieldUnit,
      batchCount: 0,
      plannedYield: 0,
      actualYield: 0,
      varianceYield: 0,
      variancePercentage: 0,
    };
    current.batchCount += 1;
    current.plannedYield += plannedYield;
    current.actualYield += actualYield;
    grouped.set(key, current);
  }

  const rows = [...grouped.values()].map((row) => {
    const varianceYield = row.actualYield - row.plannedYield;
    return {
      ...row,
      varianceYield,
      variancePercentage: (varianceYield / row.plannedYield) * 100,
    };
  });
  rows.sort(
    (left, right) =>
      left.variancePercentage - right.variancePercentage ||
      left.recipeName.localeCompare(right.recipeName),
  );

  const batchCount = rows.reduce((sum, row) => sum + row.batchCount, 0);
  const units = new Set(rows.map((row) => row.yieldUnit));
  const summaryUnit = units.size === 1 ? (rows[0]?.yieldUnit ?? null) : null;
  const totalPlannedYield = rows.reduce(
    (sum, row) => sum + row.plannedYield,
    0,
  );
  const totalActualYield = rows.reduce((sum, row) => sum + row.actualYield, 0);
  const totalVarianceYield = totalActualYield - totalPlannedYield;

  return {
    rows,
    rangeStart,
    rangeEnd,
    recipeCount: new Set(rows.map((row) => row.recipeId)).size,
    batchCount,
    totalPlannedYield,
    totalActualYield,
    totalVarianceYield,
    totalVariancePercentage:
      summaryUnit != null && totalPlannedYield > 0
        ? (totalVarianceYield / totalPlannedYield) * 100
        : null,
    summaryUnit,
  };
}
