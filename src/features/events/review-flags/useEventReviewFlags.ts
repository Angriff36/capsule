import { useMemo } from "react";
import {
  useCreateReviewFlag,
  useListReviewFlag,
  useReviewFlagDismiss,
  useReviewFlagMarkResolved,
  useReviewFlagReopen,
} from "../../../lib/manifest-convex-react";

export type ReviewFlagTargetKind =
  | "whole_event"
  | "menu_line"
  | "timeline_activity"
  | "equipment_reservation"
  | "staff_need"
  | "assignment"
  | "pack_list_item";

export type ReviewFlagRow = {
  _id: string;
  version: number;
  eventId: string;
  targetKind: ReviewFlagTargetKind;
  targetId?: string | null;
  targetLabel: string;
  question: string;
  resolution?: string | null;
  status: "open" | "resolved" | "dismissed";
  raisedAt?: number | null;
  settledAt?: number | null;
  deletedAt?: number | null;
};

export const REVIEW_FLAG_TARGET_LABEL: Record<ReviewFlagTargetKind, string> = {
  whole_event: "Event",
  menu_line: "Menu line",
  timeline_activity: "Timeline block",
  equipment_reservation: "Equipment",
  staff_need: "Open shift",
  assignment: "Staff assignment",
  pack_list_item: "Pack list item",
};

/** Key for the per-target lookup: kind + id, or just kind for the event. */
export function reviewFlagTargetKey(
  kind: ReviewFlagTargetKind,
  targetId?: string | null,
): string {
  return targetId ? `${kind}:${targetId}` : kind;
}

/**
 * The event's review flags plus the four actions, ready for any tab to use.
 * `flagsFor` answers "does this row have an open question?" per row.
 */
export function useEventReviewFlags(eventId: string) {
  const all = useListReviewFlag() as ReviewFlagRow[] | undefined;
  const raise = useCreateReviewFlag();
  const markResolved = useReviewFlagMarkResolved();
  const dismiss = useReviewFlagDismiss();
  const reopen = useReviewFlagReopen();

  const flags = useMemo(
    () =>
      (all ?? [])
        .filter((row) => row.eventId === eventId && row.deletedAt == null)
        .sort((a, b) => (b.raisedAt ?? 0) - (a.raisedAt ?? 0)),
    [all, eventId],
  );

  const byTarget = useMemo(() => {
    const map = new Map<string, ReviewFlagRow[]>();
    for (const flag of flags) {
      const key = reviewFlagTargetKey(flag.targetKind, flag.targetId);
      map.set(key, [...(map.get(key) ?? []), flag]);
    }
    return map;
  }, [flags]);

  return {
    loading: all === undefined,
    flags,
    openFlags: flags.filter((flag) => flag.status === "open"),
    flagsFor: (kind: ReviewFlagTargetKind, targetId?: string | null) =>
      byTarget.get(reviewFlagTargetKey(kind, targetId)) ?? [],
    raise: (args: {
      targetKind: ReviewFlagTargetKind;
      targetId?: string;
      targetLabel: string;
      question: string;
    }) =>
      raise({
        eventId,
        targetKind: args.targetKind,
        targetId: args.targetId,
        targetLabel: args.targetLabel,
        question: args.question,
      }),
    markResolved: (flag: ReviewFlagRow, resolution: string) =>
      markResolved({ docId: flag._id, version: flag.version, resolution }),
    dismiss: (flag: ReviewFlagRow, reason?: string) =>
      dismiss({ docId: flag._id, version: flag.version, reason }),
    reopen: (flag: ReviewFlagRow) =>
      reopen({ docId: flag._id, version: flag.version }),
  };
}

export type EventReviewFlags = ReturnType<typeof useEventReviewFlags>;
