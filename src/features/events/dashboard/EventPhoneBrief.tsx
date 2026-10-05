import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { formatDate, formatTime } from "../../../lib/format";
import {
  useEventPackLists,
  useEventPrepTasks,
  useEventProposals,
} from "../../../lib/useEventRows";
import { formatStatusLabel } from "../../../lib/statusLabels";
import { eventDetailPath } from "../eventRoutes";
import { PACK_STATE_LABEL, packStateOf } from "../tracker/trackerSheet";
import { allergyLine, firstLine } from "./eventDashFacts";
import type { DashSheetId, EventDashOverviewProps } from "./eventDashTypes";

/** The newest proposal wins, but an accepted one always beats a newer draft. */
const PROPOSAL_RANK: Record<string, number> = {
  accepted: 2,
  sent: 1,
  viewed: 1,
};

function Row(props: {
  readonly label: string;
  readonly children: ReactNode;
  readonly action?: ReactNode;
  readonly tone?: "alert";
  readonly testId: string;
}) {
  return (
    <li
      className={`evd-brief-row${props.tone ? ` ${props.tone}` : ""}`}
      data-testid={props.testId}
    >
      <div className="min-w-0">
        <span className="evd-label">{props.label}</span>
        <div className="evd-brief-value">{props.children}</div>
      </div>
      {props.action}
    </li>
  );
}

/**
 * The phone event summary (CF-4-5): what a kitchen or event lead needs first,
 * in this order: next step, when and where, contact, service style, proposal,
 * staffing, prep, pack list, critical notes. Every row opens the place where
 * that work is done, so nothing needs the desktop layout.
 */
