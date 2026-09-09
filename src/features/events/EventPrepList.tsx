import type { ReactNode } from "react";
import type {
  useListEventDish,
  useListPrepTask,
  useListDish,
  useListComponent,
  useListPerson,
} from "../../lib/manifest-convex-react";
import { CulinaryEntityLink } from "../kitchen/CulinaryEntityLink";
import { readableRecipeAmount, recipeNoteLines } from "../kitchen/RecipeNotes";
import { displayEventMenuNotes } from "./eventMenuLineFields";
import { suspectPrepQuantityFlag } from "./eventMenuSuspectQuantity";

type Selection = NonNullable<ReturnType<typeof useListEventDish>>[number];
type Task = NonNullable<ReturnType<typeof useListPrepTask>>[number];
type Group = { key: string; selection?: Selection; tasks: Task[] };

/** An explicit menu-line reference must never fall through to another serving plan. */
export function groupEventPrep(
  selections: Selection[],
  tasks: Task[],
): Group[] {
  const groups = new Map<string, Group>(
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

const labels: Record<string, string> = {
  finish_at_event: "Finish at event",
  from_recipe: "Recipe prep",
  in_progress: "In progress",
  pending: "Pending",
  claimed: "Claimed",
  blocked: "Blocked",
  completed: "Completed",
};
const label = (value: string) => labels[value] ?? value.replaceAll("_", " ");

export function EventPrepList({
  selections,
  tasks,
  dishes,
  components,
  people,
  recipeFlags,
  renderQuantityFlags,
}: {
  selections: Selection[];
  tasks: Task[];
  dishes: NonNullable<ReturnType<typeof useListDish>>;
  components: NonNullable<ReturnType<typeof useListComponent>>;
  people: NonNullable<ReturnType<typeof useListPerson>>;
  recipeFlags: Map<string, string[]>;
  renderQuantityFlags: (flags: string[]) => ReactNode;
}) {
  const dishById = new Map(dishes.map((dish) => [String(dish._id), dish]));
  const componentById = new Map(
    components.map((component) => [String(component._id), component]),
  );
  const personById = new Map(
    people.map((person) => [String(person._id), person]),
  );
  return (
    <div className="space-y-8">
      {groupEventPrep(selections, tasks).map((group) => {
        const selection = group.selection;
        const dishId = selection?.dishId ?? group.tasks[0]?.dishId;
        const dish = dishId ? dishById.get(dishId) : undefined;
        const categories = [
          ...new Set(group.tasks.map((task) => task.category).filter(Boolean)),
        ];
        return (
          <section
            key={group.key}
            className="min-w-0 border-t border-line pt-4"
            data-testid="event-prep-dish"
          >
            <header className="space-y-1">
              <p className="text-sm text-ink-2">
                {[selection?.course, ...categories.map(label)]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h3 className="text-lg font-semibold text-ink">
                  {dish ? (
                    <CulinaryEntityLink
                      kind="dish"
                      id={dish._id}
                      className="inline-flex min-h-11 items-center text-accent hover:underline"
                    >
                      {dish.name}
                    </CulinaryEntityLink>
                  ) : (
                    "Event prep"
                  )}
                </h3>
                <p className="text-base font-medium text-ink">
                  {selection
                    ? `${selection.quantityServings} servings`
                    : "Not linked to a current menu line"}
                </p>
              </div>
              {recipeNoteLines(
                displayEventMenuNotes(selection?.specialInstructions),
              ).map((line) => (
                <p
                  key={line}
                  className="whitespace-pre-wrap break-words text-base text-ink-2"
                >
                  {line}
                </p>
              ))}
              {renderQuantityFlags(recipeFlags.get(group.key) ?? [])}
            </header>
            {group.tasks.length === 0 ? (
              <p className="py-4 text-base text-ink-2">
                No prep steps recorded for this dish.
              </p>
            ) : (
              <ol className="divide-y divide-line">
                {group.tasks.map((task) => {
                  const component = task.componentId
                    ? componentById.get(task.componentId)
                    : undefined;
                  const person = task.assignedToId
                    ? personById.get(task.assignedToId)
                    : undefined;
                  const flag = suspectPrepQuantityFlag({
                    name: task.name,
                    unit: task.unit,
                    quantity: task.quantity,
                    servings: selection?.quantityServings,
                  });
                  const notes = [
                    ...new Set([
                      ...recipeNoteLines(
                        displayEventMenuNotes(task.specialInstructions),
                        task.name,
                      ),
                      ...recipeNoteLines(task.notes ?? "", task.name),
                    ]),
                  ];
                  return (
                    <li
                      key={task._id}
                      className="grid min-w-0 gap-2 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-4"
                      data-testid="event-prep-task"
                    >
                      <div className="min-w-0 space-y-1">
                        <h4 className="break-words text-base font-medium text-ink">
                          {task.name}
                        </h4>
                        {notes.map((line) => (
                          <p
                            key={line}
                            className="whitespace-pre-wrap break-words text-base text-ink-2"
                          >
                            {line}
                          </p>
                        ))}
                        {task.componentId ? (
                          <CulinaryEntityLink
                            kind="component"
                            id={task.componentId}
                            className="inline-flex min-h-11 items-center text-base text-accent underline underline-offset-2"
                          >
                            Recipe: {component?.name ?? task.name}
                          </CulinaryEntityLink>
                        ) : null}
                        <p className="text-sm text-ink-2">
                          {[
                            label(task.status),
                            task.station,
                            person
                              ? `${person.givenName} ${person.familyName}`.trim()
                              : task.assignedToId
                                ? "Assigned"
                                : "Unassigned",
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                        {task.blockReason ? (
                          <p className="text-base text-danger">
                            Blocked: {task.blockReason}
                          </p>
                        ) : null}
                        {flag ? renderQuantityFlags([flag]) : null}
                      </div>
                      <div className="text-base text-ink sm:text-right">
                        <p className="font-medium">
                          {readableRecipeAmount(task.quantity, task.unit)}
                        </p>
                        {task.completedQuantity != null ? (
                          <p className="text-sm text-ink-2">
                            {readableRecipeAmount(
                              task.completedQuantity,
                              task.unit,
                            )}{" "}
                            completed
                          </p>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        );
      })}
    </div>
  );
}
