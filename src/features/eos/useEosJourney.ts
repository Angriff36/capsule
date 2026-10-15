import { useMemo } from "react";
import {
  useListAccountabilitySeat,
  useListLeadershipItem,
  useListLeadershipMeeting,
} from "@/lib/manifest-convex-react";
import {
  liveMeetings,
  weekStartOf,
  type LeadershipItemRow,
  type LeadershipMeetingRow,
} from "../reports/leadershipHistory";
import { EosJourney } from "./EosJourney";
import { useCompanyVision, useVisionItems } from "./useEosData";

/** True once every live job on the chart has a person. */
export function useEosSeatsNamed(): boolean | undefined {
  const seats = useListAccountabilitySeat();
  if (seats === undefined) return undefined;
  const live = seats.filter((row) => row.placedAt != null);
  if (live.length === 0) return false;
  return live.every((row) => row.personId);
}

export function useEosJourney(now: Date) {
  const vision = useCompanyVision();
  const items = useVisionItems();
  const seats = useListAccountabilitySeat();
  const leadership = useListLeadershipItem() as LeadershipItemRow[] | undefined;
  const meetings = useListLeadershipMeeting() as
    LeadershipMeetingRow[] | undefined;

  return useMemo(() => {
    if (
      vision === undefined ||
      items === undefined ||
      seats === undefined ||
      leadership === undefined ||
      meetings === undefined
    ) {
      return undefined;
    }
    const liveSeats = seats.filter((row) => row.placedAt != null);
    const filledSeats = liveSeats.filter((row) => row.personId).length;
    const weekStart = weekStartOf(now).getTime();
    const last = liveMeetings(meetings)[0];
    const metThisWeek = last?.heldAt != null && last.heldAt >= weekStart;
    return new EosJourney({
      visionWritten: EosJourney.countVisionParts(vision, items),
      liveSeats: liveSeats.length,
      filledSeats,
      rocksThisQuarter: EosJourney.rocksThisQuarter(leadership, now),
      metThisWeek,
    });
  }, [vision, items, seats, leadership, meetings, now]);
}