export function EventPhoneBrief({
  props,
  serviceStyle,
  onOpen,
}: {
  readonly props: EventDashOverviewProps;
  readonly serviceStyle: string | null;
  readonly onOpen: (id: DashSheetId) => void;
}) {
  const { event, eventId } = props;
  const proposals = useEventProposals(eventId);
  const prepTasks = useEventPrepTasks(eventId);
  const packLists = useEventPackLists(eventId);

  const next = props.lifecycleActions.find(
    (action) => action.kind === "primary",
  );
  const setup: [string, boolean | undefined, string][] = [
    [
      "Add a client",
      event.hasAssignedClient,
      eventDetailPath(eventId, "client"),
    ],
    ["Add menu dishes", event.hasMenuDishes, eventDetailPath(eventId, "menu")],
    [
      "Assign staff",
      event.hasStaffAssigned,
      eventDetailPath(eventId, "staffing"),
    ],
  ];
  const gap = setup.find(([, done]) => !done);

  const proposal = (proposals ?? [])
    .filter((row) => row.deletedAt == null && String(row.eventId) === eventId)
    .sort(
      (a, b) =>
        (PROPOSAL_RANK[String(b.status)] ?? 0) -
          (PROPOSAL_RANK[String(a.status)] ?? 0) ||
        (b.updatedAt ?? b.createdAt ?? 0) - (a.updatedAt ?? a.createdAt ?? 0),
    )[0];

  const tasks = (prepTasks ?? []).filter(
    (row) =>
      row.deletedAt == null &&
      row.eventId === eventId &&
      row.status !== "cancelled",
  );
  const tasksDone = tasks.filter((row) => row.status === "completed").length;

  const lists = (packLists ?? []).filter(
    (row) => row.deletedAt == null && String(row.eventId) === eventId,
  );
  const pack = packStateOf(props.stage, lists, 0);

  const allergy = allergyLine(
    props.serviceRequirements,
    props.operationalRequirements,
  );
  const access = (props.accessibilityNeeds ?? []).filter(Boolean);
  const venueLine = [event.venueName, event.venueAddress]
    .filter(Boolean)
    .join(", ");
  const phone = props.primaryContactPhone?.trim();
  const email = props.primaryContactEmail?.trim();

  return (
    <section className="evd-brief" aria-label="Event at a glance">
      <ol>
        <Row label="Next step" testId="event-brief-next">
          {next ? (
            <button
              type="button"
              className="evd-btn pri"
              disabled={props.busy}
              onClick={() => props.onAction(next.key)}
            >
              {next.label}
            </button>
          ) : gap ? (
            <Link className="evd-btn pri" to={gap[2]}>
              {gap[0]}
            </Link>
          ) : (
            "Nothing waiting on this event."
          )}
        </Row>
        <Row
          label="When and where"
          testId="event-brief-when"
          action={
            venueLine ? (
              <a
                className="evd-btn sm"
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venueLine)}`}
                target="_blank"
                rel="noreferrer"
              >
                Map
              </a>
            ) : null
          }
        >
          {props.startsAt != null
            ? `${formatDate(props.startsAt)} · ${formatTime(props.startsAt)} – ${formatTime(props.endsAt)}`
            : "No date set"}
          <br />
          {venueLine || "No venue yet"}
        </Row>
        <Row
          label="Contact"
          testId="event-brief-contact"
          action={
            phone ? (
              <a className="evd-btn sm" href={`tel:${phone}`}>
                Call
              </a>
            ) : email ? (
              <a className="evd-btn sm" href={`mailto:${email}`}>
                Email
              </a>
            ) : (
              <button
                type="button"
                className="evd-btn sm"
                onClick={() => onOpen("edit")}
              >
                Add
              </button>
            )
          }
        >
          {props.primaryContactName?.trim() || "No contact on this event"}
          {phone ? ` · ${phone}` : ""}
        </Row>
        <Row
          label="Service style"
          testId="event-brief-service"
          action={
            <button
              type="button"
              className="evd-btn sm"
              onClick={() => onOpen("service")}
            >
              Open
            </button>
          }
        >
          {serviceStyle ?? "No style set"}
        </Row>
        <Row
          label="Proposal"
          testId="event-brief-proposal"
          action={
            proposal ? (
              <Link
                className="evd-btn sm"
                to={`/clients/proposals?proposal=${proposal._id}`}
              >
                Open
              </Link>
            ) : (
              <Link
                className="evd-btn sm"
                to={`/clients/proposals?event=${eventId}`}
              >
                Create
              </Link>
            )
          }
        >
          {proposals === undefined
            ? "Loading…"
            : proposal
              ? formatStatusLabel(String(proposal.status))
              : "No proposal yet"}
        </Row>
        <Row
          label="Staffing"
          testId="event-brief-staffing"
          action={
            <Link
              className="evd-btn sm"
              to={eventDetailPath(eventId, "staffing")}
            >
              Open
            </Link>
          }
        >
          {props.staffCount === 0
            ? "Nobody assigned yet"
            : `${props.staffCount} ${props.staffCount === 1 ? "person" : "people"} assigned`}
        </Row>
        <Row
          label="Prep"
          testId="event-brief-prep"
          action={
            <Link className="evd-btn sm" to={eventDetailPath(eventId, "prep")}>
              Open
            </Link>
          }
        >
          {prepTasks === undefined
            ? "Loading…"
            : tasks.length === 0
              ? "No prep tasks yet"
              : `${tasksDone} of ${tasks.length} prep tasks done`}
        </Row>
        <Row
          label="Pack list"
          testId="event-brief-pack"
          action={
            <Link
              className="evd-btn sm"
              to={
                lists[0]
                  ? `/logistics/packs/${lists[0]._id}`
                  : eventDetailPath(eventId, "equipment")
              }
            >
              Open
            </Link>
          }
        >
          {packLists === undefined
            ? "Loading…"
            : (pack.detail ?? PACK_STATE_LABEL[pack.state])}
        </Row>
        <Row
          label="Critical notes"
          testId="event-brief-notes"
          tone={allergy ? "alert" : undefined}
          action={
            <button
              type="button"
              className="evd-btn sm"
              onClick={() => onOpen(allergy ? "allergens" : "service")}
            >
              Open
            </button>
          }
        >
          {allergy ? `Allergy: ${allergy}` : null}
          {allergy && access.length > 0 ? <br /> : null}
          {access.length > 0 ? `Access: ${access.join(", ")}` : null}
          {!allergy && access.length === 0
            ? (firstLine(props.serviceRequirements, 110) ??
              "No allergies or access needs on file")
            : null}
        </Row>
      </ol>
    </section>
  );
}
