import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import type { EventDetailTab } from "../eventRoutes";
import { useEventReviewFlags } from "../review-flags/useEventReviewFlags";
import { EventDashHero } from "./EventDashHero";
import { EventDashNav } from "./EventDashNav";
import { EventDashOverview } from "./EventDashOverview";
import { EventDashPipeline } from "./EventDashPipeline";
import { EventDashSheet } from "./EventDashSheet";
import { EventDashSheetBody, SHEET_LABEL } from "./EventDashSheets";
import type { DashSheetId, EventDashOverviewProps } from "./eventDashTypes";
import "./EventDashboard.css";

type Props = {
  readonly title: string;
  readonly updatedAt?: number | null;
  readonly client: ReactNode;
  readonly venue: ReactNode;
  readonly actions: ReactNode;
  readonly activeTab: EventDetailTab;
  readonly onTab: (tab: EventDetailTab) => void;
  readonly overview: EventDashOverviewProps;
  /** Banners and notices that sit between the heading and the sections. */
  readonly notices: ReactNode;
  /** Every tab except the overview, rendered by the page. */
  readonly children: ReactNode;
};

/**
 * The desktop event page in the event-dashboard design (2026-09-18): the
 * centered heading, the pipeline, grouped sections, and an overview of tiles
 * whose sheets hold the working cards and forms.
 */
export function EventDashboard(props: Props) {
  const [sheet, setSheet] = useState<DashSheetId | null>(null);
  // A stage move may ask for a reason in the page; close the sheet first.
  const overview: EventDashOverviewProps = {
    ...props.overview,
    onAction: (key) => {
      setSheet(null);
      props.overview.onAction(key);
    },
  };
  const flags = useEventReviewFlags(overview.eventId);
  const location = useLocation();

  // Old "Edit" links land on #event-setup-basics: open the edit sheet.
  useEffect(() => {
    if (location.hash === "#event-setup-basics") setSheet("edit");
  }, [location.hash]);

  const onTab = (tab: EventDetailTab) => {
    setSheet(null);
    props.onTab(tab);
    document
      .getElementById("event-sections")
      ?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="evd">
      <div className="evd-wrap">
        <EventDashHero
          title={props.title}
          stage={overview.stage}
          startsAt={overview.startsAt}
          endsAt={overview.endsAt}
          updatedAt={props.updatedAt}
          client={props.client}
          venue={props.venue}
          expectedHeadcount={overview.expectedHeadcount}
          eventType={overview.event.eventType}
          serviceRequirements={overview.serviceRequirements}
          operationalRequirements={overview.operationalRequirements}
          onOpenService={() => setSheet("service")}
          onOpenEdit={() => setSheet("edit")}
          actions={props.actions}
        />
        {props.notices}
        <EventDashPipeline
          stage={overview.stage}
          openQuestions={flags.loading ? undefined : flags.openFlags.length}
          onOpenStage={() => setSheet("stage")}
        />
        <EventDashNav active={props.activeTab} onChange={onTab} />
        {props.activeTab === "overview" ? (
          <EventDashOverview props={overview} onOpen={setSheet} />
        ) : null}
      </div>
      {/* Tabs use the full width; they bring their own cards. */}
      {props.activeTab !== "overview" ? (
        <div className="evd-panel">{props.children}</div>
      ) : null}
      <EventDashSheet
        open={sheet !== null}
        label={sheet ? SHEET_LABEL[sheet] : "Event sheet"}
        onClose={() => setSheet(null)}
      >
        {sheet ? props.notices : null}
        {sheet ? (
          <EventDashSheetBody
            id={sheet}
            props={overview}
            title={props.title}
            onOpen={setSheet}
          />
        ) : null}
      </EventDashSheet>
    </div>
  );
}
