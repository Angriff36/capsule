import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import "./EventDay.css";
import { formatCount, formatDate } from "../../lib/format";
import {
  useGetEvent,
  useListClientContact,
  useListDelivery,
  useListDish,
  useListEquipment,
  useListEquipmentReservation,
  useListEventAssignment,
  useListEventDish,
  useListEventLayoutSection,
  useListEventStaffNeed,
  useListEventTimelineActivity,
  useListPackList,
  useListPackListItem,
  useListPerson,
  useListVehicle,
  useListVenue,
} from "../../lib/manifest-convex-react";
import { useRouteRecord } from "../../lib/routeRecord";
import { eventDetailPath } from "../events/eventRoutes";
import { deriveEventDay, type EventDaySectionKey } from "./eventDayModel";
import { EventDayMap } from "./EventDayMap";
import { EventDayReadinessRing } from "./EventDayReadinessRing";
import { EventDaySheet } from "./EventDaySheet";
import type { EventDayDetailData } from "./EventDaySheetSections";
import { EventDayTray } from "./EventDayTray";

function NavGlyph({ shape }: { shape: "map" | "shield" | "person" | "grid" }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" aria-hidden>
      {shape === "map" ? (
        <path
          d="M3 5.5l4.5-2 5 2L17 3.5v11l-4.5 2-5-2-4.5 2v-11zM7.5 3.5v11m5-9v11"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      ) : null}
      {shape === "shield" ? (
        <path
          d="M10 2.5l6 2.2v4.6c0 3.8-2.6 6.6-6 8.2-3.4-1.6-6-4.4-6-8.2V4.7l6-2.2zM7.5 10l1.8 1.8 3.4-3.6"
          strokeWidth="1.4"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ) : null}
      {shape === "person" ? (
        <path
          d="M10 9.5a3.25 3.25 0 100-6.5 3.25 3.25 0 000 6.5zM3.5 17c.8-3 3.4-4.7 6.5-4.7s5.7 1.7 6.5 4.7"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      ) : null}
      {shape === "grid" ? (
        <path
          d="M3.5 3.5h5v5h-5v-5zm8 0h5v5h-5v-5zm-8 8h5v5h-5v-5zm8 0h5v5h-5v-5z"
          strokeWidth="1.4"
        />
      ) : null}
    </svg>
  );
}

function CenteredNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="evd">
      <div
        className="evd-frame"
        style={{ alignItems: "center", justifyContent: "center" }}
      >
        <p className="evd-empty">{children}</p>
        <Link className="evd-open-link" to="/event-day">
          Choose an event ›
        </Link>
      </div>
    </div>
  );
}

/**
 * Event Day — the staff night-map for one event. Read-only by design:
 * it shows the finalized plan and lights sections up as they complete.
 */
