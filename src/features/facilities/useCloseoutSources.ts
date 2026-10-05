// Seam hooks for the authored convex/closeoutSources.ts (PL-CLOSEOUT). They
// live in facilities (the unguarded seam-hook home, like useLaborSummary)
// because the finance feature guard forbids direct convex/react there.
//
// Reads resolve to `null` when the caller may not see closeout money.
import { useMutation, useQuery } from "convex/react";
import { api } from "../../lib/api";
import type {
  CloseoutLineKey,
  CloseoutProjection,
} from "../../lib/closeoutSourceProjection";

export type CloseoutSources = {
  projection: CloseoutProjection;
  closeout: {
    _id: string;
    version: number;
    status: string;
    revision: number;
  } | null;
};

export type CloseoutResult = {
  revision: number;
  kind: "finalized" | "corrected";
  reason: string | null;
  at: number;
  actualRevenue: number;
  totalActualCost: number;
  grossProfit: number;
  actualHeadcount: number | null;
  sourceSnapshot: string | null;
};

export type EnteredAmounts = Partial<Record<CloseoutLineKey, number>>;

export function useEventCloseoutSources(
  eventId: string | null,
): CloseoutSources | null | undefined {
  return useQuery(
    api.closeoutSources.eventCloseoutSources,
    eventId ? { eventId: eventId as never } : "skip",
  ) as CloseoutSources | null | undefined;
}

export function useCloseoutResults(
  closeoutId: string | null,
): CloseoutResult[] | null | undefined {
  return useQuery(
    api.closeoutSources.closeoutResults,
    closeoutId ? { closeoutId: closeoutId as never } : "skip",
  ) as CloseoutResult[] | null | undefined;
}

export function useCaptureCloseoutFromSources() {
  const capture = useMutation(api.closeoutSources.captureCloseoutFromSources);
  return (args: {
    eventId: string;
    entered: EnteredAmounts;
    unresolvedIssues?: string;
    performanceNotes?: string;
    notes?: string;
  }) => capture({ ...args, eventId: args.eventId as never });
}

export function useCorrectCloseoutFromSources() {
  const correct = useMutation(api.closeoutSources.correctCloseoutFromSources);
  return (args: {
    closeoutId: string;
    reason: string;
    entered: EnteredAmounts;
  }) => correct({ ...args, closeoutId: args.closeoutId as never });
}
