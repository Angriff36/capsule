import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  formatCount,
  formatDate,
  formatTime,
  relativeDays,
} from "../../../lib/format";
import { formatStatusLabel } from "../../../lib/statusLabels";
import { STAGE_LABEL, type EventStage } from "../eventStatus";
import { allergyLine, countdownLabel, splitTitle } from "./eventDashFacts";

type Props = {
  readonly title: string;
  readonly stage: string;
  readonly startsAt?: number | null;
  readonly endsAt?: number | null;
  readonly updatedAt?: number | null;
  readonly client: ReactNode;
  readonly venue: ReactNode;
  readonly expectedHeadcount?: number | null;
  readonly eventType: string;
  readonly serviceRequirements?: string | null;
  readonly onOpenService: () => void;
  readonly onOpenEdit: () => void;
  /** Export BEO, the More menu, and any header action. */
  readonly actions: ReactNode;
};

/** The centered event heading: stage, countdown, title, facts, allergies. */
export function EventDashHero(props: Props) {
  const { lead, accent } = splitTitle(props.title);
  const countdown = countdownLabel(props.startsAt);
  const allergy = allergyLine(props.serviceRequirements);
  const when =
    props.startsAt != null
      ? `${formatDate(props.startsAt)} · ${formatTime(props.startsAt)} – ${formatTime(props.endsAt)}`
      : "No date set";

  return (
    <section className="evd-hero" data-testid="event-context-header">
      <Link to="/events" className="evd-crumb">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m14 6-6 6 6 6" />
        </svg>
        All events
      </Link>
      <div className="evd-pills">
        <span className="evd-pill status">
          {STAGE_LABEL[props.stage as EventStage] ??
            formatStatusLabel(props.stage)}
        </span>
        {countdown ? <span className="evd-pill">{countdown}</span> : null}
        {typeof props.updatedAt === "number" ? (
          <span className="evd-pill">
            Updated {relativeDays(props.updatedAt)}
          </span>
        ) : null}
      </div>
      <h1 className="evd-title">
        {lead}
        {accent ? (
          <>
            {" "}
            <em>{accent}</em>
          </>
        ) : null}
      </h1>
      <p className="evd-lede">
        This booking — menu, staff, timeline, and money in one place.
      </p>
      <div className="evd-meta">
        <span>{props.client}</span>
        <span>{when}</span>
        <span>{props.venue}</span>
        <span>{formatCount(props.expectedHeadcount)} guests</span>
        <span>{formatStatusLabel(props.eventType)}</span>
      </div>
      <div className="evd-hero-row">
        {allergy ? (
          <button
            type="button"
            className="evd-allergy"
            onClick={props.onOpenService}
            data-testid="event-allergy-pill"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 3 2.5 20h19z" />
              <path d="M12 10v4.5M12 17.5v.1" />
            </svg>
            <span>
              <b>Allergy</b> · {allergy}
            </span>
          </button>
        ) : null}
        <button
          type="button"
          className="evd-edit-link"
          onClick={props.onOpenEdit}
        >
          Edit
        </button>
      </div>
      <div className="evd-actions">{props.actions}</div>
    </section>
  );
}