export function EventDayPage() {
  const { id } = useParams();
  const event = useRouteRecord(useGetEvent, id);
  const venues = useListVenue();
  const assignments = useListEventAssignment();
  const staffNeeds = useListEventStaffNeed();
  const activities = useListEventTimelineActivity();
  const eventDishes = useListEventDish();
  const dishes = useListDish();
  const deliveries = useListDelivery();
  const vehicles = useListVehicle();
  const layoutSections = useListEventLayoutSection();
  const equipmentReservations = useListEquipmentReservation();
  const equipments = useListEquipment();
  const clientContacts = useListClientContact();
  const packLists = useListPackList();
  const packListItems = useListPackListItem();
  const people = useListPerson();
  const [open, setOpen] = useState<EventDaySectionKey | null>(null);

  const data: EventDayDetailData | null = useMemo(() => {
    if (event == null || event.deletedAt != null) return null;
    const eventId = event._id;
    const forEvent = <T extends { eventId?: unknown; deletedAt?: unknown }>(
      rows: readonly T[] | undefined,
    ) =>
      (rows ?? []).filter(
        (row) => row.deletedAt == null && row.eventId === eventId,
      );
    return {
      event,
      venue: (venues ?? []).find((row) => row._id === event.venueId),
      assignments: forEvent(assignments),
      staffNeeds: forEvent(staffNeeds),
      activities: forEvent(activities).filter((row) => row.scheduledAt != null),
      eventDishes: forEvent(eventDishes).filter((row) => row.removedAt == null),
      deliveries: forEvent(deliveries),
      layoutSections: forEvent(layoutSections).filter(
        (row) => row.addedAt != null,
      ),
      equipmentReservations: forEvent(equipmentReservations),
      clientContacts: (clientContacts ?? [])
        .filter(
          (row) =>
            row.deletedAt == null &&
            row.clientId === event.clientId &&
            String(row.status) !== "removed",
        )
        .sort((a, b) => Number(b.isPrimary ?? 0) - Number(a.isPrimary ?? 0)),
      packLists: forEvent(packLists),
      packListItems: (packListItems ?? []).filter(
        (row) => row.deletedAt == null,
      ),
      dishes: dishes ?? [],
      people: people ?? [],
      vehicles: vehicles ?? [],
      equipments: equipments ?? [],
    };
  }, [
    event,
    venues,
    assignments,
    staffNeeds,
    activities,
    eventDishes,
    deliveries,
    layoutSections,
    equipmentReservations,
    clientContacts,
    packLists,
    packListItems,
    dishes,
    people,
    vehicles,
    equipments,
  ]);

  // A list that has not resolved yet must not read as "empty" — that would
  // flash false blockers like "No staff assigned" on a final event.
  const anyListLoading = [
    venues,
    assignments,
    staffNeeds,
    activities,
    eventDishes,
    dishes,
    deliveries,
    vehicles,
    layoutSections,
    equipmentReservations,
    equipments,
    clientContacts,
    packLists,
    packListItems,
    people,
  ].some((rows) => rows === undefined);

  if (event === undefined || anyListLoading)
    return <CenteredNote>Lighting the estate…</CenteredNote>;
  if (event === null || event.deletedAt != null || data == null)
    return (
      <CenteredNote>
        This event is unavailable — it may have been removed.
      </CenteredNote>
    );

  const summary = deriveEventDay(data);
  const sealed = ["final", "executing", "completed", "closed_out"].includes(
    String(event.stage),
  );
  const active = summary.sections.find((row) => row.key === open) ?? null;
  const place = data.venue?.name ?? event.venueName;
  const headcount =
    event.expectedHeadcount != null
      ? `${formatCount(Number(event.expectedHeadcount))} guests`
      : null;

  return (
    <div className="evd">
      <div className="evd-frame">
        <header className="evd-head">
          <div style={{ minWidth: 0 }}>
            <p className="evd-eyebrow">
              {typeof event.startsAt === "number"
                ? formatDate(event.startsAt)
                : "Unscheduled"}
            </p>
            <Link to="/event-day" className="evd-title-btn">
              <h1 className="evd-title">{String(event.title ?? "Event")}</h1>
              <p className="evd-place">
                {[place, headcount].filter(Boolean).join(" · ") ||
                  "No venue yet"}
              </p>
              <p className="evd-switch">⇄ Switch event</p>
            </Link>
          </div>
          <EventDayReadinessRing
            pct={summary.readinessPct}
            label={summary.ringLabel}
            tone={summary.ringTone}
            daysOut={summary.daysOut}
          />
        </header>
        <EventDayMap
          sections={summary.sections}
          sealed={sealed}
          onOpen={setOpen}
        />
        <EventDayTray
          now={summary.now}
          next={summary.next}
          blockers={summary.blockers}
          onOpen={setOpen}
        />
        <nav className="evd-nav">
          <span className="evd-nav-item evd-nav-on">
            <NavGlyph shape="map" />
            Event map
          </span>
          <Link
            className="evd-nav-item"
            to={`/events/${event._id}/allergen-briefing`}
          >
            <NavGlyph shape="shield" />
            Briefing
          </Link>
          <Link className="evd-nav-item" to="/my">
            <NavGlyph shape="person" />
            My day
          </Link>
          <Link
            className="evd-nav-item"
            to={eventDetailPath(String(event._id))}
          >
            <NavGlyph shape="grid" />
            Capsule
          </Link>
        </nav>
      </div>
      {active ? (
        <EventDaySheet
          section={active}
          data={data}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </div>
  );
}
