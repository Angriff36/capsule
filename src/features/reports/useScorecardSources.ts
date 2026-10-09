import { useMemo } from "react";
import {
  useListEquipmentMaintenanceTask,
  useListIncident,
  useListPerson,
  useListWasteRecord,
} from "@/lib/manifest-convex-react";
import { useEventsInRange } from "../facilities/useEventsById";
import {
  useCanReadTable,
  useCloseoutsInRange,
  useLeadsInRange,
  useWindowRows,
} from "@/lib/financeScopedQueries";
import { acceptedProposalIds } from "./dashboardRecordSets";
import type { ScorecardSources } from "./scorecardCounts";
import { earliestTrendStart, periodWindow } from "./scorecardPeriods";

/** Open quotes are counted up to this far ahead. */
const PIPELINE_AHEAD_DAYS = 730;

/**
 * Every row the scorecard counts, for the Company Scorecard and the L10
 * page alike: from the start of the longest trend (four quarters back) to
 * the end of this week, and events up to two years ahead for the pipeline.
 * `events` is undefined while loading. A source this role may not read stays
 * undefined, so its numbers say "Not known yet" rather than zero.
 */
export function useScorecardSources(now: Date): {
  sources: ScorecardSources;
  loading: boolean;
} {
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayKey = day.getTime();
  const windows = useMemo(() => {
    const ref = new Date(dayKey);
    const from = earliestTrendStart(ref);
    const weekEnd = periodWindow("week", ref).to;
    return {
      past: { from, to: weekEnd },
      events: { from, to: dayKey + PIPELINE_AHEAD_DAYS * 86_400_000 },
      prep: {
        fields: ["dueAt"],
        ranges: [{ from: periodWindow("week", ref, 11).from, to: weekEnd }],
      },
      shifts: {
        fields: ["startsAt"],
        ranges: [{ from: periodWindow("week", ref, 11).from, to: weekEnd }],
      },
    };
  }, [dayKey]);

  const events = useEventsInRange(windows.events);
  const closeouts = useCloseoutsInRange(windows.past);
  const { leads, proposals } = useLeadsInRange(windows.past);
  const canReadPrep = useCanReadTable("prepTasks");
  const canReadShifts = useCanReadTable("shifts");
  const prepTasks = useWindowRows(
    "prepTasks",
    canReadPrep ? windows.prep : null,
  );
  const shifts = useWindowRows("shifts", canReadShifts ? windows.shifts : null);
  const incidents = useListIncident();
  const waste = useListWasteRecord();
  const people = useListPerson();
  const maintenance = useListEquipmentMaintenanceTask();

  const sources = useMemo<ScorecardSources>(
    () => ({
      events: events ?? [],
      closeouts: closeouts ?? [],
      leads: leads ?? [],
      acceptedProposalIds: acceptedProposalIds(proposals),
      incidents: incidents?.map((row) => ({
        ...row,
        eventId: String(row.eventId),
      })),
      shifts,
      prepTasks,
      waste,
      people,
      maintenance,
    }),
    [
      events,
      closeouts,
      leads,
      proposals,
      incidents,
      shifts,
      prepTasks,
      waste,
      people,
      maintenance,
    ],
  );
  return { sources, loading: events === undefined };
}
