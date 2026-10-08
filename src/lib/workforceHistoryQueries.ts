import { useMemo, useRef } from "react";
import { usePaginatedQuery, useQuery } from "convex/react";
import { api } from "./api";

// Staff and admin history screens read the newest page with more on request,
// the rows of the records on screen, and counts made on the server
// (convex/workforceHistoryWindow.ts), never the company's whole tables.

/** Rows per "Load more". */
export const HISTORY_PAGE = 50;

/** `rows` is `undefined` while the first page loads. */
function pages<T>({
  results,
  status,
  loadMore,
}: {
  results: T[];
  status: string;
  loadMore: (numItems: number) => void;
}) {
  return {
    rows: status === "LoadingFirstPage" ? undefined : results,
    canLoadMore: status === "CanLoadMore",
    loadMore: () => loadMore(HISTORY_PAGE),
  };
}

const first = { initialNumItems: HISTORY_PAGE };

/** Sorted unique ids, stable while the set is the same. */
function useIdList(ids: ReadonlyArray<string | null | undefined>): string[] {
  const key = [...new Set(ids.filter((id): id is string => !!id))]
    .sort()
    .join(",");
  return useMemo(() => (key ? key.split(",") : []), [key]);
}

/** The last answer while new ids load, so "Load more" does not blank it. */
function useKept<T>(rows: T | undefined): T | undefined {
  const kept = useRef(rows);
  if (rows !== undefined) kept.current = rows;
  return rows ?? kept.current;
}

export const useCandidatePages = () =>
  pages(usePaginatedQuery(api.workforceHistoryWindow.candidatePage, {}, first));

/** Interviews of the candidates on screen; `undefined` while they load. */
export function useInterviewsFor(
  candidateIds: ReadonlyArray<string> | undefined,
) {
  const ids = useIdList(candidateIds ?? []);
  return useKept(
    useQuery(
      api.workforceHistoryWindow.interviewsFor,
      candidateIds === undefined ? "skip" : { candidateIds: ids },
    ),
  );
}

export const useOneOnOnePages = () =>
  pages(usePaginatedQuery(api.workforceHistoryWindow.oneOnOnePage, {}, first));

/**
 * Actions of the meetings on screen, plus the held meetings and actions of
 * the staff member a new meeting is being held with.
 */
export function useOneOnOneActionsFor(
  oneOnOneIds: ReadonlyArray<string> | undefined,
  staffMemberId: string,
) {
  const ids = useIdList(oneOnOneIds ?? []);
  return useKept(
    useQuery(
      api.workforceHistoryWindow.oneOnOneActionsFor,
      oneOnOneIds === undefined ? "skip" : { oneOnOneIds: ids, staffMemberId },
    ),
  );
}

export const usePerformanceReviewPages = () =>
  pages(
    usePaginatedQuery(
      api.workforceHistoryWindow.performanceReviewPage,
      {},
      first,
    ),
  );

export const useTrainingCompletionPages = () =>
  pages(
    usePaginatedQuery(
      api.workforceHistoryWindow.trainingCompletionPage,
      {},
      first,
    ),
  );

/** Recorded completions per module and in all. */
export function useTrainingCompletionCounts() {
  return useQuery(api.workforceHistoryWindow.trainingCompletionCounts, {});
}

export const useTrainingSignOffPages = () =>
  pages(
    usePaginatedQuery(
      api.workforceHistoryWindow.trainingSignOffPage,
      {},
      first,
    ),
  );

export const useAnnouncementPages = () =>
  pages(
    usePaginatedQuery(api.workforceHistoryWindow.announcementPage, {}, first),
  );

const HOUR_MS = 3_600_000;

/**
 * Announcements not yet expired. The server cut moves once an hour (so the
 * read is not redone on every render); callers check expiry against the
 * clock themselves.
 */
export function useActiveAnnouncements() {
  const now = Math.floor(Date.now() / HOUR_MS) * HOUR_MS;
  return useQuery(api.workforceHistoryWindow.activeAnnouncements, { now });
}

/** Import conflicts still waiting for a person. */
export function usePendingImportConflicts() {
  return useQuery(api.workforceHistoryWindow.pendingImportConflicts, {});
}
