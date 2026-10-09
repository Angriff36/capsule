import { useMemo, useState } from "react";
import {
  useListOccasion,
  useListPerson,
  useListReferralSource,
  useListServiceStyle,
  useListVenue,
} from "@/lib/manifest-convex-react";
import {
  useAllEventReportRows,
  type EventLookupRow,
} from "../facilities/useEventsById";
import {
  eventServiceStyleKey,
  eventServiceStyleLabel,
} from "../events/eventServiceStyle";
import { EmptyState, PageHeader } from "@/ui/primitives";
import { formatCodeAsWords } from "@/lib/format";
import { MetricDefinitionList } from "./MetricDefinitionList";
import type { SalesLabels } from "./mangia/salesFigures";
import { dayText } from "./mangia/SalesReportParts";
import { OverviewTab } from "./mangia/OverviewTab";
import { RevenueTab } from "./mangia/RevenueTab";
import { PipelineTab } from "./mangia/PipelineTab";
import { PeopleTab } from "./mangia/PeopleTab";
import { EventsTab } from "./mangia/EventsTab";
import { AevTab } from "./mangia/AevTab";
import { TodayOperationsTab } from "./mangia/TodayOperationsTab";

/**
 * Mangia Dashboard Round 4 (Priority 41; spec CF-7.4-07)
 *
 * The Mangia Sales Performance Report ("Sales Dashboard Round 4" in the Comp
 * Master status sheet) on live Capsule data: the same six tabs, sections and
 * measures, in the same order, counted by mangia/salesFigures.ts. The
 * day-to-day operations board that stood here before is the last tab.
 */

const TITLE = "Mangia Sales Performance Report";
const LEAD = "Revenue, pipeline, people, events and average event value.";

const TABS = [
  ["overview", "Overview"],
  ["revenue", "Revenue"],
  ["pipeline", "Pipeline"],
  ["people", "People"],
  ["events", "Events"],
  ["aev", "Avg event value"],
  ["today", "Today"],
] as const;

type Tab = (typeof TABS)[number][0];

/** The report adds up every event on file, so it reads them only on ask. */
export function MangiaDashboardPage() {
  const [requested, setRequested] = useState(false);
  if (requested) return <MangiaReport />;
  return (
    <div className="operations-stage supply-stage">
      <PageHeader title={TITLE} lead={LEAD} />
      <p className="mt-3 max-w-160 text-ink-2">
        These figures add up every event on file.
      </p>
      <button
        type="button"
        className="btn btn-primary mt-4"
        onClick={() => setRequested(true)}
      >
        Show all-time sales figures
      </button>
    </div>
  );
}

function MangiaReport() {
  const [tab, setTab] = useState<Tab>("overview");
  const events = useAllEventReportRows();
  const people = useListPerson();
  const sources = useListReferralSource();
  const occasions = useListOccasion();
  const styles = useListServiceStyle();
  const venues = useListVenue();
  const now = useMemo(() => new Date(), []);

  const labels = useMemo<SalesLabels<EventLookupRow>>(() => {
    const name = (
      rows: readonly { _id: unknown; name?: string }[] | undefined,
    ) => new Map((rows ?? []).map((row) => [String(row._id), row.name ?? ""]));
    const personNames = new Map(
      (people ?? []).map((p) => [
        String(p._id),
        `${p.givenName ?? ""} ${p.familyName ?? ""}`.trim(),
      ]),
    );
    const sourceNames = name(sources);
    const occasionNames = name(occasions);
    const styleNames = name(styles);
    const venueNames = name(venues);
    return {
      salesperson: (e) =>
        (e.assignedToId && personNames.get(String(e.assignedToId))) ||
        "No salesperson",
      leadSource: (e) =>
        (e.referralSourceId && sourceNames.get(String(e.referralSourceId))) ||
        "No lead source",
      eventType: (e) => {
        const typed =
          (e.occasionId && occasionNames.get(String(e.occasionId))) ||
          e.eventType?.trim();
        return typed ? formatCodeAsWords(typed) : "No event type";
      },
      serviceStyle: (e) =>
        styleNames.get(eventServiceStyleKey(e)) || eventServiceStyleLabel(e),
      venue: (e) =>
        (e.venueId && venueNames.get(String(e.venueId))) ||
        e.venueName?.trim() ||
        "No venue",
    };
  }, [people, sources, occasions, styles, venues]);

  return (
    <div className="operations-stage supply-stage">
      <PageHeader title={TITLE} lead={LEAD} />
      <p className="mt-1 inline-block rounded-xs bg-brand-soft px-2 py-0.5 text-xs font-semibold text-brand">
        Live figures as of {dayText(now)}
      </p>

      {events?.length === 0 ? (
        <div data-testid="dashboard-empty" className="mt-4">
          <EmptyState
            title="No events yet"
            hint="Sales figures show here once events are on file."
          />
        </div>
      ) : null}

      <div
        role="tablist"
        aria-label="Report part"
        className="mt-4 flex overflow-x-auto border-b border-line"
      >
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`-mb-px h-11 shrink-0 cursor-pointer border-b-2 px-4 text-sm font-semibold whitespace-nowrap md:h-9 ${
              tab === key
                ? "border-brand text-brand"
                : "border-transparent text-ink-2 hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === "today" ? (
          <TodayOperationsTab />
        ) : events === undefined ? (
          <p className="text-sm text-ink-2">Loading every event…</p>
        ) : tab === "overview" ? (
          <OverviewTab events={events} now={now} />
        ) : tab === "revenue" ? (
          <RevenueTab events={events} now={now} />
        ) : tab === "pipeline" ? (
          <PipelineTab events={events} now={now} labels={labels} />
        ) : tab === "people" ? (
          <PeopleTab events={events} now={now} labels={labels} />
        ) : tab === "events" ? (
          <EventsTab events={events} now={now} labels={labels} />
        ) : (
          <AevTab events={events} now={now} labels={labels} />
        )}
      </div>

      {tab === "today" ? null : (
        <MetricDefinitionList
          metricIds={[
            "dashboard.booked_revenue",
            "dashboard.completed_revenue",
            "dashboard.pipeline_value",
            "dashboard.win_rate",
            "dashboard.lost_revenue",
            "dashboard.aev_growth_goal",
          ]}
        />
      )}
    </div>
  );
}
