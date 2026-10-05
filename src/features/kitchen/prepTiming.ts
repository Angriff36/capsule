/**
 * How a prep task's time and progress read on kitchen and staff screens
 * (PL-PREP, AC-489 / AC-492). A task with no prep time says so; it never
 * borrows the event start. Progress counts finished work on the same step
 * of the same menu line.
 */
import { formatDate, formatTime } from "../../lib/format";
import { prepQuantityLabel } from "./prepQuantityLabel";

export const NO_PREP_TIME = "No prep time set";

export function prepTimeLabel(dueAt: number | null | undefined): string {
  return dueAt == null
    ? NO_PREP_TIME
    : `Due ${formatDate(dueAt)} ${formatTime(dueAt)}`;
}

type StepTask = {
  _id: string;
  eventDishId?: string | null;
  dishTaskId?: string | null;
  status: unknown;
  quantity: number;
  completedQuantity?: number | null;
  unit: unknown;
  deletedAt?: number | null;
};

/**
 * "20 portion already made" for an open task whose step already has finished
 * work; null when nothing of this step was finished yet.
 */
export function prepMadeSoFarLabel(
  task: StepTask,
  tasks: readonly StepTask[],
): string | null {
  if (!task.dishTaskId || String(task.status) === "completed") return null;
  const made = tasks
    .filter(
      (row) =>
        row._id !== task._id &&
        row.deletedAt == null &&
        String(row.status) === "completed" &&
        row.eventDishId === task.eventDishId &&
        row.dishTaskId === task.dishTaskId &&
        String(row.unit) === String(task.unit),
    )
    .reduce((sum, row) => sum + (row.completedQuantity ?? row.quantity), 0);
  if (made <= 0) return null;
  return `${prepQuantityLabel(made, String(task.unit))} ${String(task.unit)} already made`;
}
