export interface PrepTaskDependencyTask {
  _id: string;
  name?: string | null;
  status?: unknown;
}

export interface PrepTaskDependencyLink {
  _id?: string;
  dependentTaskId: string;
  predecessorTaskId: string;
  /** Set when a person dropped the link or its step left the recipe. */
  requirementReleasedAt?: number | null;
}

type LinkEnd = "dependentTaskId" | "predecessorTaskId";

/** Links that still hold the waiting task back. */
const holding = (links: readonly PrepTaskDependencyLink[]) =>
  links.filter((link) => link.requirementReleasedAt == null);

export interface PrepTaskDependencySummary {
  total: number;
  unresolved: number;
  blockerNames: string[];
  isBlocked: boolean;
  /** Other tasks in a waiting loop with this one; empty when there is none. */
  loopNames: string[];
}

const EMPTY_SUMMARY: PrepTaskDependencySummary = {
  total: 0,
  unresolved: 0,
  blockerNames: [],
  isBlocked: false,
  loopNames: [],
};

function reachable(
  start: string,
  links: readonly PrepTaskDependencyLink[],
  from: LinkEnd,
  to: LinkEnd,
): Set<string> {
  const seen = new Set<string>();
  const queue = [start];
  while (queue.length) {
    const current = queue.pop()!;
    for (const link of links) {
      if (link[from] !== current || seen.has(link[to])) continue;
      seen.add(link[to]);
      queue.push(link[to]);
    }
  }
  return seen;
}

/**
 * Tasks that wait on this task and that this task (through its chain) also
 * waits on. None of them can ever start. Only this loop is stuck; tasks
 * outside it are not affected.
 */
export function prepTaskDependencyLoop(
  taskId: string,
  allLinks: readonly PrepTaskDependencyLink[],
): string[] {
  const links = holding(allLinks);
  const upstream = reachable(
    taskId,
    links,
    "dependentTaskId",
    "predecessorTaskId",
  );
  if (!upstream.has(taskId)) return [];
  const downstream = reachable(
    taskId,
    links,
    "predecessorTaskId",
    "dependentTaskId",
  );
  return [...upstream].filter((id) => downstream.has(id)).sort();
}

/** This task's own links into its loop: dropping any one of them frees it. */
export function prepTaskDependencyLoopLinks<T extends PrepTaskDependencyLink>(
  taskId: string,
  links: readonly T[],
): T[] {
  const loop = new Set(prepTaskDependencyLoop(taskId, links));
  return holding(links).filter(
    (link) =>
      link.dependentTaskId === taskId && loop.has(link.predecessorTaskId),
  ) as T[];
}

export function prepTaskDependencySummary(
  taskId: string,
  tasks: readonly PrepTaskDependencyTask[],
  allLinks: readonly PrepTaskDependencyLink[],
): PrepTaskDependencySummary {
  const links = holding(allLinks);
  const incoming = links.filter((link) => link.dependentTaskId === taskId);
  if (incoming.length === 0) return EMPTY_SUMMARY;

  const tasksById = new Map(tasks.map((task) => [task._id, task]));
  const taskName = (id: string) =>
    tasksById.get(id)?.name?.trim() || "Unavailable prep task";
  const loop = prepTaskDependencyLoop(taskId, links);
  if (loop.length)
    return {
      total: incoming.length,
      unresolved: incoming.length,
      blockerNames: [],
      isBlocked: true,
      loopNames: Array.from(
        new Set(loop.filter((id) => id !== taskId).map(taskName)),
      ),
    };
  const blockers = incoming.filter(
    (link) =>
      String(tasksById.get(link.predecessorTaskId)?.status) !== "completed",
  );
  const blockerNames = Array.from(
    new Set(blockers.map((link) => taskName(link.predecessorTaskId))),
  );

  return {
    total: incoming.length,
    unresolved: blockers.length,
    blockerNames,
    isBlocked: blockers.length > 0,
    loopNames: [],
  };
}

export function prepTaskDependencyLabel(
  summary: PrepTaskDependencySummary,
): string {
  if (summary.loopNames.length)
    return `Stuck in a loop: this task and ${summary.loopNames.join(", ")} each wait on the other. Remove one "must follow" link on the prep board.`;
  if (!summary.isBlocked) {
    return summary.total === 0
      ? "No predecessors"
      : `${summary.total} ${summary.total === 1 ? "predecessor" : "predecessors"} complete`;
  }

  const names = summary.blockerNames.join(", ");
  return `Waiting on ${names}`;
}
