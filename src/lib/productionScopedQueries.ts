import { usePaginatedQuery, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { api, type Id } from "./api";

// Indexed reads for the kitchen screens (convex/productionWindow.ts), never
// the company's whole prep task, link, check, comment or batch lists.
// Production features must not import convex/react; call these.

/**
 * Open prep tasks (any date), the tasks of their events and of the events
 * starting in the window, their links, checks and comments. Pass "skip"
 * while the window is unknown. `undefined` while loading.
 */
export function usePrepWork(window: { from?: number; to?: number } | "skip") {
  return useQuery(api.productionWindow.prepWork, window);
}

/** Prep tasks, links, batches and shares of every unfinished event. */
export function usePlanWork() {
  return useQuery(api.productionWindow.planWork, {});
}

/**
 * Batches created at or after `since` (the yield report's period start
 * less the planning lead). Pass "skip" while unknown.
 */
export function useBatchesSince(since: number | "skip") {
  return useQuery(
    api.productionWindow.batchesSince,
    since === "skip" ? "skip" : { since },
  );
}

/** Every planned and in-progress batch, house or event. */
export function useOpenBatches() {
  return useQuery(api.productionWindow.openBatches, {});
}

const PAGE = 50;

/**
 * Finished batches still owing or done in the last day, newest first, a
 * page at a time. `batches` is undefined until the first page arrives.
 */
export function useFinishedBatches() {
  const [now] = useState(() => Date.now());
  const { results, status, loadMore } = usePaginatedQuery(
    api.productionWindow.finishedBatchesPage,
    { now },
    { initialNumItems: PAGE },
  );
  return {
    batches: status === "LoadingFirstPage" ? undefined : results,
    canLoadMore: status === "CanLoadMore",
    loadingMore: status === "LoadingMore",
    loadMore: () => loadMore(PAGE),
  };
}

/** Live batch shares with their batch, newest first, a page at a time. */
export function useBatchShares() {
  const { results, status, loadMore } = usePaginatedQuery(
    api.productionWindow.sharesPage,
    {},
    { initialNumItems: PAGE },
  );
  return {
    shares: status === "LoadingFirstPage" ? undefined : results,
    canLoadMore: status === "CanLoadMore",
    loadingMore: status === "LoadingMore",
    loadMore: () => loadMore(PAGE),
  };
}

/** One prep task's comments. */
export function usePrepTaskComments(prepTaskId: string | "skip") {
  return useQuery(
    api.queries.listPrepTaskCommentByPrepTaskId,
    prepTaskId === "skip"
      ? "skip"
      : { prepTaskId: prepTaskId as Id<"prepTasks"> },
  );
}
