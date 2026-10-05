export type ProductionYieldWindow = 30 | 90 | 365;

type DateValue = Date | number | string | null | undefined;

export type ProductionYieldBatch = {
  _id?: string;
  componentId: string;
  status?: string | null;
  plannedYield?: number | null;
  actualYield?: number | null;
  yieldUnit?: string | null;
  completedAt?: DateValue;
  deletedAt?: DateValue;
};

export type ProductionYieldComponent = {
  _id: string;
  name?: string | null;
  yieldQuantity?: number | null;
  yieldUnit?: string | null;
};

/** A new recipe yield worth checking, read from repeated actual yields. */
export type ProductionYieldSuggestion = {
  currentYield: number;
  suggestedYield: number;
  yieldUnit: string;
};

export type ProductionYieldRow = {
  key: string;
  componentId: string;
  componentName: string;
  yieldUnit: string;
  batchCount: number;
  plannedYield: number;
  actualYield: number;
  varianceYield: number;
  variancePercentage: number;
  suggestion: ProductionYieldSuggestion | null;
};

export type ProductionYieldReport = {
  rows: ProductionYieldRow[];
  rangeStart: Date;
  rangeEnd: Date;
  componentCount: number;
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

/** Batches needed before one recipe's yield is worth questioning. */
export const YIELD_SUGGESTION_MIN_BATCHES = 3;
/** Shortfall or overage (percent) that is more than normal kitchen spread. */
export const YIELD_SUGGESTION_MIN_PERCENT = 5;

/**
 * Suggest a recipe yield only when the batches and the recipe count the
 * same unit, enough batches agree, and the gap is past normal spread. The
 * suggestion scales the recipe's own yield by actual over planned.
 */
export function suggestRecipeYield(
  row: Pick<
    ProductionYieldRow,
    "batchCount" | "plannedYield" | "actualYield" | "yieldUnit"
  >,
  component: ProductionYieldComponent | undefined,
): ProductionYieldSuggestion | null {
  const currentYield = finiteNumber(component?.yieldQuantity);
  const recipeUnit = component?.yieldUnit?.trim();
  if (
    currentYield == null ||
    currentYield <= 0 ||
    !recipeUnit ||
    recipeUnit.toLowerCase() !== row.yieldUnit.trim().toLowerCase() ||
    row.batchCount < YIELD_SUGGESTION_MIN_BATCHES ||
    row.plannedYield <= 0 ||
    row.actualYield <= 0
  ) {
    return null;
  }
  const ratio = row.actualYield / row.plannedYield;
  if (Math.abs(ratio - 1) * 100 <= YIELD_SUGGESTION_MIN_PERCENT) return null;
  const suggestedYield = Math.round(currentYield * ratio * 100) / 100;
  if (suggestedYield <= 0 || suggestedYield === currentYield) return null;
  return { currentYield, suggestedYield, yieldUnit: recipeUnit };
}

export function buildProductionYieldReport({
  batches,
  components,
  windowDays,
  now = new Date(),
}: {
  batches: readonly ProductionYieldBatch[];
  components: readonly ProductionYieldComponent[];
  windowDays: ProductionYieldWindow;
  now?: Date;
}): ProductionYieldReport {
  const rangeEnd = new Date(now);
  const rangeStart = new Date(rangeEnd.getTime() - windowDays * DAY_MS);
  const componentsById = new Map(
    components.map((component) => [String(component._id), component]),
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

    const componentId = String(batch.componentId);
    const yieldUnit = batch.yieldUnit?.trim() || "unit";
    const key = `${componentId}:${yieldUnit}`;
    const component = componentsById.get(componentId);
    const current = grouped.get(key) ?? {
      key,
      componentId,
      componentName: component?.name?.trim() || "Unknown component",
      yieldUnit,
      batchCount: 0,
      plannedYield: 0,
      actualYield: 0,
      varianceYield: 0,
      variancePercentage: 0,
      suggestion: null,
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
      suggestion: suggestRecipeYield(row, componentsById.get(row.componentId)),
    };
  });
  rows.sort(
    (left, right) =>
      left.variancePercentage - right.variancePercentage ||
      left.componentName.localeCompare(right.componentName),
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
    componentCount: new Set(rows.map((row) => row.componentId)).size,
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
