import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { Id } from "../../../lib/api";
import {
  useEventPacket,
  useEventPacketAccess,
} from "../../../lib/eventPacket/useEventPacket";
import { formatCount, formatMoney, formatTime } from "../../../lib/format";
import {
  useListEventTimelineComment,
  useListInvoice,
} from "../../../lib/manifest-convex-react";
import { formatStatusLabel } from "../../../lib/statusLabels";
import { EventProposalEnhancementsCard } from "../../clients/EventProposalEnhancementsCard";
import { EventProposalSourceCard } from "../../clients/EventProposalSourceCard";
import { eventDetailPath } from "../eventRoutes";
import { EventImportDraftPanel } from "../import/EventImportDraftPanel";
import { EventSourceProvenancePanel } from "../EventSourceProvenancePanel";
import { eventOwnerLabel } from "../eventOwnerLabel";
import { allergyLine, durationLabel, firstLine } from "./eventDashFacts";
import type { DashSheetId, EventDashOverviewProps } from "./eventDashTypes";
import { useEventDayForecast } from "./useEventDayForecast";

const ARROW = (
  <svg
    className="evd-go"
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M7 17 17 7M8 7h9v9" />
  </svg>
);

function Tile({
  id,
  label,
  big,
  hint,
  tone,
  index,
  onOpen,
}: {
  readonly id: DashSheetId;
  readonly label: string;
  readonly big: ReactNode;
  readonly hint: ReactNode;
  readonly tone?: "alert" | "warn";
  readonly index: number;
  readonly onOpen: (id: DashSheetId) => void;
}) {
  return (
    <button
      type="button"
      className={`evd-tile ${tone ?? ""}`}
      style={{ animationDelay: `${0.05 * index}s` }}
      onClick={() => onOpen(id)}
      data-testid={`event-dash-tile-${id}`}
    >
      {ARROW}
      <span className="evd-label">{label}</span>
      {big}
      <span className="evd-hint">{hint}</span>
    </button>
  );
}

const MONTH_DAY = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
});

const CLOSED_INVOICE = new Set(["paid", "void", "voided", "written_off"]);

/** Open required workbook items; only managers can read the workbook. */
function WorkbookTile(props: {
  readonly eventId: Id<"events">;
  readonly index: number;
  readonly onOpen: (id: DashSheetId) => void;
}) {
  const packet = useEventPacket(props.eventId);
  const open = packet.view?.snapshot.issues.filter(
    (issue) => issue.required && issue.status === "open",
  ).length;
  return (
    <Tile
      id="workbook"
      label="Event workbook"
      index={props.index}
      onOpen={props.onOpen}
      tone={open ? "warn" : undefined}
      big={
        <div className={`evd-big${open === undefined ? " q" : ""}`}>
          {open ?? "—"}
        </div>
      }
      hint={
        open === undefined
          ? "Loading the workbook…"
          : open === 0
            ? "Every workbook item is settled"
            : "Open items need attention"
      }
    />
  );
}

