type SelectionRef = { _id: string; dishId: string };
type TaskRef = { eventDishId?: string | null; dishId?: string | null };
type Group<S, T> = { key: string; selection?: S; tasks: T[] };

/** An explicit menu-line reference must never fall through to another serving plan. */
export function groupEventPrep<
  Selection extends SelectionRef,
  Task extends TaskRef,
>(selections: Selection[], tasks: Task[]): Group<Selection, Task>[] {
  const groups = new Map<string, Group<Selection, Task>>(
    selections.map((selection) => [
      selection._id,
      { key: selection._id, selection, tasks: [] },
    ]),
  );
  for (const task of tasks) {
    let group = task.eventDishId ? groups.get(task.eventDishId) : undefined;
    if (!task.eventDishId && task.dishId) {
      const matches = selections.filter(
        (selection) => selection.dishId === task.dishId,
      );
      if (matches.length === 1) group = groups.get(matches[0]._id);
    }
    if (!group) {
      const key = task.eventDishId || `unlinked:${task.dishId || "event"}`;
      group = groups.get(key);
      if (!group) {
        group = { key, tasks: [] };
        groups.set(key, group);
      }
    }
    group.tasks.push(task);
  }
  return [...groups.values()];
}
