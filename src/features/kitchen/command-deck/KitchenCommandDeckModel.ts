import type { KitchenCommandDeckHorizon } from "./KitchenCommandDeckHorizon";
import type {
  CommandDeckFilter,
  CrewLoadRow,
  DishLike,
  EventDishLike,
  EventLike,
  EventProgress,
  PersonLike,
  PrepTaskLike,
} from "./KitchenCommandDeckTypes";

export class KitchenCommandDeckModel {
  constructor(
    private readonly events: EventLike[],
    private readonly eventDishes: EventDishLike[],
    private readonly dishes: DishLike[],
    private readonly tasks: PrepTaskLike[],
    private readonly people: PersonLike[],
    private readonly horizon: KitchenCommandDeckHorizon,
  ) {}

  personLabel(person: PersonLike | undefined | null): string {
    if (!person) return "Unassigned";
    const name = [person.givenName, person.familyName]
      .filter(Boolean)
      .join(" ");
    return name || person._id.slice(0, 8);
  }

  findPerson(id: string | null | undefined): PersonLike | undefined {
    if (!id) return undefined;
    return this.people.find((p) => p._id === id && p.deletedAt == null);
  }

  horizonEvents(): EventLike[] {
    return this.events
      .filter((e) => e.deletedAt == null && this.horizon.contains(e.startsAt))
      .sort((a, b) => Number(a.startsAt) - Number(b.startsAt));
  }

  tasksForEvent(eventId: string): PrepTaskLike[] {
    // Pulling a dish mid-service stands its prep down, but work already
    // completed keeps its record rather than being cancelled. Those tasks are
    // no longer on any dish card, so counting them here made the header
    // ("2/14") disagree with the dishes listed under it (0/4 + 0/8).
    const liveSelections = new Set(
      this.selections(eventId).map((row) => row._id),
    );
    return this.tasks.filter(
      (t) =>
        t.deletedAt == null &&
        t.eventId === eventId &&
        t.status !== "cancelled" &&
        liveSelections.has(t.eventDishId),
    );
  }

  progress(eventId: string): EventProgress {
    const rows = this.tasksForEvent(eventId);
    const completed = rows.filter((t) => t.status === "completed").length;
    const total = rows.length;
    return {
      total,
      completed,
      pct: total ? Math.round((completed / total) * 100) : 0,
    };
  }

  selections(eventId: string): EventDishLike[] {
    return this.eventDishes.filter(
      (row) => row.deletedAt == null && row.eventId === eventId,
    );
  }

  dishFor(selection: EventDishLike): DishLike | undefined {
    return this.dishes.find(
      (d) => d._id === selection.dishId && d.deletedAt == null,
    );
  }

  tasksForSelection(
    selectionId: string,
    filter: CommandDeckFilter,
    assigneeFilter: string,
  ): PrepTaskLike[] {
    return this.tasks
      .filter(
        (t) =>
          t.deletedAt == null &&
          t.eventDishId === selectionId &&
          t.status !== "cancelled" &&
          this.matchesFilter(t, filter) &&
          (!assigneeFilter || t.assignedToId === assigneeFilter),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  matchesFilter(task: PrepTaskLike, filter: CommandDeckFilter): boolean {
    const cat = (task.category ?? "").toLowerCase();
    switch (filter) {
      case "all":
        return true;
      case "kitchen":
        return cat.includes("kitchen") || cat.includes("finish_at_kitchen");
      case "event":
        return (
          cat.includes("event") ||
          cat.includes("finish_at_event") ||
          cat.includes("apps") ||
          cat.includes("drop")
        );
      case "unassigned":
        return !task.assignedToId && task.status !== "completed";
      case "blocked":
        return task.status === "blocked";
      case "mine":
        return false; // resolved by caller with current user id
      default:
        return true;
    }
  }

  filterTasks(
    eventId: string,
    filter: CommandDeckFilter,
    assigneeFilter: string,
    currentUserId?: string | null,
  ): PrepTaskLike[] {
    return this.tasksForEvent(eventId).filter((t) => {
      if (assigneeFilter && t.assignedToId !== assigneeFilter) return false;
      if (filter === "mine")
        return !!currentUserId && t.assignedToId === currentUserId;
      return this.matchesFilter(t, filter);
    });
  }

  crewLoad(eventIds: string[]): CrewLoadRow[] {
    const eventSet = new Set(eventIds);
    const activePeople = this.people.filter((p) => p.deletedAt == null);
    return activePeople
      .map((person) => {
        let open = 0;
        let claimed = 0;
        let inProgress = 0;
        let completed = 0;
        for (const t of this.tasks) {
          if (t.deletedAt != null || t.assignedToId !== person._id) continue;
          if (!eventSet.has(t.eventId)) continue;
          if (t.status === "cancelled") continue;
          if (t.status === "completed") completed += 1;
          else if (t.status === "in_progress") inProgress += 1;
          else if (t.status === "claimed") claimed += 1;
          else open += 1;
        }
        const load = open + claimed + inProgress;
        return { person, open, claimed, inProgress, completed, load };
      })
      .filter((row) => row.load > 0 || row.completed > 0)
      .sort(
        (a, b) =>
          b.load - a.load ||
          this.personLabel(a.person).localeCompare(this.personLabel(b.person)),
      );
  }

  assignableTasks(tasks: PrepTaskLike[]): PrepTaskLike[] {
    return tasks.filter(
      (t) => t.status === "pending" || t.status === "claimed",
    );
  }
}