/** The overview: counts, one tile per area, and the planning-notes bar. */
export function EventDashOverview({
  props,
  onOpen,
}: {
  readonly props: EventDashOverviewProps;
  readonly onOpen: (id: DashSheetId) => void;
}) {
  const { event, eventId } = props;
  const invoices = useListInvoice();
  const comments = useListEventTimelineComment();
  const canManagePacket = useEventPacketAccess(eventId);
  const forecast = useEventDayForecast(props.venue, props.startsAt);

  const setup = [
    ["Client assigned", event.hasAssignedClient],
    ["Headcount set", event.hasExpectedHeadcount],
    ["Menu dishes added", event.hasMenuDishes],
    ["Staff assigned", event.hasStaffAssigned],
  ] as const;
  const ready = setup.filter(([, ok]) => ok).length;
  const firstGap = setup.find(([, ok]) => !ok)?.[0];

  const invoice = (invoices ?? [])
    .filter((row) => row.deletedAt == null && String(row.eventId) === eventId)
    .sort(
      (a, b) =>
        Number(CLOSED_INVOICE.has(String(a.status))) -
          Number(CLOSED_INVOICE.has(String(b.status))) ||
        (b.createdAt ?? 0) - (a.createdAt ?? 0),
    )[0];
  const planningNotes = (comments ?? []).filter(
    (row) =>
      row.deletedAt == null &&
      row.eventId === eventId &&
      (row.activityId == null || row.activityId === ""),
  ).length;

  const owner = event.assignedToId
    ? props.people?.find((person) => person._id === event.assignedToId)
    : undefined;
  const ownerLabel = event.assignedToId
    ? eventOwnerLabel({
        assignedToId: event.assignedToId,
        ownerName: event.ownerName,
        liveName: owner ? `${owner.givenName} ${owner.familyName}` : "—",
        peopleLoading: props.people === undefined,
      })
    : null;

  const allergy = allergyLine(props.serviceRequirements);
  const serviceLine = firstLine(props.serviceRequirements);
  const opsLine = firstLine(props.operationalRequirements);
  const travel = event.timingOutboundTravelMinutes;
  const recurring = event.recurrenceFrequency
    ? formatStatusLabel(event.recurrenceFrequency)
    : null;

  const stats: [string, number, string][] = [
    ["Menu dishes", props.dishCount, eventDetailPath(eventId, "menu")],
    ["Staff assigned", props.staffCount, eventDetailPath(eventId, "staffing")],
    [
      "Timeline activities",
      props.timelineCount,
      eventDetailPath(eventId, "timeline"),
    ],
    [
      "Recurrence occurrences",
      event.recurrenceGeneratedCount ?? 0,
      eventDetailPath(eventId, "recurring"),
    ],
  ];

  let index = 0;
  const next = () => index++;

  return (
    <section data-testid="event-overview-tab">
      <div className="evd-stats">
        {stats.map(([label, value, to]) => (
          <Link key={label} to={to} className="evd-stat">
            <b className={value ? "" : "zero"}>{formatCount(value)}</b>
            <span className="evd-label">{label}</span>
          </Link>
        ))}
      </div>

      <div className="evd-tiles">
        <Tile
          id="details"
          label="Event details"
          index={next()}
          onOpen={onOpen}
          big={
            <div className="evd-big">
              {props.startsAt != null ? MONTH_DAY.format(props.startsAt) : "—"}
            </div>
          }
          hint={`${props.startsAt != null ? `${formatTime(props.startsAt)} – ${formatTime(props.endsAt)}` : "No time set"} · ${event.venueName || "No venue"}`}
        />
        <Tile
          id="ready"
          label="Setup readiness"
          index={next()}
          onOpen={onOpen}
          big={
            <div className="evd-ring">
              <svg
                width="86"
                height="86"
                viewBox="0 0 86 86"
                aria-hidden="true"
              >
                <circle
                  cx="43"
                  cy="43"
                  r="38"
                  fill="none"
                  stroke="var(--evd-line)"
                  strokeWidth="5"
                />
                <circle
                  cx="43"
                  cy="43"
                  r="38"
                  fill="none"
                  stroke="var(--evd-ok)"
                  strokeWidth="5"
                  strokeLinecap="round"
                  pathLength={100}
                  strokeDasharray={`${(ready / setup.length) * 100} 100`}
                />
              </svg>
              <span>
                {ready}/{setup.length}
              </span>
            </div>
          }
          hint={firstGap ? `${firstGap} — open` : "Ready for approval"}
        />
        <Tile
          id="money"
          label="Budget & invoicing"
          index={next()}
          onOpen={onOpen}
          big={
            <div className="evd-big">
              {formatMoney(props.quotedPrice, props.currencyCode)}
            </div>
          }
          hint={`Quoted · ${formatMoney(props.budgetAmount, props.currencyCode)} budget · ${
            invoice
              ? `${formatStatusLabel(String(invoice.status)).toLowerCase()} invoice`
              : "no invoice yet"
          }`}
        />
        <Tile
          id="service"
          label="Service & allergies"
          index={next()}
          onOpen={onOpen}
          tone={allergy ? "alert" : undefined}
          big={
            <div className={`evd-big${allergy || serviceLine ? "" : " q"}`}>
              {allergy ? "Allergy" : serviceLine ? "Notes" : "—"}
            </div>
          }
          hint={firstLine(allergy, 80) ?? serviceLine ?? "No service notes yet"}
        />
        {canManagePacket === true ? (
          <WorkbookTile eventId={eventId} index={next()} onOpen={onOpen} />
        ) : null}
        <Tile
          id="ops"
          label="Operations"
          index={next()}
          onOpen={onOpen}
          big={
            <div className={`evd-big${travel ? "" : opsLine ? "" : " q"}`}>
              {travel ? durationLabel(travel) : opsLine ? "Notes" : "—"}
            </div>
          }
          hint={
            travel
              ? `Drive out${opsLine ? ` · ${firstLine(opsLine, 60)}` : ""}`
              : (opsLine ?? "No operational requirements on file")
          }
        />
        <Tile
          id="weather"
          label="Weather"
          index={next()}
          onOpen={onOpen}
          tone={forecast.day?.adverse ? "alert" : undefined}
          big={
            <div className={`evd-big${forecast.day ? "" : " q"}`}>
              {forecast.day
                ? `${forecast.day.highF}° / ${forecast.day.lowF}°`
                : "—"}
            </div>
          }
          hint={
            !forecast.located
              ? "Add a venue address to see the outlook"
              : forecast.loading
                ? "Loading the forecast…"
                : forecast.day
                  ? `${forecast.day.rainProbability}% rain · ${forecast.day.windMph} mph${forecast.day.adverse ? " · adverse" : ""}`
                  : "The event date is beyond the forecast window"
          }
        />
        <Tile
          id="team"
          label="Owner & staff"
          index={next()}
          onOpen={onOpen}
          big={
            <div className={`evd-big${ownerLabel ? "" : " q"}`}>
              {ownerLabel ?? "Unassigned"}
            </div>
          }
          hint={`${ownerLabel ? "Owner set" : "No owner"} · ${formatCount(props.staffCount)} staff`}
        />
        <Tile
          id="recurring"
          label="Recurring"
          index={next()}
          onOpen={onOpen}
          big={<div className="evd-big">{recurring ?? "One-time"}</div>}
          hint={
            recurring
              ? `${formatCount(event.recurrenceGeneratedCount ?? 0)} occurrences so far`
              : "This event does not repeat"
          }
        />
      </div>

      <div className="evd-notes-bar">
        <div>
          <span className="evd-label">Planning notes</span>
          <p>
            {comments === undefined
              ? "Loading planning notes…"
              : planningNotes
                ? `${planningNotes} planning comment${planningNotes === 1 ? "" : "s"}`
                : "No planning comments yet."}
          </p>
        </div>
        <div>
          <Link to={eventDetailPath(eventId, "chat")} className="evd-btn sm">
            Open team chat
          </Link>
          <button
            type="button"
            className="evd-btn sm pri"
            onClick={() => onOpen("notes")}
          >
            Comment
          </button>
        </div>
      </div>

      <div className="evd-extra">
        <EventImportDraftPanel eventId={eventId} />
        <EventProposalSourceCard eventId={eventId} />
        <EventProposalEnhancementsCard eventId={eventId} />
        <EventSourceProvenancePanel capsuleId={eventId} />
      </div>
    </section>
  );
}
