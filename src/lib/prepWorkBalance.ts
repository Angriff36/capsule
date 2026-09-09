import { recipeUnitRatio } from "./recipeUnitConversion";

export interface PrepWorkRecord {
  id: string;
  quantity: number;
  completedQuantity?: number | null;
  unit: string;
  status: string;
  isGenerated: boolean;
  deletedAt?: number | null;
}

export type PrepWorkBalance =
  | { kind: "unresolved"; taskIds: string[] }
  | {
      kind: "resolved";
      /** Total recipe requirement, before crediting any performed work. */
      requiredQuantity: number;
      completedQuantity: number;
      remainingQuantity: number;
      /** Work already covered by other open tasks, including manual edits. */
      otherOpenQuantity: number;
      targetTaskId?: string;
      targetQuantity: number;
      targetUnit: string;
      completedTaskIds: string[];
    };

const round = (quantity: number) => Math.round(quantity * 10_000) / 10_000;
const activePriority = (task: PrepWorkRecord) =>
  task.status === "in_progress" ? 0 : task.status === "claimed" ? 1 : 2;

/**
 * Balance ONE exact event-menu line and recipe step. Callers must group by those
 * identities, never by a dish/task name. This plans work, not ingredient demand.
 * It does not mutate completed records, manual edits, or other open tasks.
 */
export function prepWorkBalance(
  requiredQuantity: number,
  requiredUnit: string,
  records: readonly PrepWorkRecord[],
): PrepWorkBalance {
  if (!Number.isFinite(requiredQuantity) || requiredQuantity < 0)
    throw new Error("Required prep quantity must be finite and nonnegative");
  const tasks = records.filter(
    (task) => task.deletedAt == null && task.status !== "cancelled",
  );
  const amounts = new Map<string, number>();
  const unresolved: string[] = [];
  for (const task of tasks) {
    const quantity =
      task.status === "completed"
        ? (task.completedQuantity ?? task.quantity)
        : task.quantity;
    const ratio = recipeUnitRatio(task.unit, requiredUnit);
    if (ratio == null || !Number.isFinite(quantity) || quantity < 0) {
      unresolved.push(task.id);
    } else {
      amounts.set(task.id, quantity * ratio);
    }
  }
  if (unresolved.length) return { kind: "unresolved", taskIds: unresolved };

  const completed = tasks.filter((task) => task.status === "completed");
  const open = tasks.filter((task) => task.status !== "completed");
  // Keep work that is already underway as the balance row before an unclaimed
  // row. A stable identity tiebreak makes input ordering irrelevant.
  const target = open
    .filter((task) => task.isGenerated)
    .sort(
      (a, b) =>
        activePriority(a) - activePriority(b) || a.id.localeCompare(b.id),
    )[0];
  const completedQuantity = completed.reduce(
    (total, task) => total + amounts.get(task.id)!,
    0,
  );
  const otherOpenQuantity = open
    .filter((task) => task.id !== target?.id)
    .reduce((total, task) => total + amounts.get(task.id)!, 0);
  const remainingQuantity = Math.max(0, requiredQuantity - completedQuantity);
  const targetUnit = target?.unit ?? requiredUnit;
  const targetRatio = recipeUnitRatio(requiredUnit, targetUnit)!;
  return {
    kind: "resolved",
    requiredQuantity: round(requiredQuantity),
    completedQuantity: round(completedQuantity),
    remainingQuantity: round(remainingQuantity),
    otherOpenQuantity: round(otherOpenQuantity),
    ...(target ? { targetTaskId: target.id } : {}),
    targetQuantity: round(
      Math.max(0, remainingQuantity - otherOpenQuantity) * targetRatio,
    ),
    targetUnit,
    completedTaskIds: completed.map((task) => task.id).sort(),
  };
}
