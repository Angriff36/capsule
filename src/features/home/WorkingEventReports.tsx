import { useMemo } from "react";
import { useGetClient, useGetEvent } from "../../lib/manifest-convex-react";
import { useAuthStatus } from "../../lib/useAuthStatus";
import { clientDisplayName } from "../events/clientName";
import {
  useReportRailRequest,
  useWorkingEventId,
} from "../events/workingEvent";
import {
  EventReportRail,
  useEventReportList,
  type ReportRailEvent,
} from "./EventReportRail";
import { shortRef } from "./homeCalendar";

/** The shell's report rail: the working event's reports on every screen. */
export function WorkingEventReports() {
  const id = useWorkingEventId();
  const event = useGetEvent(id ?? "skip");
  const client = useGetClient(event?.clientId ?? "skip");
  const authStatus = useAuthStatus();
  const { ids, chosen, toggle } = useEventReportList(
    authStatus?.personId ?? "anonymous",
  );
  const request = useReportRailRequest();

  const railEvent = useMemo<ReportRailEvent | null>(
    () =>
      id && event && event.deletedAt == null
        ? {
            id: event._id,
            title: event.title,
            eventNumber: shortRef(event._id),
            client: clientDisplayName(
              event.clientId,
              client ? [client] : undefined,
            ),
            startsAt: event.startsAt ?? null,
            endsAt: event.endsAt ?? null,
          }
        : null,
    [client, event, id],
  );

  if (!railEvent) return null;
  return (
    <EventReportRail
      event={railEvent}
      reportIds={ids}
      reports={chosen}
      onToggleReport={toggle}
      request={request}
    />
  );
}
