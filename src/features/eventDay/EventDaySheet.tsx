import { Link } from "react-router-dom";
import { eventDetailPath } from "../events/eventRoutes";
import type { EventDaySection, EventDaySectionKey } from "./eventDayModel";
import {
  ContactsSheet,
  EquipmentSheet,
  LayoutsSheet,
  MenuSheet,
  PackListSheet,
  StaffingSheet,
  TimelineSheet,
  VehiclesSheet,
  VenueSheet,
  type EventDayDetailData,
} from "./EventDaySheetSections";

const STATUS_TONE: Record<EventDaySection["status"], string> = {
  ready: "var(--evd-ready)",
  active: "var(--evd-active)",
  review: "var(--evd-review)",
  blocked: "var(--evd-blocked)",
  dormant: "var(--evd-ink-3)",
};

const STATUS_WORD: Record<EventDaySection["status"], string> = {
  ready: "Ready",
  active: "In progress",
  review: "Needs review",
  blocked: "Blocked",
  dormant: "Not started",
};

function capsuleLink(key: EventDaySectionKey, eventId: string): string {
  switch (key) {
    case "venue":
      return eventDetailPath(eventId, "overview");
    case "staffing":
      return eventDetailPath(eventId, "staffing");
    case "timeline":
      return eventDetailPath(eventId, "timeline");
    case "menu":
      return eventDetailPath(eventId, "menu");
    case "layouts":
      return eventDetailPath(eventId, "layouts");
    case "equipment":
      return eventDetailPath(eventId, "equipment");
    case "contacts":
      return eventDetailPath(eventId, "client");
    case "vehicles":
      return "/logistics/deliveries";
    case "packlist":
      return "/logistics/packs";
  }
}

type Props = {
  readonly section: EventDaySection;
  readonly data: EventDayDetailData;
  readonly onClose: () => void;
};

/** Bottom sheet with the finalized, read-only details for one section. */
export function EventDaySheet({ section, data, onClose }: Props) {
  const eventId = String(data.event._id);
  return (
    <>
      <button
        type="button"
        className="evd-scrim"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        className="evd-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={section.label}
      >
        <div className="evd-sheet-grip" />
        <div className="evd-sheet-head">
          <span className="evd-sheet-title">{section.label}</span>
          <span
            className="evd-sheet-status"
            style={{ color: STATUS_TONE[section.status] }}
          >
            {STATUS_WORD[section.status]} · {section.caption}
          </span>
        </div>
        <div className="evd-sheet-body">
          {section.key === "venue" ? <VenueSheet data={data} /> : null}
          {section.key === "staffing" ? <StaffingSheet data={data} /> : null}
          {section.key === "timeline" ? <TimelineSheet data={data} /> : null}
          {section.key === "menu" ? <MenuSheet data={data} /> : null}
          {section.key === "vehicles" ? <VehiclesSheet data={data} /> : null}
          {section.key === "layouts" ? <LayoutsSheet data={data} /> : null}
          {section.key === "equipment" ? <EquipmentSheet data={data} /> : null}
          {section.key === "contacts" ? <ContactsSheet data={data} /> : null}
          {section.key === "packlist" ? <PackListSheet data={data} /> : null}
        </div>
        <div className="evd-sheet-foot">
          <Link
            className="evd-open-link"
            to={capsuleLink(section.key, eventId)}
          >
            Open in Capsule ›
          </Link>
          <button type="button" className="evd-close-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </>
  );
}
