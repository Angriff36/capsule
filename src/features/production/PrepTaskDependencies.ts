export interface PrepTaskDependencyTask {
  _id: string;
  name?: string | null;
  status?: unknown;
}

export interface PrepTaskDependencyLink {
  dependentTaskId: string;
  predecessorTaskId: string;
}

export interface PrepTaskDependencySummary {
  total: number;
  unresolved: number;
  blockerNames: string[];
  isBlocked: boolean;
}

const EMPTY_SUMMARY: PrepTaskDependencySummary = {
  total: 0,
  unresolved: 0,
  blockerNames: [],
  isBlocked: false,
};

export function prepTaskDependencySummary(
  taskId: string,
  tasks: readonly PrepTaskDependencyTask[],
  links: readonly PrepTaskDependencyLink[],
): PrepTaskDependencySummary {
  const incoming = links.filter((link) => link.dependentTaskId === taskId);
  if (incoming.length === 0) return EMPTY_SUMMARY;

  const tasksById = new Map(tasks.map((task) => [task._id, task]));
  const blockers = incoming.filter(
    (link) =>
      String(tasksById.get(link.predecessorTaskId)?.status) !== "completed",
  );
  const blockerNames = Array.from(
    new Set(
      blockers.map((link) => {
        const task = tasksById.get(link.predecessorTaskId);
        return task?.name?.trim() || "Unavailable prep task";
      }),
    ),
  );

  return {
    total: incoming.length,
    unresolved: blockers.length,
    blockerNames,
    isBlocked: blockers.length > 0,
  };
}

export function prepTaskDependencyLabel(
  summary: PrepTaskDependencySummary,
): string {
  if (!summary.isBlocked) {
    return summary.total === 0
      ? "No predecessors"
      : `${summary.total} ${summary.total === 1 ? "predecessor" : "predecessors"} complete`;
  }

  const names = summary.blockerNames.join(", ");
  return `Waiting on ${names}`;
}
