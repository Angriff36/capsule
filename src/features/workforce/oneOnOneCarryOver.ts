// "Open actions appear in the next meeting" (spec §9.5): the still-open
// follow-ups from a staff member's PRIOR held meetings, matched by the
// meeting's id, not by action owner (a follow-up from their meeting may be
// owned by the manager or another participant). Closing an action changes
// only the action row, so the earlier meeting record never moves.

type MeetingRow = {
  _id: string;
  staffMemberId: string;
  heldAt?: number | null;
  deletedAt?: number | null;
};

type ActionRow = {
  oneOnOneId: string;
  status: string;
  deletedAt?: number | null;
};

export function openActionsForNextMeeting<A extends ActionRow>(
  meetings: readonly MeetingRow[] | undefined,
  actions: readonly A[] | undefined,
  staffMemberId: string,
): A[] {
  if (!staffMemberId) return [];
  const priorMeetingIds = new Set(
    (meetings ?? [])
      .filter(
        (meeting) =>
          meeting.deletedAt == null &&
          meeting.heldAt != null &&
          meeting.staffMemberId === staffMemberId,
      )
      .map((meeting) => meeting._id),
  );
  return (actions ?? []).filter(
    (row) =>
      row.deletedAt == null &&
      row.status === "open" &&
      priorMeetingIds.has(row.oneOnOneId),
  );
}
