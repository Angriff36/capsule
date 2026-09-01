import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import "./EventDay.css";
import { useEventDayBriefing } from "../../lib/eventDayBriefing";
import { formatCount, formatDate } from "../../lib/format";
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
  // One authored read: the day-of briefing seam (issue #258) is readable
  // by every tenant member with a real role, so drivers and kitchen staff
  // see the same finished map the event manager sees. Everything arrives
  // already event-scoped, tenant-checked, and projected (no money, no HR
  // fields), so there is no per-list loading race to guard against.
  const briefing = useEventDayBriefing(id);
  const [open, setOpen] = useState<EventDaySectionKey | null>(null);

  const data: EventDayDetailData | null = useMemo(() => {
    if (briefing == null) return null;
    return {
      event: briefing.event,
      venue: briefing.venue ?? undefined,
      assignments: briefing.assignments,
      staffNeeds: briefing.staffNeeds,
      activities: briefing.activities.filter((row) => row.scheduledAt != null),
      eventDishes: briefing.eventDishes.filter((row) => row.removedAt == null),
      deliveries: briefing.deliveries,
      layoutSections: briefing.layoutSections.filter(
        (row) => row.addedAt != null,
      ),
      equipmentReservations: briefing.equipmentReservations,
      clientContacts: [...briefing.clientContacts]
        .filter((row) => String(row.status) !== "removed")
        .sort((a, b) => Number(b.isPrimary ?? 0) - Number(a.isPrimary ?? 0)),
      packLists: briefing.packLists,
      packListItems: briefing.packListItems,
      dishes: briefing.dishes,
      dishIngredients: briefing.dishIngredients,
      dishComponents: briefing.dishComponents,
      componentIngredients: briefing.componentIngredients,
      people: briefing.people,
      vehicles: briefing.vehicles,
      equipments: briefing.equipments,
    };
  }, [briefing]);

  if (briefing === undefined)
    return <CenteredNote>Lighting the estate…</CenteredNote>;
  if (briefing === null || data == null)
    return (
      <CenteredNote>
        This event is unavailable — it may have been removed.
      </CenteredNote>
    );
  const event = briefing.event;

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
